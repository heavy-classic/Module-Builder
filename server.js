const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');
const { parseModuleFile } = require('./src/parser');
const { generateAllPDFs } = require('./src/pdfGenerator');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xml' || ext === '.zip') cb(null, true);
    else cb(new Error('Only .xml and .zip files are accepted'));
  },
});

app.use(express.static(path.join(__dirname, 'public')));

// In-memory session store: sessionId → { files: [{name, path, description}], createdAt }
const sessions = {};

// Clean up sessions older than 1 hour
setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [id, session] of Object.entries(sessions)) {
    if (session.createdAt < cutoff) {
      session.files.forEach(f => fs.unlink(f.path, () => {}));
      try { fs.rmdirSync(session.dir); } catch {}
      delete sessions[id];
    }
  }
}, 15 * 60 * 1000);

app.post('/upload', (req, res, next) => {
  upload.single('module')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  try {
    console.log(`Processing: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);

    const moduleData = await parseModuleFile(req.file.buffer, req.file.originalname);
    console.log(`Parsed module: ${moduleData.metadata.name} [${moduleData.metadata.prefix}]`);
    console.log(`  Fields: ${moduleData.fields.length}, Tasks: ${moduleData.workflow.tasks.length}, Rules: ${moduleData.rules.length}`);

    const pdfs = await generateAllPDFs(moduleData);
    console.log(`Generated ${pdfs.length} PDFs`);

    const sessionId = uuidv4();
    const sessionDir = path.join(os.tmpdir(), `devonway-${sessionId}`);
    fs.mkdirSync(sessionDir, { recursive: true });

    const files = [];
    for (const pdf of pdfs) {
      const filePath = path.join(sessionDir, pdf.filename);
      fs.writeFileSync(filePath, pdf.buffer);
      files.push({ name: pdf.filename, description: pdf.description, title: pdf.title, path: filePath });
    }

    sessions[sessionId] = { files, dir: sessionDir, createdAt: Date.now() };

    res.json({
      sessionId,
      moduleName: moduleData.metadata.name,
      modulePrefix: moduleData.metadata.prefix,
      files: files.map(f => ({ name: f.name, title: f.title, description: f.description })),
    });
  } catch (err) {
    console.error('Processing error:', err);
    res.status(500).json({ error: err.message || 'Failed to process module file.' });
  }
});

app.get('/download/:sessionId/:filename', (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) return res.status(404).send('Session expired or not found.');

  const file = session.files.find(f => f.name === req.params.filename);
  if (!file) return res.status(404).send('File not found.');

  res.download(file.path, file.name);
});

app.get('/download-all/:sessionId', (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) return res.status(404).send('Session expired or not found.');

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="module-documentation.zip"');

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', err => res.status(500).send(err.message));
  archive.pipe(res);
  session.files.forEach(f => archive.file(f.path, { name: f.name }));
  archive.finalize();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  DevonWay Module PDF Generator`);
  console.log(`  Running at http://localhost:${PORT}\n`);
});
