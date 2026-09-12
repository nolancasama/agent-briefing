#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(__dirname, 'manifest.json');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const REVIEW_ROOT = path.join(__dirname, 'art-review');
const STATE_PATH = path.join(REVIEW_ROOT, 'state.json');
const DATA_PATH = path.join(PROJECT_ROOT, 'js', 'data.js');
const ASPECT_DIMENSIONS = {
  '3:2 landscape': { width: 1536, height: 1024 },
  '2:3 portrait': { width: 1024, height: 1536 },
  '1:1 square': { width: 1024, height: 1024 },
  '1:1': { width: 1024, height: 1024 },
};

function toPosix(relativePath) { return relativePath.split(path.sep).join('/'); }
function slug(value) { return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function candidateNumber(index) { return String(index + 1).padStart(2, '0'); }
function dimensionsFor(asset) {
  const dimensions = ASPECT_DIMENSIONS[asset.generateAspect];
  if (!dimensions) throw new Error(`Unsupported generateAspect for ${asset.id}: ${asset.generateAspect}`);
  return dimensions;
}
function requiresTransparency(asset) { return /^required\b/i.test(asset.transparency || ''); }
async function loadManifest() { return JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')); }
async function loadConfig() {
  const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8'));
  if (!['manual', 'playwright', 'openai-api'].includes(config.generator)) {
    throw new Error(`Unsupported art generator in art/config.json: ${config.generator}`);
  }
  return config;
}
function loadAdapter(config) {
  if (config.generator === 'manual') return require('./adapters/manual');
  if (config.generator === 'playwright') return require('./adapters/playwright');
  return require('./adapters/openai-api');
}

function defaultState() { return { version: 1, jobs: [], decisions: {}, openQuestionAnswers: {} }; }
function syncManifestResolutions(state, manifest) {
  let changed = false;
  state.decisions ||= {};
  state.openQuestionAnswers ||= {};
  for (const question of manifest.openQuestions || []) {
    if (!question.resolved || !String(question.answer || '').trim()) continue;
    if (state.openQuestionAnswers[question.id] !== question.answer) {
      state.openQuestionAnswers[question.id] = question.answer;
      changed = true;
    }
  }
  for (const asset of manifest.assets || []) {
    if (asset.decision !== 'keep-existing') continue;
    const existing = state.decisions[asset.id];
    if (existing?.choice === 'keep-existing' && existing?.manifestDecision === true) continue;
    state.decisions[asset.id] = {
      choice: 'keep-existing', candidateId: null, action: null, manifestDecision: true,
      updatedAt: existing?.updatedAt || new Date().toISOString(),
    };
    changed = true;
  }
  return changed;
}
async function readState() {
  try {
    const state = JSON.parse(await fs.readFile(STATE_PATH, 'utf8'));
    state.jobs = Array.isArray(state.jobs) ? state.jobs : [];
    state.decisions ||= {};
    state.openQuestionAnswers ||= {};
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return defaultState();
    throw error;
  }
}
async function writeState(state) {
  await fs.mkdir(REVIEW_ROOT, { recursive: true });
  const temporaryPath = `${STATE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, STATE_PATH);
}
async function appendJobs(jobs) {
  if (!jobs.length) return;
  const state = await readState();
  for (const job of jobs) {
    if (state.jobs.some((existing) => existing.id === job.id)) throw new Error(`Refusing to append duplicate job id: ${job.id}`);
    state.jobs.push(job);
  }
  await writeState(state);
}
async function appendJob(job) { await appendJobs([job]); }

function titleCaseKey(key) { return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase()); }
function briefLines(asset, subject) {
  const source = asset.brief || asset.sharedBrief || {};
  const lines = Object.entries(source).map(([key, value]) => `${titleCaseKey(key)}: ${value}`);
  if (subject?.brief) lines.push(`Subject: ${subject.brief}`);
  else if (subject) lines.push(`Subject identifier: ${subject.id}`);
  return lines;
}
async function loadCharacterLooks() {
  const source = await fs.readFile(DATA_PATH, 'utf8');
  const sandbox = {};
  vm.runInNewContext(`${source}\n;globalThis.__ART_DATA__ = DATA;`, sandbox, { filename: DATA_PATH });
  return Object.fromEntries(sandbox.__ART_DATA__.CHARACTERS.map((character) => [character.id, character.look]));
}
function formatLookContext(subjectId, look) {
  if (!look || !['sam', 'lily'].includes(subjectId)) return null;
  return `Existing game data for ${subjectId}: skin ${look.skin}; hair color ${look.hairColor}; hair style ${look.hair}; shirt color ${look.shirt}.`;
}
function composePrompt({ manifest, asset, subject = null, kind = 'generate', instructions = '', locks = [], look = null, referenceContext = '' }) {
  const dimensions = dimensionsFor(asset);
  const lines = [`Generate a single image. ${asset.name}.`, '', manifest.styleGuide.positive, '', ...briefLines(asset, subject)];
  const lookContext = subject && formatLookContext(subject.id, look);
  if (lookContext) lines.push(lookContext);
  if (referenceContext) lines.push(`Reference image: ${referenceContext}`);
  if (asset.compositionConstraints?.length) {
    lines.push('', 'Composition constraints:');
    asset.compositionConstraints.forEach((constraint) => lines.push(`- ${constraint}`));
  }
  if (kind === 'revise') {
    lines.push('', `Focused revision request: ${instructions}`);
    if (locks.length) lines.push(`Lock during revision: Keep ${locks.join(', ')} unchanged from the attached reference image.`);
  } else if (kind === 'new-direction') {
    lines.push('', `New direction requested: ${instructions}`);
  }
  const backgroundRequirement = requiresTransparency(asset)
    ? 'Return a PNG with a genuinely transparent background (non-opaque alpha outside the subject).'
    : 'Return a fully opaque image.';
  lines.push('', `Technical requirements: one image only, ${dimensions.width} x ${dimensions.height} pixels, ${asset.generateAspect}. ${backgroundRequirement}`, '', manifest.styleGuide.negative);
  return lines.join('\n');
}

function countForAsset(asset, kind) { return kind === 'revise' ? 1 : Number(asset.candidates ?? asset.candidatesEach ?? 1); }
function subjectsForAsset(asset) {
  if (asset.id === 'npc_agents_back' && !asset.subjects?.length) return ['npc1', 'npc2', 'npc3', 'npc4'].map((id) => ({ id, brief: null }));
  return asset.subjects?.length ? asset.subjects : [null];
}
async function nextBatch(assetId, kind, requestedBatch, state = null) {
  if (requestedBatch) {
    const safe = slug(requestedBatch);
    if (!safe) throw new Error('The requested batch label is empty after sanitizing.');
    return { batch: safe, generation: null, label: requestedBatch };
  }
  const currentState = state || await readState();
  const prefix = kind === 'new-direction' ? 'new-direction' : kind === 'revise' ? 'revision' : 'generation';
  let number = 1;
  const existingBatches = new Set(currentState.jobs.filter((job) => job.assetId === assetId).map((job) => job.batch));
  while (existingBatches.has(`${prefix}-${number}`)) number += 1;
  while (await fs.access(path.join(REVIEW_ROOT, assetId, `${prefix}-${number}`)).then(() => true, () => false)) number += 1;
  return {
    batch: `${prefix}-${number}`, generation: number,
    label: kind === 'new-direction' ? `New Direction ${number}` : kind === 'revise' ? `Revision ${number}` : `Generation ${number}`,
  };
}
function outputAbsolutePath(output) {
  if (output?.relativePath) return path.resolve(PROJECT_ROOT, output.relativePath);
  if (!output?.path) return null;
  return path.isAbsolute(output.path) ? path.resolve(output.path) : path.resolve(PROJECT_ROOT, output.path);
}
function resolveParentCandidate(state, parent) {
  if (!parent) return null;
  for (const job of state.jobs) {
    for (const output of [...(job.outputs || []), ...(job.expectedOutputs || [])]) {
      if (output.id === parent || output.path === parent || output.relativePath === parent) return output;
    }
  }
  const absolute = path.resolve(PROJECT_ROOT, parent);
  if (absolute !== REVIEW_ROOT && !absolute.startsWith(`${REVIEW_ROOT}${path.sep}`)) {
    throw new Error('Revision parent must be an existing candidate inside art/art-review.');
  }
  return { id: parent, path: absolute, relativePath: toPosix(path.relative(PROJECT_ROOT, absolute)) };
}
function decisionIsApproved(decision) { return decision?.action === 'use-as-is' || decision?.useAsIs === true; }
function decisionCandidateIds(decision) {
  const ids = [];
  if (typeof decision?.candidateId === 'string') ids.push(decision.candidateId);
  if (Array.isArray(decision?.candidateIds)) ids.push(...decision.candidateIds);
  else if (decision?.candidateIds && typeof decision.candidateIds === 'object') ids.push(...Object.values(decision.candidateIds));
  return ids.filter((id) => typeof id === 'string' && id);
}
function approvedOutputs(state, assetId) {
  const decision = state.decisions?.[assetId];
  if (!decisionIsApproved(decision)) throw new Error(`Preparing this phase-2 asset requires ${assetId} to have an explicit Use As-Is decision.`);
  const selected = decisionCandidateIds(decision).map((id) => resolveParentCandidate(state, id));
  if (!selected.length) throw new Error(`The Use As-Is decision for ${assetId} does not identify a candidate.`);
  return selected;
}
function phaseTwoReferenceResolver(state, asset) {
  if (asset.id === 'avatar_presets_others') {
    const [anchor] = approvedOutputs(state, 'player_avatar');
    return () => ({ outputs: [anchor], context: 'Use the attached approved player_avatar preset 1 image as the exact pose, camera, crop, suit, lighting, and art-style reference specified by the manifest.' });
  }
  if (asset.id === 'dossier_others') {
    const [anchor] = approvedOutputs(state, 'dossier_ben');
    return () => ({ outputs: [anchor], context: 'Use the attached approved dossier_ben image as the exact style reference specified by the manifest.' });
  }
  if (asset.id === 'npc_agents_back') {
    const fronts = approvedOutputs(state, 'npc_agents_front');
    return (subject) => {
      const matching = fronts.find((output) => (output.subjectId || output.subject) === subject?.id) || fronts[0];
      return { outputs: [matching], context: `Use the attached approved front view for ${subject?.id || 'this agent'} as the identity, hair, and clothing reference specified by the manifest.` };
    };
  }
  return () => null;
}
function previewPhaseTwoReferenceResolver(asset) {
  if (asset.id === 'avatar_presets_others') {
    return () => ({ outputs: [], context: 'Use the attached approved player_avatar preset 1 image as the exact pose, camera, crop, suit, lighting, and art-style reference specified by the manifest.' });
  }
  if (asset.id === 'dossier_others') {
    return () => ({ outputs: [], context: 'Use the attached approved dossier_ben image as the exact style reference specified by the manifest.' });
  }
  if (asset.id === 'npc_agents_back') {
    return (subject) => ({ outputs: [], context: `Use the attached approved front view for ${subject?.id || 'this agent'} as the identity, hair, and clothing reference specified by the manifest.` });
  }
  return () => null;
}

function pngDimensions(png) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (png.length < 24 || !png.subarray(0, 8).equals(signature) || png.toString('ascii', 12, 16) !== 'IHDR') throw new Error('File is not a valid PNG.');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
function paethPredictor(a, b, c) {
  const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function hasNonOpaqueAlpha(png) {
  pngDimensions(png);
  let offset = 8; let ihdr; let transparency; const idat = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset); const type = png.toString('ascii', offset + 4, offset + 8); const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat.push(data);
    if (type === 'tRNS') transparency = data;
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  if (!ihdr || !idat.length) throw new Error('PNG is missing IHDR or IDAT data.');
  const width = ihdr.readUInt32BE(0); const height = ihdr.readUInt32BE(4); const bitDepth = ihdr[8]; const colorType = ihdr[9]; const interlace = ihdr[12];
  if (interlace !== 0) return colorType === 4 || colorType === 6 || Boolean(transparency);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Unsupported PNG colour type: ${colorType}`);
  const bitsPerPixel = channels * bitDepth; const rowLength = Math.ceil(width * bitsPerPixel / 8); const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const packed = zlib.inflateSync(Buffer.concat(idat)); const decoded = Buffer.alloc(rowLength * height); let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[sourceOffset++]; const rowOffset = y * rowLength;
    for (let x = 0; x < rowLength; x += 1) {
      const raw = packed[sourceOffset++]; const left = x >= bytesPerPixel ? decoded[rowOffset + x - bytesPerPixel] : 0; const above = y > 0 ? decoded[rowOffset - rowLength + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? decoded[rowOffset - rowLength + x - bytesPerPixel] : 0;
      const value = filter === 0 ? raw : filter === 1 ? raw + left : filter === 2 ? raw + above : filter === 3 ? raw + Math.floor((left + above) / 2) : filter === 4 ? raw + paethPredictor(left, above, upperLeft) : NaN;
      if (Number.isNaN(value)) throw new Error(`Unsupported PNG filter type: ${filter}`);
      decoded[rowOffset + x] = value & 0xff;
    }
  }
  if ((colorType === 4 || colorType === 6) && (bitDepth === 8 || bitDepth === 16)) {
    const sampleBytes = bitDepth / 8; const pixelBytes = channels * sampleBytes; const alphaOffset = (channels - 1) * sampleBytes;
    for (let index = 0; index < decoded.length; index += pixelBytes) if (decoded[index + alphaOffset] !== 255 || (sampleBytes === 2 && decoded[index + alphaOffset + 1] !== 255)) return true;
    return false;
  }
  if (colorType === 3 && transparency && bitDepth === 8) {
    for (const paletteIndex of decoded) if (paletteIndex < transparency.length && transparency[paletteIndex] !== 255) return true;
    return false;
  }
  return Boolean(transparency);
}
async function fileIsPng(absolutePath) {
  try { pngDimensions(await fs.readFile(absolutePath)); return true; } catch { return false; }
}
async function assetHasCandidateOnDisk(assetId, state) {
  for (const job of state.jobs.filter((entry) => entry.assetId === assetId)) {
    for (const output of [...(job.expectedOutputs || []), ...(job.outputs || [])]) {
      const absolute = outputAbsolutePath(output);
      if (absolute && await fileIsPng(absolute)) return true;
    }
  }
  const assetDirectory = path.join(REVIEW_ROOT, assetId);
  const batches = await fs.readdir(assetDirectory, { withFileTypes: true }).catch(() => []);
  for (const batch of batches.filter((entry) => entry.isDirectory())) {
    const files = await fs.readdir(path.join(assetDirectory, batch.name), { withFileTypes: true }).catch(() => []);
    for (const file of files.filter((entry) => entry.isFile() && /\.png$/i.test(entry.name))) if (await fileIsPng(path.join(assetDirectory, batch.name, file.name))) return true;
  }
  return false;
}
async function statusForAsset(asset, state) {
  if (decisionIsApproved(state.decisions?.[asset.id])) return 'Approved';
  return await assetHasCandidateOnDisk(asset.id, state) ? 'Candidates Ready' : 'Needs Generation';
}

function validateOptions(options, manifest) {
  if (!['generate', 'revise', 'new-direction'].includes(options.kind)) throw new Error(`Unsupported job kind: ${options.kind}`);
  if (options.kind === 'revise' && !options.parent) throw new Error('--parent is required for revise jobs.');
  if (['revise', 'new-direction'].includes(options.kind) && !options.instructions?.trim()) throw new Error(`--instructions is required for ${options.kind} jobs.`);
  if (options.assetIds?.length) {
    const known = new Set(manifest.assets.map((asset) => asset.id)); const unknown = options.assetIds.filter((id) => !known.has(id));
    if (unknown.length) throw new Error(`Unknown asset id(s): ${unknown.join(', ')}`);
  }
  if (options.phase !== undefined && options.phase !== 'all' && !Number.isInteger(options.phase)) throw new Error('--phase must be a phase number or "all".');
}
function existingPreparedJobs(state, options, asset) {
  const normalizedLocks = [...options.locks].sort().join('|');
  const matching = state.jobs.filter((job) => job.assetId === asset.id && job.kind === options.kind && job.status === 'prepared'
    && (!options.batch || job.batch === slug(options.batch)) && (job.parentCandidate || null) === (options.parent || null)
    && (job.instructions || '') === options.instructions && [...(job.locks || [])].sort().join('|') === normalizedLocks);
  if (!matching.length) return [];
  const latestBatch = matching.at(-1).batch;
  return matching.filter((job) => job.batch === latestBatch);
}
async function assertReferencesExist(references) {
  for (const referencePath of references) if (!await fileIsPng(referencePath)) throw new Error(`Required reference image is missing or is not a valid PNG: ${referencePath}`);
}
async function buildAssetPlan({ manifest, state, looks, asset, options, reusePrepared = true, preview = false }) {
  const status = await statusForAsset(asset, state);
  if (reusePrepared) {
    const prepared = existingPreparedJobs(state, options, asset);
    if (prepared.length) return { assetId: asset.id, assetName: asset.name, status, batch: prepared[0].batch, generation: prepared[0].generation, outputDirectory: prepared[0].outputDirectory, jobs: prepared, existing: true };
  }
  const parent = options.kind === 'revise' ? resolveParentCandidate(state, options.parent) : null;
  let phaseReferenceFor = () => null;
  let unavailableReason = '';
  if (options.kind !== 'revise' && asset.phase === 2) {
    try {
      phaseReferenceFor = phaseTwoReferenceResolver(state, asset);
    } catch (error) {
      if (!preview) throw error;
      unavailableReason = error.message;
      phaseReferenceFor = previewPhaseTwoReferenceResolver(asset);
    }
  }
  const parentSubjectId = parent?.subjectId || parent?.subject || null;
  const subjects = options.kind === 'revise' && parentSubjectId ? subjectsForAsset(asset).filter((subject) => subject?.id === parentSubjectId) : subjectsForAsset(asset);
  if (!subjects.length) throw new Error(`Revision parent subject does not belong to ${asset.id}.`);
  const batchInfo = await nextBatch(asset.id, options.kind, options.batch, state); const outputDirectory = path.join(REVIEW_ROOT, asset.id, batchInfo.batch);
  const dimensions = dimensionsFor(asset); const totalCandidates = countForAsset(asset, options.kind); const jobs = [];
  for (const subject of subjects) {
    const phaseReference = phaseReferenceFor(subject); const referenceOutputs = parent ? [parent] : (phaseReference?.outputs || []);
    const references = referenceOutputs.map(outputAbsolutePath).filter(Boolean);
    if (!preview) await assertReferencesExist(references);
    for (let index = 0; index < totalCandidates; index += 1) {
      const number = candidateNumber(index); const filename = subject ? `${subject.id}_candidate-${number}.png` : `candidate-${number}.png`;
      const absoluteOutput = path.join(outputDirectory, filename); const relativeOutput = toPosix(path.relative(PROJECT_ROOT, absoluteOutput));
      const outputId = `${asset.id}:${batchInfo.batch}:${subject?.id || 'main'}:${number}`;
      const prompt = composePrompt({ manifest, asset, subject, kind: options.kind, instructions: options.instructions, locks: options.locks, look: subject ? looks[subject.id] : null, referenceContext: phaseReference?.context || '' });
      const parentLabel = parent?.candidateLabel || parent?.label || parent?.id || options.parent;
      jobs.push({
        id: `${outputId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, kind: options.kind, assetId: asset.id, batch: batchInfo.batch,
        label: options.kind === 'revise' ? `Revision of ${parentLabel}` : batchInfo.label, generation: batchInfo.generation, status: 'prepared',
        parentCandidate: parent?.id || null, instructions: options.instructions, revisionRequest: options.kind === 'revise' ? options.instructions : null,
        newDirection: options.kind === 'new-direction' ? options.instructions : null, locks: [...options.locks], exactPrompt: prompt, timestamp: new Date().toISOString(),
        generator: 'manual', dryRun: false, outputDirectory, references,
        expectedOutputs: [{
          id: outputId, label: `Candidate ${number}`, candidateLabel: number, candidateIndex: index + 1, filename, path: absoluteOutput, relativePath: relativeOutput,
          subject: subject?.id || null, subjectId: subject?.id || null, width: dimensions.width, height: dimensions.height, hasTransparency: null,
        }],
        outputs: [],
      });
    }
  }
  return { assetId: asset.id, assetName: asset.name, status, batch: batchInfo.batch, generation: batchInfo.generation, outputDirectory, jobs, existing: false, unavailableReason };
}

function normalizeOptions(options = {}) {
  return { kind: options.kind || 'generate', assetIds: options.assetIds || [], instructions: options.instructions || '', locks: options.locks || [], parent: options.parent || null, batch: options.batch || null, phase: options.phase, all: Boolean(options.all) };
}
function generationEligible(asset) { return asset.decision !== 'keep-existing' && countForAsset(asset, 'generate') > 0; }
async function phaseTwoIsActionable(state, asset) {
  try {
    const referenceFor = phaseTwoReferenceResolver(state, asset);
    for (const subject of subjectsForAsset(asset)) {
      const reference = referenceFor(subject);
      for (const output of reference?.outputs || []) {
        const absolutePath = outputAbsolutePath(output);
        if (!absolutePath || !await fileIsPng(absolutePath)) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
async function selectAssets(manifest, state, options) {
  if (options.assetIds.length) return options.assetIds.map((id) => manifest.assets.find((asset) => asset.id === id)).filter(generationEligible);
  let assets = manifest.assets.filter(generationEligible);
  if (options.phase !== undefined && options.phase !== 'all') assets = assets.filter((asset) => asset.phase === options.phase);
  const pending = [];
  for (const asset of assets) if (await statusForAsset(asset, state) === 'Needs Generation') pending.push(asset);
  if (options.all || options.phase !== undefined) {
    const actionable = [];
    for (const asset of pending) {
      if (asset.phase !== 2) {
        actionable.push(asset);
        continue;
      }
      if (await phaseTwoIsActionable(state, asset)) actionable.push(asset);
    }
    return actionable;
  }
  for (const asset of pending) {
    if (asset.phase !== 2) return [asset];
    if (await phaseTwoIsActionable(state, asset)) return [asset];
  }
  return [];
}
async function previewManualJobs({ assetId, kind = 'generate', parent = null, instructions = '', locks = [], batch = null } = {}) {
  if (!assetId) throw new Error('previewManualJobs requires assetId.');
  const manifest = await loadManifest(); const state = await readState();
  const options = normalizeOptions({ kind, assetIds: [assetId], parent, instructions, locks, batch }); validateOptions(options, manifest);
  const asset = manifest.assets.find((entry) => entry.id === assetId);
  if (!generationEligible(asset)) return null;
  return buildAssetPlan({ manifest, state, looks: await loadCharacterLooks(), asset, options, preview: true });
}
function printPreparedJobs(plan, jobs) {
  const job = jobs[0];
  const subject = job.expectedOutputs[0]?.subject;
  console.log('\n============================================================');
  console.log(`Asset: ${plan.assetId} — ${plan.assetName}${subject ? ` / ${subject}` : ''}`);
  console.log(`Generation: ${plan.generation ?? plan.batch}`); console.log(`Status: ${plan.status}`);
  if (job.revisionRequest) console.log(`Revision request: ${job.revisionRequest}`);
  if (job.locks?.length) console.log(`Locked properties: ${job.locks.join(', ')}`);
  if (job.newDirection) console.log(`New direction: ${job.newDirection}`);
  if (job.references?.length) {
    console.log('\nReference image(s) to upload alongside the prompt:'); job.references.forEach((reference) => console.log(`  ${reference}`));
    console.log('Upload every reference listed above to ChatGPT alongside this prompt.');
  }
  console.log('\nPROMPT — copy everything between the markers'); console.log('-------------------- BEGIN PROMPT --------------------');
  console.log(job.exactPrompt); console.log('--------------------- END PROMPT ---------------------');
  const expected = jobs.flatMap((entry) => entry.expectedOutputs || []);
  console.log(`\nSave the generated PNG${expected.length === 1 ? '' : 's'} at ${expected.length === 1 ? 'this' : 'these'} exact absolute path${expected.length === 1 ? '' : 's'}:`);
  expected.forEach((output) => console.log(`  ${output.path}`));
  console.log(`Candidate directory: ${plan.outputDirectory}`);
}
async function runJobs(options = {}) {
  const normalized = normalizeOptions(options); const manifest = await loadManifest(); validateOptions(normalized, manifest);
  if (normalized.kind !== 'generate' && normalized.assetIds.length !== 1) throw new Error(`${normalized.kind} jobs require exactly one --asset.`);
  const state = await readState(); if (syncManifestResolutions(state, manifest)) await writeState(state);
  const config = await loadConfig(); const adapter = loadAdapter(config); const assets = await selectAssets(manifest, state, normalized); const looks = await loadCharacterLooks(); const preparedJobs = [];
  for (const asset of assets) {
    const plan = await buildAssetPlan({ manifest, state, looks, asset, options: normalized });
    if (!plan.existing) { await adapter.prepare(plan, config); await appendJobs(plan.jobs); state.jobs.push(...plan.jobs); }
    const printGroups = new Map();
    for (const job of plan.jobs) {
      const subject = job.expectedOutputs?.[0]?.subject || 'main';
      const key = JSON.stringify([subject, job.exactPrompt, job.references, job.revisionRequest, job.newDirection, job.locks]);
      if (!printGroups.has(key)) printGroups.set(key, []);
      printGroups.get(key).push(job);
    }
    printGroups.forEach((jobs) => printPreparedJobs(plan, jobs)); preparedJobs.push(...plan.jobs);
  }
  if (!assets.length) console.log('No pending assets are ready to prepare. Keep-existing and approved assets are skipped; phase-gated assets wait for their approved references.');
  return preparedJobs;
}

function parseArgs(argv) {
  const options = { assetIds: [], locks: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]; const takeValue = () => { const value = argv[++index]; if (value == null) throw new Error(`${argument} requires a value.`); return value; };
    if (argument === '--all') options.all = true;
    else if (argument === '--dry-run') throw new Error('--dry-run no longer creates images. Use the manual art:prepare workflow.');
    else if (argument === '--asset') options.assetIds.push(...takeValue().split(',').map((value) => value.trim()).filter(Boolean));
    else if (argument === '--kind') options.kind = takeValue();
    else if (argument === '--parent') options.parent = takeValue();
    else if (argument === '--instructions') options.instructions = takeValue();
    else if (argument === '--locks') options.locks.push(...takeValue().split(',').map((value) => value.trim()).filter(Boolean));
    else if (argument === '--batch') options.batch = takeValue();
    else if (argument === '--phase') { const value = takeValue(); options.phase = value === 'all' ? 'all' : Number(value); }
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}
function printHelp() {
  console.log(`Usage: node art/generate.js [options]\n\n` +
    `  --all                     Prepare every pending, currently actionable asset\n` +
    `  --asset <id[,id...]>      Prepare only selected manifest assets\n` +
    `  --phase <number|all>      Prepare pending assets in a manifest phase\n` +
    `  --kind <kind>             generate (default), revise, or new-direction\n` +
    `  --parent <candidate>      Candidate id/path to upload for a revision\n` +
    `  --instructions <text>     Focused revision or new-direction text\n` +
    `  --locks <item[,item...]>  Properties to preserve during revision\n` +
    `  --batch <label>           Optional explicit, sanitized batch label\n`);
}
async function main() {
  const options = parseArgs(process.argv.slice(2)); if (options.help) return printHelp();
  const jobs = await runJobs(options); console.log(`\nPrepared ${jobs.length} manual candidate target${jobs.length === 1 ? '' : 's'}. No images were generated or uploaded.`);
}
if (require.main === module) main().catch((error) => { console.error(`Fatal error: ${error.message}`); process.exitCode = 1; });
module.exports = { appendJob, composePrompt, dimensionsFor, hasNonOpaqueAlpha, loadConfig, loadManifest, pngDimensions, previewManualJobs, readState, requiresTransparency, runJobs, statusForAsset, syncManifestResolutions };
