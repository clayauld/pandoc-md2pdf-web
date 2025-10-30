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

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// In-memory history of recent conversions
const history = [];

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
    default: return 3600 * 1000;
  }
}

// Time to keep history and files, in milliseconds.
const HISTORY_EXPIRATION_MS = parseTtl(process.env.HISTORY_TTL);

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

function sanitizeBaseName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function stripTrailingDelimiters(name) {
  // Remove trailing underscores, dots, or hyphens from a base filename
  return name.replace(/[_\-.]+$/, '');
}

function collapseUnderscores(name) {
  return name.replace(/_+/g, '_');
}

function runPandoc({ cwd, mdFileName, useWatermark }) {
  return new Promise((resolve, reject) => {
    const inputPath = path.join(cwd, mdFileName);
    const baseRaw = mdFileName.replace(/\.md$/i, '');
    const base = collapseUnderscores(stripTrailingDelimiters(baseRaw)) || baseRaw;
    const outDir = path.join(cwd, 'pdf_output');
    const outFile = path.join(outDir, `${base}.pdf`);

    const args = [
      inputPath,
      '--lua-filter', path.join(cwd, 'linebreaks.lua'),
      '-o', outFile,
      '--pdf-engine=xelatex',
      '-V', 'geometry:margin=1in',
      '-V', 'papersize:letter',
      '-V', 'mainfont=Libertinus Serif',
      '-V', 'monofont=Libertinus Mono',
      '--variable=documentclass:article',
      '--variable=parskip:12pt',
    ];

    if (useWatermark) {
      args.push('-H', path.join(cwd, 'watermark.tex'));
    }

    fs.mkdirSync(outDir, { recursive: true });

    const child = execFile('pandoc', args, { cwd }, (err) => {
      if (err) return reject(err);
      resolve(outFile);
    });

    child.stderr?.on('data', (d) => process.stderr.write(d));
    child.stdout?.on('data', (d) => process.stdout.write(d));
  });
}

app.post('/convert', convertLimiter, upload.array('files'), async (req, res) => {
  const watermark = String(req.body?.watermark || '').toLowerCase() === 'true';
  const rawWatermarkText = String(req.body?.watermarkText || '');
  const watermarkText = (rawWatermarkText.trim() || 'DRAFT');
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const id = nanoid(10);
  const workDir = path.join(__dirname, 'tmp', id);

  try {
    await fsp.mkdir(workDir, { recursive: true });

    // Copy required assets once per batch
    const projectRoot = path.join(__dirname, '..');
    const assets = ['linebreaks.lua', 'watermark.tex'];
    await Promise.all(
      assets.map(async (a) => {
        try {
          await fsp.copyFile(path.join(projectRoot, a), path.join(workDir, a));
        } catch (_) {}
      })
    );

    if (watermark) {
      // Copy vendored draftwatermark.sty into working dir if available
      try {
        await fsp.copyFile(path.join(projectRoot, 'tex', 'draftwatermark.sty'), path.join(workDir, 'draftwatermark.sty'));
      } catch (_) {}
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
      await fsp.writeFile(path.join(workDir, 'watermark.tex'), customWatermark, 'utf8');
    }

    const results = [];
    for (const file of req.files) {
      try {
        const original = sanitizeBaseName(file.originalname || 'document.md');
        const mdName = original.toLowerCase().endsWith('.md') ? original : `${original}.md`;
        const mdPath = path.join(workDir, mdName);
        await fsp.writeFile(mdPath, file.buffer);

        const pdfPath = await runPandoc({ cwd: workDir, mdFileName: mdName, useWatermark: watermark });
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

    history.push({
        id,
        results,
        watermark,
        watermarkText: watermark ? watermarkText : undefined,
        expiresAt: HISTORY_EXPIRATION_MS > 0 ? Date.now() + HISTORY_EXPIRATION_MS : undefined,
        workDir,
    });
    res.json({ id, results });

  } catch (err) {
    // Best-effort cleanup on catastrophic failure
    try { await fsp.rm(workDir, { recursive: true, force: true }); } catch (_) {}
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

app.get('/download-zip/:id', (req, res) => {
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
        throw err;
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
    setInterval(() => {
        const now = Date.now();
        const toKeep = [];
        const toDelete = [];

        for (const h of history) {
            if (h.expiresAt && h.expiresAt <= now) {
                toDelete.push(h);
            } else {
                toKeep.push(h);
            }
        }

        if (toDelete.length > 0) {
            console.log(`[cleanup] Deleting ${toDelete.length} expired history items`);
            history.length = 0;
            history.push(...toKeep);
            // Also delete files from disk
            for (const h of toDelete) {
                fsp.rm(h.workDir, { recursive: true, force: true }).catch(err => {
                    console.error(`[cleanup] Error deleting files for ${h.id}:`, err);
                });
            }
        }
    }, 60000); // Run every minute
}

