/* Apply explicitly approved review candidates to the game's production assets. */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const AVATAR_QUESTION = 'avatar-customization-conflict';
const AVATAR_OVERLAY_ASSETS = [
  'avatar_base',
  'eyes_open',
  'eyes_closed',
  'mouth_closed',
  'mouth_small',
  'mouth_medium',
  'mouth_wide',
];

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw error;
  }
}

function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel);
}

function safePart(value, label) {
  const part = String(value || '');
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(part)) {
    throw new Error(`Unsafe ${label}: ${part || '(empty)'}`);
  }
  return part;
}

function isUseAsIs(decision) {
  if (!decision || decision.choice === 'keep-existing' || decision.choice === 'other') return false;
  return decision.action === 'use-as-is' || decision.useAsIs === true;
}

function outputIndex(state) {
  const byId = new Map();
  const byPath = new Map();
  (state.jobs || []).forEach(job => {
    (job.outputs || []).forEach(output => {
      const item = { job, output };
      if (output.id) byId.set(output.id, item);
      if (output.path) byPath.set(output.path.replace(/\\/g, '/'), item);
    });
  });
  return { byId, byPath };
}

function selectedOutputs(decision, index) {
  const found = [];
  const seen = new Set();
  const add = item => {
    if (!item || seen.has(item.output)) return;
    seen.add(item.output);
    found.push(item);
  };

  (decision.candidateIds || []).forEach(id => add(index.byId.get(id)));
  (decision.candidatePaths || []).forEach(candidatePath => {
    add(index.byPath.get(String(candidatePath).replace(/\\/g, '/')));
  });
  add(index.byId.get(decision.candidateId));
  if (decision.candidatePath) {
    add(index.byPath.get(String(decision.candidatePath).replace(/\\/g, '/')));
  }

  // A grouped candidate is one direction across multiple subjects. Older state files
  // may only name the first member, so recover its siblings from the same job/label.
  if (found.length === 1 && found[0].output.subjectId) {
    const first = found[0];
    (first.job.outputs || []).forEach(output => {
      if (output.subjectId && output.candidateLabel === first.output.candidateLabel) {
        add({ job: first.job, output });
      }
    });
  }
  return found;
}

function outputBelongsToPreset(output, presetId) {
  const outputPreset = output.presetId || output.subjectId || null;
  return outputPreset === presetId || (presetId === 'p1' && outputPreset == null);
}

function missingApprovedAvatarOverlays(state, index, reviewRoot, presetId) {
  const rootDir = path.dirname(path.dirname(reviewRoot));
  return AVATAR_OVERLAY_ASSETS.filter(assetId => {
    const decision = state.decisions && state.decisions[assetId];
    if (!isUseAsIs(decision)) return true;
    const selected = selectedOutputs(decision, index)
      .filter(({ job, output }) => job.assetId === assetId && outputBelongsToPreset(output, presetId));
    if (!selected.length) return true;
    return selected.some(({ job, output }) => {
      if (job.assetId !== assetId || !output.path) return true;
      const source = path.resolve(rootDir, output.path);
      return !inside(reviewRoot, source)
        || path.extname(source).toLowerCase() !== '.png'
        || !fs.existsSync(source)
        || !fs.statSync(source).isFile();
    });
  });
}

function nextRollbackDir(rootDir) {
  const base = new Date().toISOString().replace(/[:.]/g, '-');
  let suffix = 0;
  let dir;
  do {
    dir = path.join(rootDir, 'art', 'rollback', base + (suffix ? `-${suffix}` : ''));
    suffix++;
  } while (fs.existsSync(dir));
  return dir;
}

function applySelectedArtwork(options = {}) {
  const rootDir = path.resolve(options.rootDir || DEFAULT_ROOT);
  const statePath = path.resolve(options.statePath || path.join(rootDir, 'art', 'art-review', 'state.json'));
  const artManifestPath = path.resolve(options.manifestPath || path.join(rootDir, 'art', 'manifest.json'));
  const reviewRoot = path.resolve(rootDir, 'art', 'art-review');
  const assetsDir = path.resolve(rootDir, 'assets');
  const productionManifestPath = path.resolve(options.productionManifestPath || path.join(assetsDir, 'manifest.json'));
  const productionManifestScriptPath = path.resolve(options.productionManifestScriptPath || path.join(assetsDir, 'manifest.js'));
  const state = options.state || readJSON(statePath, { jobs: [], decisions: {}, openQuestionAnswers: {} });
  const artManifest = readJSON(artManifestPath);
  const manifestAssets = new Map((artManifest.assets || []).map(asset => [asset.id, asset]));
  const allowedAssets = new Set([
    ...manifestAssets.keys(),
    ...AVATAR_OVERLAY_ASSETS,
  ]);
  const existingManifest = readJSON(productionManifestPath, { version: 1, assets: {} });
  const production = {
    version: 1,
    updatedAt: existingManifest.updatedAt || null,
    assets: Object.assign({}, existingManifest.assets || {}),
  };
  const index = outputIndex(state);
  const decisions = state.decisions || {};
  const answers = state.openQuestionAnswers || {};
  const planned = [];
  const skipped = [];

  Object.entries(decisions).forEach(([assetId, decision]) => {
    if (!allowedAssets.has(assetId)) throw new Error(`Unknown art asset in decisions: ${assetId}`);
    const manifestAsset = manifestAssets.get(assetId);
    if (manifestAsset && (manifestAsset.decision === 'keep-existing' || manifestAsset.candidates === 0)) {
      skipped.push({ assetId, reason: 'keep-existing-by-manifest' });
      return;
    }
    if (!isUseAsIs(decision)) {
      skipped.push({ assetId, reason: 'not-use-as-is' });
      return;
    }
    if (assetId === 'player_avatar' && !String(answers[AVATAR_QUESTION] || '').trim()) {
      skipped.push({ assetId, reason: `unanswered-open-question:${AVATAR_QUESTION}` });
      return;
    }
    if (assetId === 'player_avatar') {
      const presetId = manifestAsset?.presetId || 'p1';
      const missingOverlays = missingApprovedAvatarOverlays(state, index, reviewRoot, presetId);
      if (missingOverlays.length) {
        skipped.push({
          assetId,
          presetId,
          reason: 'missing-required-avatar-overlays',
          missingOverlays,
        });
        return;
      }
    }

    const selected = selectedOutputs(decision, index);
    if (!selected.length) {
      skipped.push({ assetId, reason: 'candidate-not-found' });
      return;
    }

    selected.forEach(({ job, output }) => {
      if (assetId === 'avatar_presets_others') {
        const presetId = output.presetId || output.subjectId;
        const missingOverlays = missingApprovedAvatarOverlays(state, index, reviewRoot, presetId);
        if (!presetId || missingOverlays.length) {
          skipped.push({
            assetId,
            presetId: presetId || null,
            reason: 'missing-required-avatar-overlays',
            missingOverlays,
          });
          return;
        }
      }
      if (job.assetId !== assetId) {
        throw new Error(`Candidate ${output.id || output.path} belongs to ${job.assetId}, not ${assetId}`);
      }
      const source = path.resolve(rootDir, output.path || '');
      if (!inside(reviewRoot, source) || path.extname(source).toLowerCase() !== '.png') {
        throw new Error(`Candidate path must be a PNG inside art/art-review: ${output.path}`);
      }
      if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
        throw new Error(`Candidate image does not exist: ${output.path}`);
      }
      const realSource = fs.realpathSync(source);
      if (!inside(fs.realpathSync(reviewRoot), realSource)) {
        throw new Error(`Candidate resolves outside art/art-review: ${output.path}`);
      }

      const cleanAsset = safePart(assetId, 'asset id');
      const subject = output.subjectId ? safePart(output.subjectId, 'subject id') : null;
      const relativeDestination = subject
        ? path.join('assets', cleanAsset, `${subject}.png`)
        : path.join('assets', `${cleanAsset}.png`);
      const destination = path.resolve(rootDir, relativeDestination);
      if (!inside(assetsDir, destination)) throw new Error(`Unsafe production path: ${relativeDestination}`);

      planned.push({
        assetId,
        slotKey: subject ? `${assetId}.${subject}` : assetId,
        source: realSource,
        sourcePath: output.path.replace(/\\/g, '/'),
        sourceCandidateId: output.id || null,
        destination,
        relativeDestination: relativeDestination.replace(/\\/g, '/'),
      });
    });
  });

  if (!planned.length) return { applied: [], skipped, rollbackPath: null, manifestWritten: false };

  const rollbackDir = nextRollbackDir(rootDir);
  const backedUp = [];
  const backup = (file, relativePath) => {
    if (!fs.existsSync(file)) return;
    const backupPath = path.join(rollbackDir, relativePath);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(file, backupPath, fs.constants.COPYFILE_EXCL);
    backedUp.push(relativePath.replace(/\\/g, '/'));
  };

  // Back up every production file that this explicit apply will replace, including
  // the production manifest itself. No prior file is removed.
  planned.forEach(item => backup(item.destination, item.relativeDestination));
  backup(productionManifestPath, path.join('assets', 'manifest.json'));
  backup(productionManifestScriptPath, path.join('assets', 'manifest.js'));

  const appliedAt = new Date().toISOString();
  planned.forEach(item => {
    fs.mkdirSync(path.dirname(item.destination), { recursive: true });
    fs.copyFileSync(item.source, item.destination);
    production.assets[item.slotKey] = {
      src: item.relativeDestination,
      sourceCandidateId: item.sourceCandidateId,
      sourcePath: item.sourcePath,
      appliedAt,
    };
  });
  production.updatedAt = appliedAt;
  fs.mkdirSync(path.dirname(productionManifestPath), { recursive: true });
  const serializedManifest = JSON.stringify(production, null, 2);
  fs.writeFileSync(productionManifestPath, serializedManifest + '\n', 'utf8');
  fs.writeFileSync(productionManifestScriptPath, `window.ART_ASSETS = ${serializedManifest};\n`, 'utf8');

  return {
    applied: planned.map(item => ({ assetId: item.assetId, slotKey: item.slotKey, path: item.relativeDestination })),
    skipped,
    backedUp,
    rollbackPath: backedUp.length ? path.relative(rootDir, rollbackDir).replace(/\\/g, '/') : null,
    manifestWritten: true,
  };
}

module.exports = { applySelectedArtwork };

if (require.main === module) {
  try {
    const result = applySelectedArtwork();
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
