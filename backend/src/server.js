const express = require('express');
const { Queue, Worker, Job } = require('bullmq');
const { v4: uuid } = require('uuid');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
app.use(express.json());

// simple file based store for jobs metadata
const DB_FILE = path.join(__dirname, '..', 'db.json');
let db = { jobs: {} };
if (fs.existsSync(DB_FILE)) {
  db = fs.readJsonSync(DB_FILE);
}

function saveDb() {
  fs.writeJsonSync(DB_FILE, db);
}

const queue = new Queue('load-tests', { connection: { host: 'localhost', port: 6379 } });

app.post('/api/tests', async (req, res) => {
  const id = uuid();
  const { url, stages } = req.body;
  db.jobs[id] = { status: 'queued', url, stages };
  saveDb();
  await queue.add(id, { id, url, stages });
  res.status(202).json({ jobId: id });
});

app.get('/api/tests/:id/status', (req, res) => {
  const job = db.jobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json({ status: job.status });
});

app.get('/api/tests/:id/results', (req, res) => {
  const job = db.jobs[req.params.id];
  if (!job || job.status !== 'done') return res.status(404).json({ error: 'not ready' });
  const file = path.join(__dirname, '..', 'results', `${req.params.id}.json`);
  res.download(file);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('API listening on', PORT));

// Worker
const worker = new Worker('load-tests', async job => {
  const { id, url, stages } = job.data;
  db.jobs[id].status = 'running';
  saveDb();
  const scriptsDir = path.join(__dirname, '..', 'scripts');
  const resultsDir = path.join(__dirname, '..', 'results');
  fs.ensureDirSync(scriptsDir);
  fs.ensureDirSync(resultsDir);
  const scriptPath = path.join(scriptsDir, `${id}.js`);
  const script = `import http from 'k6/http';\nexport let options = { stages: ${JSON.stringify(stages)} };\nexport default function () { http.get('${url}'); }`;
  fs.writeFileSync(scriptPath, script);
  const dockerCmd = `docker run --rm -v ${scriptsDir}:/scripts -v ${resultsDir}:/results loadimpact/k6 run /scripts/${id}.js --out json=/results/${id}.json`;
  try {
    execSync(dockerCmd, { stdio: 'inherit' });
    db.jobs[id].status = 'done';
  } catch (e) {
    db.jobs[id].status = 'error';
  }
  saveDb();
});
