const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { execFile } = require('child_process');
const multer = require('multer');
const mime = require('mime-types');
const { nanoid } = require('nanoid');
const archiver = require('archiver');

// Rate limiting for download endpoints
const rateLimit = require('express-rate-limit');

// Rate limiter for conversion endpoint: 5 requests per minute per IP
const convertLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many conversion requests from this IP, please try again later.',
});

// Rate limiter for filter endpoints: 20 requests per minute per IP
const filterLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests for filter content from this IP, please try again later.',
});

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// History of recent conversions
const DB_FILE = path.join(__dirname, 'tmp', 'history.json');
let history = [];

async function loadHistory() {
  try {
    await fsp.mkdir(path.dirname(DB_FILE), { recursive: true });
    const data = await fsp.readFile(DB_FILE, 'utf8');
    history = JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // History file doesn't exist yet, which is normal on first run.
      return;
    }
    console.error('Error loading history:', err);
  }
}

let saveChain = Promise.resolve();

/**
 * Atomically updates the history array and saves it to disk.
 * This function serializes all history modifications to prevent race conditions.
 * @param {function(Array): any} updateFn A function that mutates the history array.
 * @returns {Promise<any>} A promise that resolves with the return value of updateFn.
 */
async function saveHistory(updateFn) {
  const newSavePromise = saveChain.catch((err) => {
    // Log the error from the previous failed save, but allow the chain to continue.
    console.error('[saveHistory] A previous history save operation failed, but continuing. Error:', err);
  }).then(async () => {
    const result = updateFn(history);
    await fsp.writeFile(DB_FILE, JSON.stringify(history, null, 2), 'utf8');
    return result;
  });
  saveChain = newSavePromise;
  return newSavePromise;
}

loadHistory().catch(err => console.error('Initialization failed:', err));

function parseTtl(ttl) {
  if (!ttl) return 3600 * 1000; // Default: 1 hour
  const unit = ttl.slice(-1).toLowerCase();
  const value = parseInt(ttl.slice(0, -1), 10);
  if (isNaN(value)) return 3600 * 1000;

  switch (unit) {
    case 'm': return value * 60 * 1000;
    case 'h': return value * 3600 * 1000;
    case 'd': return value * 24 * 3600 * 1000;
    case 'w': return value * 7 * 24 * 3600 * 1000;
    case 'M': return value * 30 * 24 * 3600 * 1000; // Approx. 30 days
    default: return 3600 * 1000;
  }
}

// Time to keep history and files, in milliseconds.
const HISTORY_EXPIRATION_MS = parseTtl(process.env.HISTORY_TTL);

// JSON body parsing for API endpoints
app.use(express.json());

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Upload handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 10MB, max 10 files
  fileFilter: (req, file, cb) => {
    const allowed = ['text/markdown', 'text/plain', 'application/octet-stream'];
    if (allowed.includes(file.mimetype) || (file.originalname || '').toLowerCase().endsWith('.md')) {
      return cb(null, true);
    }
    cb(new Error('Only .md files are allowed'));
  },
});

const MAX_FILE_NAME_LENGTH = 255;

function sanitizeBaseName(name) {
  // Ensure name is a string, truncate to a reasonable length (e.g., 255)
  name = typeof name === 'string' ? name : String(name);
  if (name.length > 255) {
    name = name.slice(0, 255);
  }
  // Replace any disallowed character with underscore without regex backtracking
  let out = '';
  for (let i = 0; i < name.length; i++) {
    const ch = name[i];
    const isAllowed =
      (ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '.' || ch === '_' || ch === '-';
    out += isAllowed ? ch : '_';
  }
  return out;
}

function stripTrailingDelimiters(name) {
  name = typeof name === 'string' ? name : String(name);
  // Remove trailing underscores, dots, or hyphens from a base filename
  let end = name.length;
  while (end > 0) {
    const ch = name.charAt(end - 1);
    if (ch === '_' || ch === '-' || ch === '.') {
      end--;
    } else {
      break;
    }
  }
  return name.slice(0, end);
}
function collapseUnderscores(name) {
  // Ensure string input and cap effective length
  name = typeof name === 'string' ? name : String(name);
  if (!Number.isSafeInteger(name.length) || name.length > MAX_FILE_NAME_LENGTH) {
    name = name.slice(0, MAX_FILE_NAME_LENGTH);
  }
  // Collapse multiple underscores into a single underscore without regex
  let out = '';
  let prevUnderscore = false;
  const max = Math.min(name.length, MAX_FILE_NAME_LENGTH);
  for (let i = 0; i < max; i++) {
    const ch = name[i];
    if (ch === '_') {
      if (!prevUnderscore) out += '_';
      prevUnderscore = true;
    } else {
      out += ch;
      prevUnderscore = false;
    }
  }
  return out;
}

// Custom filter directory path
const CUSTOM_FILTER_DIR = path.join(__dirname, 'tmp', 'custom-filters');
const CUSTOM_FILTER_CONFIG_FILE = path.join(CUSTOM_FILTER_DIR, '.config.json');

// In-memory cache for custom filter config to avoid redundant I/O
let cachedCustomFilterConfig = null;
let customFilterConfigLoaded = false;

// Promise chain to serialize filter save operations (prevents race conditions)
let filterSaveChain = Promise.resolve();

/**
 * Get the default filter.lua path
 * @returns {string} Path to the default filter
 */
function getDefaultFilterPath() {
  // Determine the filter.lua path: prefer /app/filter.lua (Docker/override),
  // fall back to server/scripts/filter.lua for local development
  let linebreaksPath = '/app/filter.lua';
  if (!fs.existsSync(linebreaksPath)) {
    const scriptsPath = path.join(__dirname, 'scripts', 'filter.lua');
    if (fs.existsSync(scriptsPath)) {
      linebreaksPath = scriptsPath;
    }
    // If none found, still use /app/filter.lua and let pandoc handle the error
  }
  return linebreaksPath;
}

/**
 * Validates the custom filter config object.
 * @param {object} config - The config object to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function validateCustomFilterConfig(config) {
  // Validate config structure
  if (!config || typeof config !== 'object') {
    console.warn(`Invalid config file format: expected object, got ${typeof config}`);
    return false;
  }

  // Validate required properties with correct types
  if (typeof config.name !== 'string' || !config.name.trim()) {
    console.warn('Invalid config: missing or invalid "name" property');
    return false;
  }

  if (typeof config.mode !== 'string' || (config.mode !== 'override' && config.mode !== 'additional')) {
    console.warn('Invalid config: missing or invalid "mode" property (must be "override" or "additional")');
    return false;
  }

  if (typeof config.enabled !== 'boolean') {
    console.warn('Invalid config: missing or invalid "enabled" property (must be boolean)');
    return false;
  }

  return true;
}

/**
 * Load custom filter config from disk
 * @returns {Promise<{name: string, mode: string, enabled: boolean} | null>}
 */
async function loadCustomFilterConfig() {
  if (customFilterConfigLoaded) {
    return cachedCustomFilterConfig;
  }

  try {
    const configData = await fsp.readFile(CUSTOM_FILTER_CONFIG_FILE, 'utf8');
    const config = JSON.parse(configData);
    
    if (!validateCustomFilterConfig(config)) {
      cachedCustomFilterConfig = null;
      customFilterConfigLoaded = true;
      return null;
    }
    
    cachedCustomFilterConfig = config;
    customFilterConfigLoaded = true;
    return config;
  } catch (err) {
    if (err.code === 'ENOENT') {
      cachedCustomFilterConfig = null;
      customFilterConfigLoaded = true;
      return null;
    }
    // JSON parse errors or other errors
    console.error('Error loading custom filter config:', err);
    // Don't cache on unexpected errors to allow retry
    return null; // Return null instead of throwing to allow system to continue
  }
}

/**
 * Save custom filter config to disk
 * @param {object} config - Config object with name, mode, enabled
 */
async function saveCustomFilterConfig(config) {
  // Validate before saving to ensure cache and disk remain consistent with rules
  if (!validateCustomFilterConfig(config)) {
    throw new Error('Invalid custom filter configuration');
  }
  await fsp.mkdir(CUSTOM_FILTER_DIR, { recursive: true });
  await fsp.writeFile(CUSTOM_FILTER_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  // Update cache after successful write
  cachedCustomFilterConfig = config;
  customFilterConfigLoaded = true;
}

/**
 * Atomically performs a filter save operation, serializing all modifications
 * to prevent race conditions. This function ensures that filter save operations
 * execute one at a time, maintaining consistency between the config file and filter files.
 * @param {function(): Promise<any>} saveFn A function that performs the filter save operation
 * @returns {Promise<any>} A promise that resolves with the return value of saveFn
 */
async function saveCustomFilter(saveFn) {
  const newSavePromise = filterSaveChain.catch((err) => {
    // Log the error from the previous failed save, but allow the chain to continue
    console.error('[saveCustomFilter] A previous filter save operation failed, but continuing. Error:', err);
  }).then(async () => {
    return await saveFn();
  });
  filterSaveChain = newSavePromise;
  return newSavePromise;
}

function runPandoc({
  cwd,
  mdFileName,
  watermarkPath,
  customFilterPath,
  filterMode,
  orientation,
  paperSize,
}) {
  return new Promise((resolve, reject) => {
    const inputPath = path.join(cwd, mdFileName);
    let baseRaw = mdFileName;
    if (typeof mdFileName === 'string' && mdFileName.toLowerCase().endsWith('.md')) {
      baseRaw = mdFileName.slice(0, -3);
    }
    const base = collapseUnderscores(stripTrailingDelimiters(baseRaw)) || baseRaw;
    const outDir = path.join(cwd, 'pdf_output');
    const outFile = path.join(outDir, `${base}.pdf`);

    const args = [inputPath];

    // Handle filter logic based on custom filter mode
    if (customFilterPath && filterMode === 'override') {
      // Override mode: use only custom filter, skip default
      args.push('--lua-filter', customFilterPath);
    } else {
      // For all other cases, the default filter is included.
      const defaultFilterPath = getDefaultFilterPath();
      args.push('--lua-filter', defaultFilterPath);

      // If in 'additional' mode, add the custom filter after the default one.
      if (customFilterPath && filterMode === 'additional') {
        args.push('--lua-filter', customFilterPath);
      }
    }

    args.push(
      '-o', outFile,
      '--pdf-engine=xelatex',
      '-V', 'geometry:margin=1in',
      '-V', `papersize:${paperSize || 'letter'}`,
      '-V', 'mainfont=Libertinus Serif',
      '-V', 'monofont=Libertinus Mono',
      '--variable=documentclass:article',
      '--variable=parskip:12pt',
    );

    if (orientation === 'landscape') {
      args.push('-V', 'geometry:landscape');
    }

    if (watermarkPath) {
      args.push('-H', watermarkPath);
    }

    fs.mkdirSync(outDir, { recursive: true });

    // Ensure xelatex can find our vendored draftwatermark.sty
    const execOpts = {
      cwd,
      env: {
        ...process.env,
        // Prepend /app/tex to TEXINPUTS. The double-colon at the end ensures
        // that the default search paths are still used, which includes the cwd.
        TEXINPUTS: `/app/tex:${process.env.TEXINPUTS || ''}:`,
      },
    };

    const child = execFile('pandoc', args, execOpts, (err) => {
      if (err) return reject(err);
      resolve(outFile);
    });

    child.stderr?.on('data', (d) => process.stderr.write(d));
    child.stdout?.on('data', (d) => process.stdout.write(d));
  });
}

// GET /api/filter/default - Get the default filter content
app.get('/api/filter/default', filterLimiter, async (req, res) => {
  try {
    const defaultFilterPath = getDefaultFilterPath();
    let content = '';
    try {
      content = await fsp.readFile(defaultFilterPath, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      // File doesn't exist, return empty string
    }
    res.setHeader('Content-Type', 'text/plain');
    res.send(content);
  } catch (err) {
    console.error('Error reading default filter:', err);
    res.status(500).json({ error: 'Failed to read default filter', details: err.message });
  }
});

// GET /api/filter/custom - Get the custom filter config and content
app.get('/api/filter/custom', filterLimiter, async (req, res) => {
  try {
    const config = await loadCustomFilterConfig();
    if (!config) {
      return res.json({ enabled: false });
    }

    // Load the filter code
    const filterFileName = sanitizeBaseName(config.name);
    const filterFilePath = path.join(CUSTOM_FILTER_DIR, `${filterFileName}.lua`);
    let code = '';
    try {
      code = await fsp.readFile(filterFilePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.error(`Custom filter file not found: ${filterFilePath}`);
        return res.status(404).json({ error: `Custom filter file '${config.name}.lua' not found on server.` });
      }
      throw err;
    }

    res.json({
      name: config.name,
      code: code,
      mode: config.mode,
      enabled: config.enabled || false
    });
  } catch (err) {
    console.error('Error reading custom filter:', err);
    res.status(500).json({ error: 'Failed to read custom filter', details: err.message });
  }
});

// POST /api/filter/save - Save a custom filter
app.post('/api/filter/save', filterLimiter, async (req, res) => {
  try {
    // Use saveCustomFilter to serialize this operation and prevent race conditions
    await saveCustomFilter(async () => {
      const { name, code, mode, enabled } = req.body;

      // Validate enabled field type
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'The `enabled` field must be a boolean if provided' });
        return;
      }

      // Validate mode if provided
      if (mode && !['override', 'additional'].includes(mode)) {
        res.status(400).json({ error: 'Filter mode must be "override" or "additional"' });
        return;
      }

      // When disabling (enabled=false), allow empty name/code
      // Load existing config to get the name if not provided
      let sanitizedName = '';
      let filterConfig = null;

      if (enabled === false) {
        // Disabling: allow empty name/code, load existing config if name not provided
        if (name && typeof name === 'string' && name.trim() !== '') {
          sanitizedName = sanitizeBaseName(name.trim());
          if (!sanitizedName || sanitizedName.length === 0) {
            res.status(400).json({ error: 'Invalid filter name' });
            return;
          }
        } else {
          // Load existing config to get the name
          filterConfig = await loadCustomFilterConfig();
          if (!filterConfig || !filterConfig.name) {
            res.status(400).json({ error: 'No existing filter found to disable' });
            return;
          }
          sanitizedName = filterConfig.name;
        }
      } else {
        // Enabling or creating: require name and code
        if (!name || typeof name !== 'string' || name.trim() === '') {
          res.status(400).json({ error: 'Filter name is required' });
          return;
        }
        if (!code || typeof code !== 'string' || code.trim() === '') {
          res.status(400).json({ error: 'Filter code is required and cannot be empty' });
          return;
        }
        sanitizedName = sanitizeBaseName(name.trim());
        if (!sanitizedName || sanitizedName.length === 0) {
          res.status(400).json({ error: 'Invalid filter name' });
          return;
        }
      }

      // Load existing config if not already loaded
      if (!filterConfig) {
        filterConfig = await loadCustomFilterConfig();
      }

      // Create custom filter directory if it doesn't exist
      // If the filter name is changing, delete the old file to prevent orphans
      if (filterConfig?.name && filterConfig.name !== sanitizedName) {
        const oldFilterPath = path.join(CUSTOM_FILTER_DIR, `${filterConfig.name}.lua`);
        try {
          await fsp.unlink(oldFilterPath);
        } catch (err) {
          // It's okay if the file doesn't exist, but warn on other errors.
          if (err.code !== 'ENOENT') {
            console.warn(`Could not delete old filter file: ${oldFilterPath}`, err);
          }
        }
      }

      await fsp.mkdir(CUSTOM_FILTER_DIR, { recursive: true });

      // Save filter file (only if code is provided and non-empty)
      const filterFilePath = path.join(CUSTOM_FILTER_DIR, `${sanitizedName}.lua`);
      if (code && typeof code === 'string' && code.trim() !== '') {
        await fsp.writeFile(filterFilePath, code, 'utf8');
      }

      // Save config
      const updatedConfig = {
        name: sanitizedName,
        mode: mode || filterConfig?.mode || 'additional',
        enabled: enabled !== undefined ? enabled : (filterConfig?.enabled !== undefined ? filterConfig.enabled : true)
      };
      await saveCustomFilterConfig(updatedConfig);

      res.json({ success: true, name: sanitizedName });
    });
  } catch (err) {
    console.error('Error saving custom filter:', err);
    res.status(500).json({ error: 'Failed to save custom filter', details: err.message });
  }
});

app.post('/convert', convertLimiter, upload.array('files'), async (req, res) => {
  const { orientation: rawOrientation, paperSize: rawPaperSize } = req.body;
  // Validate user input to prevent pandoc argument injection.
  const orientation = ['portrait', 'landscape'].includes(rawOrientation) ? rawOrientation : 'portrait';
  const paperSize = ['letter', 'legal', 'tabloid', 'a3', 'a4', 'a5'].includes(rawPaperSize) ? rawPaperSize : 'letter';

  const watermark = String(req.body?.watermark || '').toLowerCase() === 'true';
  const rawWatermarkText = String(req.body?.watermarkText || '');
  const watermarkText = (rawWatermarkText.trim() || 'DRAFT');
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const id = nanoid(10);
  const workDir = path.join(__dirname, 'tmp', id);
  let watermarkPath = null;
  let customFilterPath = null;
  let filterMode = null;

  try {
    await fsp.mkdir(workDir, { recursive: true });

    // Check for custom filter
    const customFilterConfig = await loadCustomFilterConfig();
    if (customFilterConfig && customFilterConfig.enabled) {
      const filterFileName = sanitizeBaseName(customFilterConfig.name);
      const savedFilterPath = path.join(CUSTOM_FILTER_DIR, `${filterFileName}.lua`);
      
      // Verify filter file exists and use it directly (no need to copy to work directory)
      try {
        await fsp.access(savedFilterPath, fs.constants.R_OK);
        customFilterPath = savedFilterPath;
        filterMode = customFilterConfig.mode || 'additional';
      } catch (err) {
        console.error(`Error applying custom filter '${customFilterConfig.name}':`, err);
        // Re-throw the error to be caught by the main handler,
        // which will fail the request and notify the user.
        throw new Error(`Failed to apply custom filter '${customFilterConfig.name}'.`);
      }
    }

    if (watermark) {
      // Use /tmp for watermark.tex to avoid persisting it to the mounted volume
      const tempWatermarkPath = `/tmp/pandoc-watermark-${id}.tex`;
      const staticWatermarkPath = '/app/watermark.tex';
      let useStaticWatermark = false;
      try {
        await fsp.access(staticWatermarkPath, fs.constants.R_OK);
        useStaticWatermark = true;
      } catch {
        // File doesn't exist or isn't accessible, which is fine. Fall back to dynamic generation.
      }

      if (useStaticWatermark) {
        // If a static override exists, copy it to temp location. A failure here will be caught
        // by the main endpoint handler and correctly fail the request.
        await fsp.copyFile(staticWatermarkPath, tempWatermarkPath);
      } else {
        // Otherwise, generate the watermark dynamically based on user text.
        const escapeLatex = (s) => s
          .replace(/\\/g, '\\\\')
          .replace(/\{/g, '\\{')
          .replace(/\}/g, '\\}')
          .replace(/\^/g, '\\^{}')
          .replace(/\~/g, '\\~{}')
          .replace(/\$/g, '\\$')
          .replace(/#/g, '\\#')
          .replace(/%/g, '\\%')
          .replace(/&/g, '\\&')
          .replace(/_/g, '\\_');

        const escaped = escapeLatex(watermarkText).slice(0, 200); // limit length
        const customWatermark = [
          '\\usepackage{draftwatermark}',
          `\\SetWatermarkText{${escaped || 'DRAFT'}}`,
          '\\SetWatermarkScale{1.25}',
          '\\SetWatermarkColor[gray]{0.85}',
          ''
        ].join('\n');
        await fsp.writeFile(tempWatermarkPath, customWatermark, 'utf8');
      }
      watermarkPath = tempWatermarkPath;
    }

    const results = [];
    for (const file of req.files) {
      try {
        const original = sanitizeBaseName(file.originalname || 'document.md');
        const mdName = original.toLowerCase().endsWith('.md') ? original : `${original}.md`;
        const mdPath = path.join(workDir, mdName);
        await fsp.writeFile(mdPath, file.buffer);

        const pdfPath = await runPandoc({
          cwd: workDir,
          mdFileName: mdName,
          watermarkPath,
          customFilterPath,
          filterMode,
          orientation,
          paperSize,
        });
        results.push({
            name: path.basename(pdfPath),
            originalName: file.originalname,
            success: true
        });
      } catch (err) {
          results.push({
              originalName: file.originalname,
              success: false,
              error: err.message
          })
      }
    }

    await saveHistory(h => h.push({
        id,
        results,
        watermark,
        watermarkText: watermark ? watermarkText : undefined,
        expiresAt: HISTORY_EXPIRATION_MS > 0 ? Date.now() + HISTORY_EXPIRATION_MS : undefined,
        workDir,
    }));
    
    // Clean up temporary watermark file (if created)
    if (watermarkPath) {
      try { await fsp.unlink(watermarkPath); } catch (_) {}
    }
    
    res.json({ id, results });

  } catch (err) {
    // Best-effort cleanup on catastrophic failure
    try { await fsp.rm(workDir, { recursive: true, force: true }); } catch (_) {}
    if (watermarkPath) {
      try { await fsp.unlink(watermarkPath); } catch (_) {}
    }
    res.status(500).json({ error: 'Conversion process failed', details: String(err && err.message || err) });
  }
});

app.get('/history', (req, res) => {
  const now = Date.now();
  const filtered = history.filter(h => !h.expiresAt || h.expiresAt > now);
  res.json(filtered.map(h => ({
      id: h.id,
      results: h.results,
      watermark: h.watermark,
      watermarkText: h.watermarkText,
  })));
});

// Rate limiter for download endpoints: 20 requests per minute per IP
const downloadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many download requests from this IP, please try again later.',
});

app.get('/download/:id/:filename', downloadLimiter, (req, res) => {
  const { id, filename } = req.params;
  // Sanitize to prevent path traversal
  const saneId = sanitizeBaseName(id);
  const saneFilename = sanitizeBaseName(filename);

  if (saneId !== id || saneFilename !== filename) {
    return res.status(400).send('Invalid request');
  }

  const workDir = path.join(__dirname, 'tmp', saneId);
  const pdfPath = path.join(workDir, 'pdf_output', saneFilename);

  // Check file exists before streaming
  fs.access(pdfPath, fs.constants.R_OK, (err) => {
    if (err) {
      return res.status(404).send('File not found or not readable');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${saneFilename}"`);
    fs.createReadStream(pdfPath).pipe(res);
  });
});

app.get('/download-zip/:id', downloadLimiter, (req, res) => {
    const { id } = req.params;
    const saneId = sanitizeBaseName(id);

    if (saneId !== id) {
        return res.status(400).send('Invalid request');
    }

    const job = history.find(h => h.id === saneId);
    if (!job) {
        return res.status(404).send('Job not found');
    }

    const successfulFiles = job.results.filter(r => r.success);
    if (successfulFiles.length === 0) {
        return res.status(404).send('No successful conversions to download.');
    }

    const zip = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
    });

    zip.on('warning', (err) => {
        if (err.code === 'ENOENT') {
            console.warn('[zip] Warning:', err);
        } else {
            throw err;
        }
    });

    zip.on('error', (err) => {
        console.error('[zip] Error:', err);
        try { typeof zip.abort === 'function' && zip.abort(); } catch (_) {}
        if (!res.headersSent) {
            return res.status(500).send('Error creating ZIP');
        }
        // If headers already sent, terminate the response stream
        try { res.destroy(err); } catch (_) {}
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="conversion_${saneId}.zip"`);
    zip.pipe(res);

    const pdfOutDir = path.join(job.workDir, 'pdf_output');
    for (const file of successfulFiles) {
        const pdfPath = path.join(pdfOutDir, file.name);
        zip.file(pdfPath, { name: file.name });
    }

    zip.finalize();
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});

// Cleanup interval
if (HISTORY_EXPIRATION_MS > 0) {
    setInterval(async () => {
        try {
            const toDelete = await saveHistory(h => {
                const now = Date.now();
                const expired = [];
                let writeIndex = 0;
                for (let readIndex = 0; readIndex < h.length; readIndex++) {
                    const item = h[readIndex];
                    if (item.expiresAt && item.expiresAt <= now) {
                        expired.push(item);
                    } else {
                        if (writeIndex !== readIndex) {
                            h[writeIndex] = item;
                        }
                        writeIndex++;
                    }
                }

                if (writeIndex < h.length) {
                    h.length = writeIndex;
                }
                return expired;
            });

            if (toDelete && toDelete.length > 0) {
                console.log(`[cleanup] Deleting ${toDelete.length} expired history items`);
                for (const h of toDelete) {
                    fsp.rm(h.workDir, { recursive: true, force: true }).catch(err => {
                        console.error(`[cleanup] Error deleting files for ${h.id}:`, err);
                    });
                }
            }
        } catch (err) {
            console.error('[cleanup] Cleanup job failed:', err);
        }
    }, 60000); // Run every minute
}

