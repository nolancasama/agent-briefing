'use strict';

(() => {
  const LOCK_OPTIONS = ['Face', 'Hair', 'Pose', 'Clothing', 'Body position', 'Camera/crop', 'Lighting', 'Background', 'Art style'];
  const AVATAR_OVERLAY_ASSETS = ['avatar_base', 'eyes_open', 'eyes_closed', 'mouth_closed', 'mouth_small', 'mouth_medium', 'mouth_wide'];
  const model = { manifest: null, state: null, queue: null, statusKey: '', stateKey: '', jobCount: 0 };
  const $ = selector => document.querySelector(selector);

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[char]);
  }

  function setStatus(message, type) {
    const el = $('#status-bar');
    el.textContent = message;
    el.className = 'status-bar' + (type ? ' ' + type : '');
  }

  async function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (!copied) throw new Error('Could not copy automatically. Select the text and copy it manually.');
  }

  async function api(url, options) {
    const response = await fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options));
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function candidateUrl(candidatePath) {
    let value = String(candidatePath || '').replace(/\\/g, '/');
    const marker = value.toLowerCase().lastIndexOf('/art/art-review/');
    if (marker >= 0) value = value.slice(marker + 1);
    value = value.replace(/^\.?\//, '');
    if (!value.startsWith('art/art-review/')) return '';
    return '/' + value.split('/').map(encodeURIComponent).join('/');
  }

  function requiresTransparency(asset) {
    return String(asset.transparency || '').toLowerCase().startsWith('required');
  }

  function bodyBackgroundFromGameCss() {
    try {
      const sheet = Array.from(document.styleSheets).find(item => String(item.href || '').endsWith('/styles.css'));
      const rule = Array.from(sheet.cssRules).find(item => item.selectorText === 'body');
      return rule && rule.style.background;
    } catch (_) { return ''; }
    return '';
  }

  function currentPlaceholder(asset) {
    const characters = DATA.CHARACTERS;
    const av = DATA.DEFAULT_AVATAR;
    let art = '';
    let ensemble = false;
    switch (asset.id) {
      case 'room_background':
        art = `<div class="placeholder-scene"><div class="room-wall"><div class="wall-logo">${Art.logo(42)}</div></div><div class="conf-table"></div></div>`;
        break;
      case 'commander': art = Art.commander(); break;
      case 'player_avatar': art = Art.agentFull(av, 150); break;
      case 'avatar_presets_others':
        ensemble = true;
        art = [
          Object.assign({}, av, { hair: 'long', shades: false }),
          Object.assign({}, av, { skin: '#eab676', hairColor: '#3c2a20', hair: 'spiky', shades: true }),
          Object.assign({}, av, { skin: '#ffe0c4', hairColor: '#5b3a1e', hair: 'bob', shades: false }),
        ].map(preset => Art.agentFull(preset, 120)).join('');
        break;
      case 'dossier_ben': art = Art.portrait(characters[0], 180, 200); break;
      case 'dossier_others':
        ensemble = true;
        art = characters.slice(1).map(c => Art.portrait(c, 110, 125)).join('');
        break;
      case 'npc_agents_front':
        ensemble = true;
        art = [0, 1, 2, 3].map(i => Art.npcFront(i)).join('');
        break;
      case 'npc_agents_back':
        ensemble = true;
        art = [0, 1, 2, 3].map(i => Art.npcBack(i)).join('');
        break;
      case 'agency_logo': art = Art.logo(170); break;
      case 'title_background':
      case 'archive_background':
        art = `<div class="placeholder-scene procedural-background" style="background:${escapeHtml(bodyBackgroundFromGameCss())}"></div>`;
        break;
      default: art = '<span>Current procedural treatment</span>';
    }
    return `<div class="placeholder-frame${ensemble ? ' placeholder-ensemble' : ''}">${art}</div>
      <p class="placeholder-caption">Live output from the current <code>js/art.js</code> / game CSS</p>`;
  }

  function renderKeyValues(object) {
    if (!object) return '';
    return Object.entries(object).map(([key, value]) => {
      if (Array.isArray(value)) {
        return `<div class="brief-section"><h4>${escapeHtml(key)}</h4><ul>${value.map(item => {
          if (item && typeof item === 'object') {
            const label = item.id ? `<strong>${escapeHtml(item.id)}:</strong> ` : '';
            return `<li>${label}${escapeHtml(item.brief || JSON.stringify(item))}</li>`;
          }
          return `<li>${escapeHtml(item)}</li>`;
        }).join('')}</ul></div>`;
      }
      if (value && typeof value === 'object') {
        return `<div class="brief-section"><h4>${escapeHtml(key)}</h4>${Object.entries(value).map(([subKey, subValue]) =>
          `<p><strong>${escapeHtml(subKey)}:</strong> ${escapeHtml(subValue)}</p>`).join('')}</div>`;
      }
      return `<div class="brief-section"><h4>${escapeHtml(key)}</h4><p>${escapeHtml(value)}</p></div>`;
    }).join('');
  }

  function fullBrief(asset) {
    const production = {
      'Generate aspect': asset.generateAspect,
      'Display aspect': asset.displayAspect,
      'Display size': asset.displaySize,
      'Transparency': asset.transparency,
      'Phase': asset.phase,
      'Phase gate': asset.gatedOn,
    };
    const creative = {};
    if (asset.brief) creative.brief = asset.brief;
    if (asset.sharedBrief) creative.sharedBrief = asset.sharedBrief;
    if (asset.subjects) creative.subjects = asset.subjects;
    if (asset.compositionConstraints) creative.compositionConstraints = asset.compositionConstraints;
    return `<details open>
      <summary>Full manifest generation brief</summary>
      <div class="brief-content">
        <div class="brief-section"><h4>Style direction</h4><p>${escapeHtml(model.manifest.styleGuide.positive)}</p><p>${escapeHtml(model.manifest.styleGuide.consistency)}</p></div>
        ${renderKeyValues(creative)}
        ${renderKeyValues({ 'Production requirements': Object.entries(production).filter(([, value]) => value != null).map(([key, value]) => `${key}: ${value}`) })}
        <div class="brief-section"><h4>Avoid</h4><p>${escapeHtml(model.manifest.styleGuide.negative)}</p></div>
      </div>
    </details>`;
  }

  function jobsForAsset(assetId) {
    return (model.state.jobs || []).filter(job => job.assetId === assetId);
  }

  function outputPath(output) {
    return typeof output === 'string' ? output : output && (output.absolutePath || output.path || output.relativePath);
  }

  function expectedOutputsForJobs(jobs) {
    return jobs.flatMap(job => (job.expectedOutputs || job.outputPaths || []).map(output => ({
      path: outputPath(output),
      job,
    }))).filter(item => item.path);
  }

  function candidateCount(assetId) {
    return jobsForAsset(assetId).reduce((total, job) => total + (job.outputs || []).length, 0);
  }

  function assetStatus(asset, decision) {
    if (asset.decision === 'keep-existing') return 'Keep Existing';
    if (decision && decision.choice === 'candidate' && decision.action === 'use-as-is') return 'Approved';
    if (candidateCount(asset.id)) return 'Candidates Ready';
    const serverStatus = model.state.assetStatuses && model.state.assetStatuses[asset.id];
    return typeof serverStatus === 'string' ? serverStatus : (serverStatus && (serverStatus.label || serverStatus.status)) || 'Needs Generation';
  }

  function directoryForJobs(jobs, expected) {
    const job = jobs.find(item => item.outputDirectory || item.candidateDirectory || item.directory);
    if (job) return job.outputDirectory || job.candidateDirectory || job.directory;
    const path = expected.length && expected[0].path;
    return path ? path.replace(/[\\/][^\\/]+$/, '') : '';
  }

  function expectedFilenames(asset) {
    const count = Number(asset.candidates ?? asset.candidatesEach) || 0;
    if (!count) return [];
    const subjects = Array.isArray(asset.subjects) && asset.subjects.length ? asset.subjects : [null];
    return subjects.flatMap(subject => Array.from({ length: count }, (_, index) => {
      const number = String(index + 1).padStart(2, '0');
      return `${subject && subject.id ? `${subject.id}_` : ''}candidate-${number}.png`;
    }));
  }

  function copyButton(label, value) {
    if (!value) return '';
    return `<button class="review-button compact" type="button" data-action="copy" data-copy-text="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
  }

  function renderManualEmpty(asset, jobs, unavailableReason) {
    const expected = expectedOutputsForJobs(jobs);
    const filenames = expected.length
      ? expected.map(item => String(item.path).split(/[\\/]/).pop())
      : expectedFilenames(asset);
    const directory = directoryForJobs(jobs, expected);
    const generation = jobs.reduce((latest, job) => Math.max(latest, Number(job.generation) || 0), 0) || 1;
    const prompts = Array.from(new Map(
      jobs.filter(job => job.exactPrompt).map(job => {
        const subject = job.expectedOutputs?.[0]?.subject || job.expectedOutputs?.[0]?.subjectId || 'main';
        return [JSON.stringify([subject, job.exactPrompt, job.references || []]), job];
      }),
    ).values());
    const references = Array.from(new Set(jobs.flatMap(job => job.references || (job.referenceImage ? [job.referenceImage] : []))));
    return `<div class="manual-empty-state">
      <div class="manual-empty-heading"><strong>Needs Generation</strong><span>Generation ${escapeHtml(generation)}</span></div>
      <p>Generate the image${filenames.length === 1 ? '' : 's'} manually in ChatGPT, then save the PNG${filenames.length === 1 ? '' : 's'} in the prepared directory. The review server detects valid PNGs on refresh.</p>
      ${unavailableReason ? `<p class="manual-reference"><strong>Not ready to prepare:</strong> ${escapeHtml(unavailableReason)}</p>` : ''}
      <div class="manual-field"><div><strong>Expected filename${filenames.length === 1 ? '' : 's'}</strong></div><code>${filenames.length ? filenames.map(escapeHtml).join('\n') : 'Prepare this asset to reserve exact filenames.'}</code></div>
      ${directory ? `<div class="manual-field"><div><strong>Candidate directory</strong>${copyButton('Copy Path', directory)}</div><code>${escapeHtml(directory)}</code></div>` : ''}
      ${references.length ? `<div class="manual-reference"><strong>Reference image${references.length === 1 ? '' : 's'}:</strong> Upload ${references.length === 1 ? 'this file' : 'these files'} to ChatGPT alongside the prompt.${references.map(reference => `<code>${escapeHtml(outputPath(reference) || reference)}</code>`).join('')}</div>` : ''}
      ${prompts.length ? prompts.map((job, index) => `<div class="manual-field prompt-field"><div><strong>Complete prompt${prompts.length > 1 ? ` ${index + 1}` : ''}</strong>${copyButton('Copy Prompt', job.exactPrompt)}</div><pre class="exact-prompt">${escapeHtml(job.exactPrompt)}</pre></div>`).join('') : '<p class="prepare-hint">Choose <strong>Prepare Candidates</strong> or run <code>npm run art:prepare</code> to create the directory and complete paste-ready prompt.</p>'}
    </div>`;
  }

  function batchesForAsset(assetId) {
    const batches = new Map();
    jobsForAsset(assetId).forEach(job => {
      const key = `${job.kind || 'generate'}:${job.batch || job.id}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(job);
    });
    return Array.from(batches.values());
  }

  function groupsForBatch(batchJobs) {
    const groups = new Map();
    batchJobs.forEach(job => (job.outputs || []).forEach((output, index) => {
      const label = String(output.candidateLabel || String.fromCharCode(65 + index)).toUpperCase();
      if (!groups.has(label)) groups.set(label, { outputs: [], jobs: [] });
      groups.get(label).outputs.push(output);
      groups.get(label).jobs.push(job);
    }));
    const first = batchJobs[0];
    return Array.from(groups, ([label, value]) => ({
      key: `${first.assetId}:${first.batch || first.id}:${label}`,
      label,
      outputs: value.outputs,
      jobs: value.jobs,
      job: value.jobs[0],
    }));
  }

  function decisionMatchesGroup(decision, group) {
    if (!decision || decision.choice !== 'candidate') return false;
    const ids = group.outputs.map(output => output.id || output.path);
    return decision.candidateGroupId === group.key || ids.includes(decision.candidateId);
  }

  function revisionChildren(parentGroup, allBatches) {
    const parentValues = new Set([parentGroup.key]);
    parentGroup.outputs.forEach(output => { parentValues.add(output.id); parentValues.add(output.path); });
    return allBatches.filter(batch => batch.some(job => job.kind === 'revise' && parentValues.has(job.parentCandidate)));
  }

  function batchHeading(job) {
    if (job.label) return job.label;
    if (job.kind === 'revise') return `Revision of ${escapeHtml(String(job.parentCandidate || '').split(':').pop() || 'candidate')}`;
    if (job.kind === 'new-direction') return `New Direction ${job.generation || ''}`.trim();
    return `Generation ${job.generation || 1}`;
  }

  function renderCandidateImages(asset, group) {
    return group.outputs.map(output => {
      const transparencyWarning = requiresTransparency(asset) && output.hasTransparency !== true
        ? '<span class="alpha-warning">⚠ Required transparency is missing</span>' : '';
      const label = output.subjectId ? `<span class="subject-label">${escapeHtml(output.subjectId)}</span>` : '';
      const url = candidateUrl(output.path);
      return `<div class="candidate-image-wrap">
        <img class="candidate-image" src="${escapeHtml(url)}" alt="${escapeHtml(asset.name)} candidate ${escapeHtml(group.label)}${output.subjectId ? ` — ${escapeHtml(output.subjectId)}` : ''}" loading="lazy">
        ${label}${transparencyWarning}
      </div>`;
    }).join('');
  }

  function renderSelectedControls(asset, group, decision, disabled) {
    if (!decisionMatchesGroup(decision, group)) return '';
    const locks = new Set(decision.locks || []);
    return `<div class="candidate-controls">
      <label for="edits-${escapeHtml(group.key)}">Suggested edits to this candidate:</label>
      <textarea id="edits-${escapeHtml(group.key)}" data-role="revision-instructions" placeholder="Describe only the focused changes you want…">${escapeHtml(decision.edits || '')}</textarea>
      <fieldset class="lock-list">
        <legend>Lock during revision:</legend>
        ${LOCK_OPTIONS.map(lock => `<label><input type="checkbox" data-lock="${escapeHtml(lock)}" ${locks.has(lock) ? 'checked' : ''}> ${escapeHtml(lock)}</label>`).join('')}
      </fieldset>
      <div class="control-buttons">
        <button class="review-button primary" type="button" data-action="use-as-is" ${disabled ? 'disabled' : ''}>Use As-Is</button>
        <button class="review-button" type="button" data-action="revise" ${disabled ? 'disabled' : ''}>Revise Selected Candidate</button>
      </div>
    </div>`;
  }

  function renderPrompts(batchJobs) {
    return batchJobs.map(job => {
      const output = (job.outputs || [])[0] || (job.expectedOutputs || [])[0] || {};
      const qualifier = [output.candidateLabel && `Candidate ${output.candidateLabel}`, output.subjectId].filter(Boolean).join(' · ');
      return `<div><strong>${escapeHtml(qualifier || 'Prompt')}</strong><pre class="exact-prompt">${escapeHtml(job.exactPrompt || 'Prompt not recorded.')}</pre></div>`;
    }).join('');
  }

  function renderBatch(asset, batchJobs, allBatches, decision, nested, disabled) {
    const job = batchJobs[0];
    const groups = groupsForBatch(batchJobs);
    return `<section class="batch${nested ? ' revision' : ''}" data-batch="${escapeHtml(job.batch || job.id)}">
      <div class="batch-heading"><h3>${escapeHtml(batchHeading(job))}</h3><span class="batch-time">${escapeHtml(job.timestamp ? new Date(job.timestamp).toLocaleString() : '')}</span></div>
      <details class="prompt-details"><summary>Exact prepared prompt${batchJobs.length === 1 ? '' : 's'} (${batchJobs.length})</summary>${renderPrompts(batchJobs)}</details>
      <div class="candidate-grid">
        ${groups.map(group => {
          const selected = decisionMatchesGroup(decision, group);
          const children = revisionChildren(group, allBatches);
          return `<article class="candidate-option${selected ? ' selected' : ''}" data-group-key="${escapeHtml(group.key)}">
            <label class="candidate-radio"><input type="radio" name="choice-${escapeHtml(asset.id)}" value="candidate" data-candidate-group="${escapeHtml(group.key)}" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}> Candidate ${escapeHtml(group.label)}</label>
            <div class="candidate-images">${renderCandidateImages(asset, group)}</div>
            ${renderSelectedControls(asset, group, decision, disabled)}
            ${children.map(child => renderBatch(asset, child, allBatches, decision, true, disabled)).join('')}
          </article>`;
        }).join('')}
      </div>
      ${groups.length ? '' : renderManualEmpty(asset, batchJobs)}
    </section>`;
  }

  function decisionSummary(asset, decision) {
    if (asset.decision === 'keep-existing') return asset.decisionNote || 'Current procedural artwork will be kept.';
    if (!decision) return 'No primary choice saved.';
    if (decision.choice === 'keep-existing') return 'Current procedural artwork will be kept.';
    if (decision.choice === 'other') return 'Waiting for a new direction.';
    if (decision.action === 'use-as-is') {
      const blocked = asset.id === 'player_avatar' && !String(model.state.openQuestionAnswers['avatar-customization-conflict'] || '').trim();
      if (blocked) return 'Use As-Is selected, but application is blocked until the avatar question is answered.';
      if (asset.id === 'player_avatar' || asset.id === 'avatar_presets_others') {
        return 'Use As-Is selected, but each selected preset remains blocked until its own required phase-3 facial overlays are present and approved.';
      }
      return 'Use As-Is — eligible for apply.';
    }
    if (decision.action === 'revise') return 'Revision requested; this candidate is not eligible for apply.';
    return 'Candidate selected. Choose Use As-Is or request a revision.';
  }

  function renderAsset(asset) {
    const allBatches = batchesForAsset(asset.id);
    const nestedBatches = new Set();
    allBatches.forEach(batch => groupsForBatch(batch).forEach(group => {
      revisionChildren(group, allBatches).forEach(child => nestedBatches.add(child));
    }));
    const rootBatches = allBatches.filter(batch => !nestedBatches.has(batch));
    const manifestKeepExisting = asset.decision === 'keep-existing';
    const decision = manifestKeepExisting ? { choice: 'keep-existing', candidateId: null, action: null } : (model.state.decisions[asset.id] || null);
    const keepChecked = manifestKeepExisting || (decision && decision.choice === 'keep-existing');
    const otherChecked = decision && decision.choice === 'other';
    const summary = decisionSummary(asset, decision);
    const status = assetStatus(asset, decision);
    const avatarConstraint = asset.id === 'player_avatar' || asset.id === 'avatar_presets_others'
      ? `<p class="avatar-overlay-block"><strong>Per-preset application requirement:</strong> Each painted preset remains blocked until its own seven phase-3 facial overlays are present and approved: ${AVATAR_OVERLAY_ASSETS.map(escapeHtml).join(', ')}. Another preset's overlays cannot satisfy this requirement. Overlay rendering is not part of this pass.</p>`
      : '';
    const fixedDecision = manifestKeepExisting
      ? `<p class="fixed-decision-note"><strong>Resolved decision: Keep Existing.</strong> ${escapeHtml(asset.decisionNote || '')}</p>`
      : '';
    const preview = model.state.preparations && model.state.preparations[asset.id];
    return `<article class="asset-card" id="asset-${escapeHtml(asset.id)}" data-asset-id="${escapeHtml(asset.id)}">
      <header class="asset-card-header">
        <div><p class="eyebrow">PHASE ${escapeHtml(asset.phase)} · ${escapeHtml(asset.assetType)}</p><h2>${escapeHtml(asset.name)}</h2><p><strong>Used In:</strong> ${escapeHtml(asset.usedIn)}</p></div>
        <div class="asset-meta"><strong>${escapeHtml(asset.generateAspect)}</strong><br>${escapeHtml(asset.transparency)}<br>${escapeHtml(asset.gatedOn ? 'Gated: ' + asset.gatedOn : 'Ready for review')}</div>
      </header>
      <div class="asset-body">
        <div class="brief-layout">
          <section><h3 class="comparison-title">Current placeholder</h3>${currentPlaceholder(asset)}</section>
          <section class="brief-panel"><h3 class="comparison-title">Purpose & generation brief</h3><p>${escapeHtml(asset.purpose)}</p>${fullBrief(asset)}</section>
        </div>
        ${avatarConstraint}${fixedDecision}
        <section class="candidate-area">
          <div class="candidate-toolbar"><div><h3 class="candidates-title">Candidate history</h3><span class="asset-status status-${escapeHtml(status.toLowerCase().replace(/\s+/g, '-'))}">${escapeHtml(status)}</span></div><button class="review-button" type="button" data-action="generate" ${manifestKeepExisting ? 'disabled' : ''}>Prepare Candidates</button></div>
          ${rootBatches.length ? rootBatches.map(batch => renderBatch(asset, batch, allBatches, decision, false, manifestKeepExisting)).join('') : (manifestKeepExisting ? '<div class="empty-candidates">Candidate preparation is disabled for this Keep Existing asset.</div>' : renderManualEmpty(asset, preview?.jobs || [], preview?.unavailableReason || ''))}
          <div class="choice-row">
            <label><input type="radio" name="choice-${escapeHtml(asset.id)}" value="keep-existing" ${keepChecked ? 'checked' : ''} ${manifestKeepExisting ? 'disabled' : ''}> Keep Existing</label>
            <label><input type="radio" name="choice-${escapeHtml(asset.id)}" value="other" ${otherChecked ? 'checked' : ''} ${manifestKeepExisting ? 'disabled' : ''}> Other / None of These</label>
          </div>
          ${otherChecked ? `<div class="new-direction-panel"><label for="direction-${escapeHtml(asset.id)}">Describe a new direction:</label><textarea id="direction-${escapeHtml(asset.id)}" data-role="new-direction" placeholder="Describe the new creative direction…">${escapeHtml(decision.direction || '')}</textarea><button class="review-button" type="button" data-action="new-direction">Prepare New Candidates</button></div>` : ''}
          <p class="selection-summary${decision && decision.action === 'use-as-is' ? ' ready' : ''}">${escapeHtml(summary)}</p>
        </section>
      </div>
    </article>`;
  }

  function renderAssets() {
    $('#asset-list').innerHTML = model.manifest.assets.map(renderAsset).join('');
  }

  function renderQuestions() {
    $('#open-questions').innerHTML = model.manifest.openQuestions.map(question => {
      const answer = question.resolved ? question.answer : (model.state.openQuestionAnswers[question.id] || '');
      if (question.resolved) {
        return `<article class="question-card resolved" data-question-id="${escapeHtml(question.id)}">
          <div><h3><span class="resolved-badge">Resolved</span> ${escapeHtml(question.id)}</h3><p>${escapeHtml(question.question)}</p><p class="question-recommendation"><strong>Art director recommendation:</strong> ${escapeHtml(question.claudeRecommendation)}</p></div>
          <div class="resolved-answer"><strong>User's decision</strong><p>${escapeHtml(answer)}</p>${question.resolvedOn ? `<small>Resolved ${escapeHtml(question.resolvedOn)}</small>` : ''}</div>
        </article>`;
      }
      return `<article class="question-card" data-question-id="${escapeHtml(question.id)}">
        <div><h3>${escapeHtml(question.id)}</h3><p>${escapeHtml(question.question)}</p><p class="question-recommendation"><strong>Art director recommendation:</strong> ${escapeHtml(question.claudeRecommendation)}</p></div>
        <div class="question-answer"><label for="question-${escapeHtml(question.id)}"><strong>Your decision</strong></label><textarea id="question-${escapeHtml(question.id)}" placeholder="Record the decision here…">${escapeHtml(answer)}</textarea><button class="review-button" type="button" data-action="save-question">Save answer</button></div>
      </article>`;
    }).join('');
  }

  function selectedGroup(assetId, groupKey) {
    for (const batch of batchesForAsset(assetId)) {
      const group = groupsForBatch(batch).find(item => item.key === groupKey);
      if (group) return group;
    }
    return null;
  }

  async function saveDecision(assetId, decision, message) {
    const result = await api('/api/decisions', { method: 'POST', body: JSON.stringify({ assetId, decision }) });
    model.state.decisions[assetId] = result.decision;
    renderAssets();
    setStatus(message || 'Decision saved.', 'success');
  }

  function candidateDecision(group, existing) {
    const paths = group.outputs.map(output => output.path);
    const ids = group.outputs.map(output => output.id || output.path);
    return {
      choice: 'candidate',
      candidateGroupId: group.key,
      candidateId: ids[0],
      candidateIds: ids,
      candidatePath: paths[0],
      candidatePaths: paths,
      action: null,
      edits: existing && existing.candidateGroupId === group.key ? existing.edits || '' : '',
      locks: existing && existing.candidateGroupId === group.key ? existing.locks || [] : [],
    };
  }

  async function queueGeneration(assetId, kind, values) {
    const payload = Object.assign({ assetId, kind }, values || {});
    const result = await api('/api/jobs', { method: 'POST', body: JSON.stringify(payload) });
    model.queue = result.status;
    setStatus(`${kind === 'generate' ? 'Generation' : kind === 'revise' ? 'Revision' : 'New direction'} preparation queued for ${assetId}.`);
  }

  async function handleAssetChange(event) {
    const radio = event.target.closest('input[type="radio"]');
    if (!radio) return;
    const card = radio.closest('.asset-card');
    const assetId = card.dataset.assetId;
    const asset = model.manifest.assets.find(item => item.id === assetId);
    if (asset && asset.decision === 'keep-existing') return;
    if (radio.value === 'candidate') {
      const group = selectedGroup(assetId, radio.dataset.candidateGroup);
      if (group) await saveDecision(assetId, candidateDecision(group, model.state.decisions[assetId]), 'Candidate selected.');
    } else if (radio.value === 'keep-existing') {
      await saveDecision(assetId, { choice: 'keep-existing', candidateId: null, action: null }, 'Keep Existing saved.');
    } else if (radio.value === 'other') {
      await saveDecision(assetId, { choice: 'other', candidateId: null, action: null, direction: '' }, 'Other / None of These saved.');
    }
  }

  async function handleAssetClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const card = button.closest('.asset-card');
    const assetId = card.dataset.assetId;
    const asset = model.manifest.assets.find(item => item.id === assetId);
    if (asset && asset.decision === 'keep-existing') return setStatus(`${asset.name} is fixed to Keep Existing by the resolved art-direction decision.`, 'error');
    const action = button.dataset.action;
    try {
      button.disabled = true;
      if (action === 'copy') {
        await copyText(button.dataset.copyText || '');
        setStatus(`${button.textContent} complete.`, 'success');
        return;
      }
      if (action === 'generate') return await queueGeneration(assetId, 'generate');
      if (action === 'new-direction') {
        const instructions = card.querySelector('[data-role="new-direction"]').value.trim();
        if (!instructions) throw new Error('Describe a new direction first.');
        await saveDecision(assetId, { choice: 'other', candidateId: null, action: null, direction: instructions });
        return await queueGeneration(assetId, 'new-direction', { instructions });
      }
      const option = button.closest('.candidate-option');
      const group = selectedGroup(assetId, option.dataset.groupKey);
      const controls = button.closest('.candidate-controls');
      const edits = controls.querySelector('[data-role="revision-instructions"]').value.trim();
      const locks = Array.from(controls.querySelectorAll('[data-lock]:checked'), input => input.dataset.lock);
      const decision = Object.assign(candidateDecision(group, model.state.decisions[assetId]), { edits, locks });
      if (action === 'use-as-is') {
        decision.action = 'use-as-is';
        return await saveDecision(assetId, decision, 'Candidate marked Use As-Is and eligible for apply.');
      }
      if (action === 'revise') {
        if (!edits) throw new Error('Add focused edit instructions before requesting a revision.');
        decision.action = 'revise';
        await saveDecision(assetId, decision, 'Revision choice saved.');
        return await queueGeneration(assetId, 'revise', { parent: decision.candidateId, instructions: edits, locks });
      }
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function handleQuestionClick(event) {
    const button = event.target.closest('[data-action="save-question"]');
    if (!button) return;
    const card = button.closest('.question-card');
    const questionId = card.dataset.questionId;
    const answer = card.querySelector('textarea').value.trim();
    try {
      const result = await api('/api/open-questions', { method: 'POST', body: JSON.stringify({ questionId, answer }) });
      model.state.openQuestionAnswers[questionId] = result.answer;
      renderAssets();
      setStatus(answer ? 'Open-question answer saved.' : 'Answer cleared.', 'success');
    } catch (error) { setStatus(error.message, 'error'); }
  }

  async function applySelected() {
    const ready = Object.values(model.state.decisions).filter(decision => decision && decision.choice === 'candidate' && decision.action === 'use-as-is').length;
    if (!ready) return setStatus('No candidates are marked Use As-Is.', 'error');
    if (!window.confirm(`Apply ${ready} selected asset choice${ready === 1 ? '' : 's'}? Existing production files, if any, will be backed up first.`)) return;
    const button = $('#apply-selected');
    button.disabled = true;
    try {
      const response = await api('/api/apply', { method: 'POST', body: '{}' });
      const result = response.result || {};
      const count = Array.isArray(result.applied) ? result.applied.length : ready;
      setStatus(`Apply complete: ${count} production artwork file${count === 1 ? '' : 's'} applied.`, 'success');
    } catch (error) { setStatus(error.message, 'error'); }
    finally { button.disabled = false; }
  }

  async function pollStatus() {
    try {
      const status = await api('/api/status');
      const key = JSON.stringify(status);
      if (key !== model.statusKey) {
        model.statusKey = key;
        model.queue = status;
        if (status.active) setStatus(`Preparing ${status.active.assetId} (${status.active.kind})… ${status.queued.length} job(s) queued.`);
        else if (status.last && status.last.ok) setStatus(`Prepared ${status.last.assetId} (${status.last.kind}). Paste the prompt into ChatGPT and save the PNGs at the displayed paths.`, 'success');
        else if (status.last && !status.last.ok) setStatus(`Preparation failed: ${status.last.output || 'unknown error'}`, 'error');
      }
      if (!status.active && !status.queued.length) {
        const state = await api('/api/state');
        const stateKey = JSON.stringify({
          jobs: (state.jobs || []).map(job => [job.id, job.status, (job.outputs || []).map(output => [output.id, output.path, output.hasTransparency])]),
          decisions: state.decisions,
          assetStatuses: state.assetStatuses,
        });
        if (stateKey !== model.stateKey) {
          model.state = state;
          model.jobCount = state.jobs.length;
          model.stateKey = stateKey;
          renderQuestions();
          renderAssets();
        }
      }
    } catch (_) { /* The visible action handlers surface server errors. */ }
  }

  async function init() {
    try {
      [model.manifest, model.state] = await Promise.all([api('/api/manifest'), api('/api/state')]);
      model.jobCount = (model.state.jobs || []).length;
      model.stateKey = JSON.stringify({
        jobs: (model.state.jobs || []).map(job => [job.id, job.status, (job.outputs || []).map(output => [output.id, output.path, output.hasTransparency])]),
        decisions: model.state.decisions,
        assetStatuses: model.state.assetStatuses,
      });
      renderQuestions();
      renderAssets();
      $('#asset-list').addEventListener('change', event => handleAssetChange(event).catch(error => setStatus(error.message, 'error')));
      $('#asset-list').addEventListener('click', handleAssetClick);
      $('#open-questions').addEventListener('click', handleQuestionClick);
      $('#apply-selected').addEventListener('click', applySelected);
      setStatus(`Loaded ${model.manifest.assets.length} asset slots and ${model.jobCount} preparation job(s).`);
      setInterval(pollStatus, 1800);
    } catch (error) {
      setStatus(`Could not load review data: ${error.message}`, 'error');
    }
  }

  init();
})();
