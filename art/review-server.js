#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ART_DIR = path.join(ROOT, 'art');
const STATE_PATH = path.join(ART_DIR, 'art-review', 'state.json');
const REVIEW_ROOT = path.join(ART_DIR, 'art-review');
const MANIFEST_PATH = path.join(ART_DIR, 'manifest.json');
const PORT = Number(process.env.ART_REVIEW_PORT || process.argv[2] || 4174);
const HOST = process.env.ART_REVIEW_HOST || '127.0.0.1';
const EMPTY_STATE = () => ({ version: 1, jobs: [], decisions: {}, openQuestionAnswers: {} });
const LOCKS = new Set(['Face', 'Hair', 'Pose', 'Clothing', 'Body position', 'Camera/crop', 'Lighting', 'Background', 'Art style']);

let generationQueue = [];
let activeJob = null;
let lastJob = null;

function readState() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    state.jobs = Array.isArray(state.jobs) ? state.jobs : [];
    state.decisions = state.decisions && typeof state.decisions === 'object' ? state.decisions : {};
    state.openQuestionAnswers = state.openQuestionAnswers && typeof state.openQuestionAnswers === 'object'
      ? state.openQuestionAnswers : {};
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return EMPTY_STATE();
    throw error;
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const temp = STATE_PATH + '.review-server.tmp';
  fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(temp, STATE_PATH);
}

function normalizedCandidatePath(candidate) {
  if (typeof candidate === 'string') return candidate;
  return candidate && (candidate.path || candidate.relativePath || candidate.outputPath || candidate.absolutePath);
}

function candidateInsideReviewRoot(relativePath) {
  if (!relativePath) return null;
  const absolute = path.resolve(ROOT, relativePath);
  const relative = path.relative(REVIEW_ROOT, absolute);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null;
  return absolute;
}

function projectRelative(absolutePath) {
  return path.relative(ROOT, absolutePath).replace(/\\/g, '/');
}

function hydratedStateFromDisk(state = readState()) {
  // Load these from the generator so PNG validation and transparency detection have
  // one implementation for both automated state writes and manual file discovery.
  const { pngDimensions, hasNonOpaqueAlpha } = require('./generate.js');
  const hydrated = Object.assign({}, state, {
    jobs: (state.jobs || []).map(job => {
      const expected = Array.isArray(job.expectedOutputs) && job.expectedOutputs.length
        ? job.expectedOutputs
        : (job.outputs || []);
      const outputs = [];
      expected.forEach((candidate, index) => {
        const relativePath = normalizedCandidatePath(candidate);
        const absolutePath = candidateInsideReviewRoot(relativePath);
        if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return;
        try {
          const png = fs.readFileSync(absolutePath);
          const dimensions = pngDimensions(png);
          if (!dimensions.width || !dimensions.height) return;
          const descriptor = typeof candidate === 'string' ? { path: candidate } : candidate;
          outputs.push(Object.assign({}, descriptor, {
            id: descriptor.id || `${job.assetId}:${job.batch || job.id}:${index + 1}`,
            path: projectRelative(absolutePath),
            width: dimensions.width,
            height: dimensions.height,
            hasTransparency: hasNonOpaqueAlpha(png),
          }));
        } catch (_) {
          // An incomplete copy or a non-PNG with a .png suffix remains invisible to
          // review until it can be decoded successfully on a later request.
        }
      });
      return Object.assign({}, job, {
        outputs,
        status: outputs.length ? 'candidates-ready'
          : (Array.isArray(job.expectedOutputs) && job.expectedOutputs.length ? 'prepared' : job.status),
      });
    }),
  });

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  hydrated.assetStatuses = {};
  (manifest.assets || []).forEach(asset => {
    const decision = hydrated.decisions && hydrated.decisions[asset.id];
    const available = hydrated.jobs.filter(job => job.assetId === asset.id).flatMap(job => job.outputs || []);
    const availableIds = new Set(available.flatMap(output => [output.id, output.path]).filter(Boolean));
    const selected = (decision && Array.isArray(decision.candidateIds) && decision.candidateIds.length)
      ? decision.candidateIds
      : [decision && (decision.candidateId || decision.candidatePath)].filter(Boolean);
    const selectedAvailable = selected.length > 0 && selected.every(value => availableIds.has(value));
    const approved = asset.decision === 'keep-existing'
      || (decision && decision.choice === 'keep-existing')
      || (selectedAvailable && decision.choice === 'candidate' && (decision.action === 'use-as-is' || decision.useAsIs === true));
    const ready = available.length > 0;
    hydrated.assetStatuses[asset.id] = approved ? 'Approved' : ready ? 'Candidates Ready' : 'Needs Generation';
  });
  hydrated.scannedAt = new Date().toISOString();
  return hydrated;
}

function refreshStateFromDisk() {
  const stored = readState();
  const hydrated = hydratedStateFromDisk(stored);
  let changed = false;
  const persistedJobs = stored.jobs.map((job, index) => {
    // Prepared manual jobs retain expectedOutputs as their append-only plan; outputs
    // are the current validated realization of that plan. Persisting discovery lets a
    // subsequent revision resolve its selected parent without an import operation.
    if (!Array.isArray(job.expectedOutputs) || !job.expectedOutputs.length) return job;
    const next = hydrated.jobs[index];
    if (JSON.stringify(job.outputs || []) === JSON.stringify(next.outputs || []) && job.status === next.status) return job;
    changed = true;
    return Object.assign({}, job, { outputs: next.outputs, status: next.status });
  });
  // The generator is the sole writer while a preparation child is active. Avoid a
  // read/modify/write race that could otherwise discard its newly appended job.
  if (changed && !activeJob) writeState(Object.assign({}, stored, { jobs: persistedJobs }));
  return hydrated;
}

async function stateForReview() {
  const hydrated = refreshStateFromDisk();
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const { previewManualJobs } = require('./generate.js');
  hydrated.preparations = {};
  await Promise.all((manifest.assets || []).map(async asset => {
    if (asset.decision === 'keep-existing' || Number(asset.candidates ?? asset.candidatesEach ?? 1) === 0) return;
    try {
      const plan = await previewManualJobs({ assetId: asset.id });
      if (plan) hydrated.preparations[asset.id] = plan;
    } catch (error) {
      // Phase-gated assets cannot have a paste-ready prompt until their approved
      // reference exists. Expose that fact instead of failing the entire review page.
      hydrated.preparations[asset.id] = {
        assetId: asset.id,
        status: hydrated.assetStatuses[asset.id],
        unavailableReason: error.message,
        jobs: [],
      };
    }
  }));
  return hydrated;
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error('Request body is too large.'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (_) { reject(new Error('Invalid JSON request body.')); }
    });
    req.on('error', reject);
  });
}

function safeFile(relativePath) {
  const resolved = path.resolve(ROOT, relativePath.replace(/^[/\\]+/, ''));
  return resolved === ROOT || resolved.startsWith(ROOT + path.sep) ? resolved : null;
}

function serveFile(res, relativePath) {
  const file = safeFile(relativePath);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    sendJson(res, 404, { error: 'Not found.' });
    return;
  }
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.svg': 'image/svg+xml',
  };
  res.writeHead(200, {
    'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': fs.statSync(file).size,
    'Cache-Control': file.endsWith('.png') ? 'no-cache' : 'no-store',
  });
  fs.createReadStream(file).pipe(res);
}

function publicQueueStatus() {
  return {
    active: activeJob && { id: activeJob.id, assetId: activeJob.assetId, kind: activeJob.kind, startedAt: activeJob.startedAt },
    queued: generationQueue.map(({ id, assetId, kind }) => ({ id, assetId, kind })),
    last: lastJob,
  };
}

function startNextJob() {
  if (activeJob || !generationQueue.length) return;
  activeJob = generationQueue.shift();
  activeJob.startedAt = new Date().toISOString();
  const args = [path.join('art', 'generate.js'), '--asset', activeJob.assetId, '--kind', activeJob.kind];
  if (activeJob.parent) args.push('--parent', activeJob.parent);
  if (activeJob.instructions) args.push('--instructions', activeJob.instructions);
  if (activeJob.locks.length) args.push('--locks', activeJob.locks.join(','));
  const child = spawn(process.execPath, args, { cwd: ROOT, windowsHide: true });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.on('error', error => finishJob(1, output + '\n' + error.message));
  child.on('close', code => finishJob(code, output));
}

function finishJob(code, output) {
  if (!activeJob) return;
  lastJob = {
    id: activeJob.id,
    assetId: activeJob.assetId,
    kind: activeJob.kind,
    ok: code === 0,
    finishedAt: new Date().toISOString(),
    output: String(output || '').trim().slice(-4000),
  };
  activeJob = null;
  startNextJob();
}

function queueJob(body) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ART_DIR, 'manifest.json'), 'utf8'));
  const kind = String(body.kind || '');
  const assetId = String(body.assetId || '');
  const asset = manifest.assets.find(item => item.id === assetId);
  if (!asset) throw new Error('Unknown assetId.');
  if (asset.decision === 'keep-existing' || Number(asset.candidates ?? asset.candidatesEach ?? 1) === 0) {
    throw new Error(`${asset.name} is fixed to Keep Existing and cannot be queued for generation.`);
  }
  if (!['generate', 'revise', 'new-direction'].includes(kind)) throw new Error('Unknown job kind.');
  const instructions = String(body.instructions || '').trim();
  const parent = String(body.parent || '').trim();
  if (kind === 'revise' && (!parent || !instructions)) throw new Error('A revision needs a parent candidate and edit instructions.');
  if (kind === 'new-direction' && !instructions) throw new Error('A new direction description is required.');
  const locks = Array.isArray(body.locks) ? body.locks.map(String).filter(lock => LOCKS.has(lock)) : [];
  const item = {
    id: 'queued-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    assetId, kind, parent, instructions, locks,
  };
  generationQueue.push(item);
  startNextJob();
  return item;
}

async function applyArtwork() {
  const applyPath = path.join(ART_DIR, 'apply.js');
  if (!fs.existsSync(applyPath)) throw new Error('art/apply.js is not available.');
  delete require.cache[require.resolve(applyPath)];
  const applyModule = require(applyPath);
  if (!applyModule || typeof applyModule.applySelectedArtwork !== 'function') {
    throw new Error('art/apply.js does not export applySelectedArtwork().');
  }
  return applyModule.applySelectedArtwork({
    rootDir: ROOT,
    statePath: STATE_PATH,
    manifestPath: MANIFEST_PATH,
    state: refreshStateFromDisk(),
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/art-review.html')) {
      return serveFile(res, 'art-review.html');
    }
    if (req.method === 'GET' && url.pathname === '/index.html') {
      return serveFile(res, 'index.html');
    }
    if (req.method === 'GET' && url.pathname === '/api/manifest') {
      return serveFile(res, 'art/manifest.json');
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      return sendJson(res, 200, await stateForReview());
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return sendJson(res, 200, publicQueueStatus());
    }
    if (req.method === 'GET' && url.pathname === '/assets/manifest.json' && !fs.existsSync(path.join(ROOT, 'assets', 'manifest.json'))) {
      return sendJson(res, 200, { version: 1, assets: {} });
    }
    if (req.method === 'POST' && url.pathname === '/api/jobs') {
      const item = queueJob(await readJson(req));
      return sendJson(res, 202, { queued: true, job: { id: item.id, assetId: item.assetId, kind: item.kind }, status: publicQueueStatus() });
    }
    if (req.method === 'POST' && url.pathname === '/api/decisions') {
      const body = await readJson(req);
      const assetId = String(body.assetId || '');
      const manifest = JSON.parse(fs.readFileSync(path.join(ART_DIR, 'manifest.json'), 'utf8'));
      if (!manifest.assets.some(asset => asset.id === assetId)) throw new Error('Unknown assetId.');
      if (!body.decision || typeof body.decision !== 'object') throw new Error('Missing decision.');
      refreshStateFromDisk();
      const state = readState();
      state.decisions[assetId] = Object.assign({}, body.decision, { updatedAt: new Date().toISOString() });
      writeState(state);
      return sendJson(res, 200, { saved: true, decision: state.decisions[assetId] });
    }
    if (req.method === 'POST' && url.pathname === '/api/open-questions') {
      const body = await readJson(req);
      const questionId = String(body.questionId || '');
      const answer = String(body.answer || '').trim();
      const manifest = JSON.parse(fs.readFileSync(path.join(ART_DIR, 'manifest.json'), 'utf8'));
      if (!manifest.openQuestions.some(question => question.id === questionId)) throw new Error('Unknown open question.');
      const state = readState();
      state.openQuestionAnswers[questionId] = answer;
      writeState(state);
      return sendJson(res, 200, { saved: true, answer });
    }
    if (req.method === 'POST' && url.pathname === '/api/apply') {
      return sendJson(res, 200, { applied: true, result: await applyArtwork() });
    }
    if (req.method === 'GET' && (
      url.pathname === '/styles.css' || url.pathname === '/art/review.css' ||
      url.pathname === '/art/review.js' || url.pathname.startsWith('/js/') ||
      url.pathname.startsWith('/assets/') || url.pathname.startsWith('/art/art-review/')
    )) {
      return serveFile(res, decodeURIComponent(url.pathname));
    }
    sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Agent Briefing art review: http://${HOST}:${PORT}/art-review.html`);
  console.log('Manual preparation jobs run one at a time; candidate PNGs are detected from disk on refresh.');
});

module.exports = { server, readState, writeState, hydratedStateFromDisk, refreshStateFromDisk, stateForReview };
