const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { execFile } = require('child_process');
const multer = require('multer');
const mime = require('mime-types');
const { nanoid } = require('nanoid');

const app = express();
const PORT = process.env.PORT || 8080;

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Upload handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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

function runPandoc({ cwd, mdFileName, useWatermark }) {
  return new Promise((resolve, reject) => {
    const inputPath = path.join(cwd, mdFileName);
    const base = mdFileName.replace(/\.md$/i, '');
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

app.post('/convert', upload.single('file'), async (req, res) => {
  const watermark = String(req.body?.watermark || '').toLowerCase() === 'true';
  const rawWatermarkText = String(req.body?.watermarkText || '');
  const watermarkText = (rawWatermarkText.trim() || 'DRAFT');
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const id = nanoid(10);
  const workDir = path.join(__dirname, 'tmp', id);

  try {
    await fsp.mkdir(workDir, { recursive: true });

    // Persist uploaded file
    const original = sanitizeBaseName(req.file.originalname || 'document.md');
    const mdName = original.toLowerCase().endsWith('.md') ? original : `${original}.md`;
    const mdPath = path.join(workDir, mdName);
    await fsp.writeFile(mdPath, req.file.buffer);

    // Copy required assets
    const projectRoot = path.join(__dirname, '..');
    const assets = ['linebreaks.lua', 'watermark.tex'];
    await Promise.all(
      assets.map(async (a) => {
        try {
          await fsp.copyFile(path.join(projectRoot, a), path.join(workDir, a));
        } catch (_) {}
      })
    );

    // If watermark is requested, generate a custom watermark.tex with provided text
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

    // Run conversion
    const pdfPath = await runPandoc({ cwd: workDir, mdFileName: mdName, useWatermark: watermark });

    // Stream back PDF
    const filename = path.basename(pdfPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const stream = fs.createReadStream(pdfPath);
    stream.on('close', async () => {
      // Best-effort cleanup
      try { await fsp.rm(workDir, { recursive: true, force: true }); } catch (_) {}
    });
    stream.pipe(res);
  } catch (err) {
    try { await fsp.rm(workDir, { recursive: true, force: true }); } catch (_) {}
    res.status(500).json({ error: 'Conversion failed', details: String(err && err.message || err) });
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});


