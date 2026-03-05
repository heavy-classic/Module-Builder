const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');
const { parseModuleFile } = require('./src/parser');
const { generateAllPDFs } = require('./src/pdfGenerator');
const { sendUsageNotification } = require('./src/mailer');

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

// job store: jobId → { status, result?, error? }
const jobs = {};
// session store: sessionId → { files, dir, createdAt }
const sessions = {};

// Clean up old sessions and jobs every 15 mins
setInterval(() => {
  const cutoff = Date.now() - 3600000;
  for (const [id, session] of Object.entries(sessions)) {
    if (session.createdAt < cutoff) {
      session.files.forEach(f => fs.unlink(f.path, () => {}));
      try { fs.rmdirSync(session.dir); } catch {}
      delete sessions[id];
    }
  }
  for (const [id, job] of Object.entries(jobs)) {
    if (job.createdAt < cutoff) delete jobs[id];
  }
}, 15 * 60 * 1000);

// POST /upload — accepts file, responds immediately with jobId, processes in background
app.post('/upload', (req, res, next) => {
  upload.single('module')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const jobId = uuidv4();
  jobs[jobId] = { status: 'processing', createdAt: Date.now() };

  // Respond immediately so Render's load balancer doesn't time out
  res.json({ jobId });

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  // Process in background
  processJob(jobId, req.file, ip, userAgent).catch(err => {
    console.error('Job failed:', err);
    jobs[jobId] = { ...jobs[jobId], status: 'error', error: err.message };
  });
});

async function processJob(jobId, file, ip, userAgent) {
  console.log(`[${jobId}] Processing: ${file.originalname} (${(file.size / 1024).toFixed(1)} KB)`);

  const moduleData = await parseModuleFile(file.buffer, file.originalname);
  console.log(`[${jobId}] Parsed: ${moduleData.metadata.name} — ${moduleData.fields.length} fields, ${moduleData.workflow.tasks.length} tasks`);

  const pdfs = await generateAllPDFs(moduleData);
  console.log(`[${jobId}] Generated ${pdfs.length} PDFs`);

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
  jobs[jobId] = {
    ...jobs[jobId],
    status: 'done',
    sessionId,
    moduleName: moduleData.metadata.name,
    modulePrefix: moduleData.metadata.prefix,
    files: files.map(f => ({ name: f.name, title: f.title, description: f.description })),
  };

  sendUsageNotification({ moduleData, filename: file.originalname, fileSize: file.size, ip, userAgent });

  console.log(`[${jobId}] Done`);
}

// GET /job/:jobId — poll for job status
app.get('/job/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  res.json(job);
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
