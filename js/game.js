/* ============================================================
   AGENT BRIEFING — main game flow
   Title → Agent ID → Intelligence Archive → Dossier →
   Speaking Mission (record 4 clips) → HQ Debriefing (playback
   with lip-synced avatar) → Mission Report.
   ============================================================ */
'use strict';

/* ---------- tiny helpers ---------- */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- persistent save ---------- */
const SAVE_KEY = 'agent-briefing-v1';

function loadSave() {
  const base = { points: 0, closed: {}, avatar: null, muted: false, packId: 'L1' };
  try {
    return Object.assign(base, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'));
  } catch (e) {
    return base;
  }
}

const App = {
  save: loadSave(),
  char: null, pack: null, step: 0, clips: [],
  pendingClip: null, quietTries: 0, recState: 'idle',
  recTimeout: 0, missionStartPoints: 0,
  debriefGen: 0, debriefSkip: false,
};

function persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(App.save)); }
function avatar() { return Object.assign({}, DATA.DEFAULT_AVATAR, App.save.avatar || {}); }
function agentName() { const a = App.save.avatar; return a && a.name ? ' ' + a.name : ''; }
function rankFor(pts) {
  let r = DATA.RANKS[0];
  for (const k of DATA.RANKS) if (pts >= k.min) r = k;
  return r;
}

/* ---------- generic UI bits ---------- */
function typeInto(el, text, speed, sfxOn) {
  speed = speed || 26;
  return new Promise(res => {
    if (!el) { res(); return; }
    el.textContent = '';
    el.classList.add('typing');
    let i = 0;
    const t = setInterval(() => {
      if (!document.contains(el)) { clearInterval(t); res(); return; }
      i++;
      el.textContent = text.slice(0, i);
      if (sfxOn !== false && i % 2 === 0) Sfx.type();
      if (i >= text.length) {
        clearInterval(t);
        el.classList.remove('typing');
        res();
      }
    }, speed);
  });
}

function slamStamp(container, text, cls) {
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'stamp ' + (cls || '');
  el.textContent = text;
  container.appendChild(el);
  Sfx.stamp();
  return el;
}

function floatText(txt, x, y) {
  const el = document.createElement('div');
  el.className = 'float-pts';
  el.textContent = txt;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

function hqToast(msg) {
  const layer = $('#toast-layer');
  if (!layer) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  layer.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 4500);
}

function setScreen(html, cls) {
  Recorder.stopPlayback();
  Recorder.abortRecognition();
  clearTimeout(App.recTimeout);
  const app = $('#app');
  app.className = 'screen-' + cls;
  app.innerHTML = html;
}

/* ---------- invisible "Briefing Quality" evaluation ----------
   Speech recognition runs alongside every recording purely as a hint.
   Missing/failed recognition (unsupported browser, no network, kid
   mumbles and the API errors out) always falls back to a neutral-good
   score — it only ever adds encouraging signal, never blocks or scores
   a student down for a technical failure. */
function wordsOf(s) {
  return (s || '').toLowerCase().match(/[a-z']+/g) || [];
}

function evaluateClip(step, c, stt) {
  if (!stt || !stt.gotResult) return 0.75;
  const transcriptWords = wordsOf(stt.transcript);
  const factWords = wordsOf(step.fact(c));
  const patternWords = wordsOf(step.prompt(c).replace('______', ''));
  const tset = new Set(transcriptWords);
  const factHit = factWords.length ? factWords.filter(w => tset.has(w)).length / factWords.length : 1;
  const patHit = patternWords.length ? patternWords.filter(w => tset.has(w)).length / patternWords.length : 1;
  const completeness = Math.min(1, transcriptWords.length / Math.max(3, factWords.length + patternWords.length));
  const confidence = stt.confidence || 0.6;
  const quality = 0.45 * factHit + 0.30 * patHit + 0.15 * completeness + 0.10 * confidence;
  return Math.max(0, Math.min(1, quality));
}

/* Live convenience hint only, checked against interim (not-yet-final)
   recognition results while the mic is still open — a positive here
   auto-stops the recording early. It never gates or auto-retries: a
   miss just means the student keeps talking until the manual stop or
   the 8s cap, exactly as if this check didn't exist. */
function looksComplete(step, c, transcript) {
  const words = wordsOf(transcript);
  if (words.length < 3) return false;
  const tset = new Set(words);
  const factWords = wordsOf(step.fact(c));
  const patternWords = wordsOf(step.prompt(c).replace('______', ''));
  const factHit = factWords.length ? factWords.filter(w => tset.has(w)).length / factWords.length : 1;
  const patHit = patternWords.length ? patternWords.filter(w => tset.has(w)).length / patternWords.length : 1;
  return factHit >= 0.8 && patHit >= 0.8;
}

function qualityTier(q) { return q >= 0.72 ? 'high' : q >= 0.45 ? 'medium' : 'low'; }
function rankLetter(q) { return q >= 0.85 ? 'S' : q >= 0.7 ? 'A' : q >= 0.45 ? 'B' : 'C'; }

function hudHTML() {
  const r = rankFor(App.save.points);
  return `<div class="hud">
    <div class="hud-chip hud-rank">${r.icon} <b>${r.name}</b></div>
    <div class="hud-chip hud-pts">🏅 <b id="hud-points">${App.save.points}</b> pts</div>
    <button class="icon-btn" id="btn-mute" title="Sound on/off">${App.save.muted ? '🔇' : '🔊'}</button>
  </div>`;
}

function wireHud() {
  const b = $('#btn-mute');
  if (b) b.onclick = () => {
    App.save.muted = !App.save.muted;
    Sfx.setMuted(App.save.muted);
    persist();
    b.textContent = App.save.muted ? '🔇' : '🔊';
  };
}

function addPoints(n) {
  App.save.points += n;
  persist();
  const el = $('#hud-points');
  if (el) {
    el.textContent = App.save.points;
    const r = el.getBoundingClientRect();
    floatText('+' + n, r.left - 10, r.top + 22);
  }
  Sfx.points();
}

/* ============================================================
   SCREEN 1 — TITLE
   ============================================================ */
function showTitle() {
  Sfx.bgmStop();
  setScreen(`
    ${hudHTML()}
    <div class="title-wrap">
      <div class="title-logo">${Art.logo(150)}</div>
      <div class="title-tape">★ TOP SECRET ★</div>
      <h1 class="title-big"><span>AGENT</span> <span>BRIEFING</span></h1>
      <p class="title-sub">SPEAK ENGLISH · COMPLETE THE MISSION</p>
      <div class="title-btns">
        <button class="btn big primary" id="btn-start">▶ START MISSION</button>
        <button class="btn" id="btn-agent-id">🕶 AGENT ID</button>
      </div>
      <p class="radio-line" id="title-radio"></p>
    </div>`, 'title');
  wireHud();
  $('#btn-start').onclick = () => {
    Sfx.blip();
    if (App.save.avatar) showArchive(); else showAgentId(true);
  };
  $('#btn-agent-id').onclick = () => showAgentId(false);
  typeInto($('#title-radio'), '📻 HQ ► Welcome, Agent. Headquarters needs your report…', 30, false);
}

/* ============================================================
   SCREEN 2 — AGENT ID (avatar customization)
   ============================================================ */
function showAgentId(goArchiveAfter) {
  const av = avatar();

  const swatchRow = (label, key, values) => `
    <div class="opt-row"><span class="opt-label">${label}</span>
      <div class="opt-vals" data-key="${key}">
        ${values.map(v => `<button class="swatch ${av[key] === v ? 'sel' : ''}" data-key="${key}" data-val="${v}" style="background:${v}"></button>`).join('')}
      </div></div>`;

  setScreen(`
    ${hudHTML()}
    <div class="panel agentid-wrap">
      <h2 class="panel-title">🕶 AGENT ID CARD</h2>
      <div class="agentid-cols">
        <div class="agentid-preview" id="av-preview">${Art.agentFull(av, 150)}</div>
        <div class="agentid-opts">
          <div class="opt-row"><span class="opt-label">CODENAME</span>
            <input id="av-name" maxlength="14" placeholder="e.g. STAR" value="${esc(av.name || '')}"></div>
          ${swatchRow('SKIN', 'skin', DATA.AVATAR_OPTIONS.skins)}
          ${swatchRow('HAIR COLOR', 'hairColor', DATA.AVATAR_OPTIONS.hairColors)}
          <div class="opt-row"><span class="opt-label">HAIR STYLE</span>
            <div class="opt-vals">
              ${DATA.AVATAR_OPTIONS.hairs.map(hs => `<button class="pill ${av.hair === hs ? 'sel' : ''}" data-key="hair" data-val="${hs}">${hs.toUpperCase()}</button>`).join('')}
            </div></div>
          ${swatchRow('SUIT', 'suit', DATA.AVATAR_OPTIONS.suits)}
          ${swatchRow('TIE', 'tie', DATA.AVATAR_OPTIONS.ties)}
          <div class="opt-row"><span class="opt-label">SUNGLASSES</span>
            <div class="opt-vals">
              <button class="pill ${av.shades ? 'sel' : ''}" data-key="shades" data-val="1">🕶 ON</button>
              <button class="pill ${!av.shades ? 'sel' : ''}" data-key="shades" data-val="">OFF</button>
            </div></div>
        </div>
      </div>
      <div class="agentid-btns">
        <button class="btn" id="btn-agent-back">◀ BACK</button>
        <button class="btn big primary" id="btn-agent-save">✔ SAVE &amp; CONTINUE</button>
      </div>
    </div>`, 'agentid');
  wireHud();

  const state = Object.assign({}, av);
  $$('.swatch, .pill').forEach(b => {
    if (!b.dataset.key) return;
    b.onclick = () => {
      const k = b.dataset.key;
      state[k] = k === 'shades' ? !!b.dataset.val : b.dataset.val;
      Sfx.click();
      $$(`[data-key="${k}"]`).forEach(x => x.classList.toggle('sel',
        k === 'shades' ? (!!x.dataset.val === !!state[k]) : x.dataset.val === String(state[k])));
      $('#av-preview').innerHTML = Art.agentFull(state, 150);
    };
  });
  $('#btn-agent-back').onclick = showTitle;
  $('#btn-agent-save').onclick = () => {
    state.name = $('#av-name').value.trim().toUpperCase();
    App.save.avatar = state;
    persist();
    Sfx.chime();
    if (goArchiveAfter) showArchive(); else showTitle();
  };
}

/* ============================================================
   SCREEN 3 — INTELLIGENCE ARCHIVE (mission select)
   ============================================================ */
function showArchive() {
  Sfx.bgmStart();
  const packs = DATA.GRAMMAR_PACKS;
  const curPack = packs.find(p => p.id === App.save.packId) || packs[0];
  App.save.packId = curPack.id;

  setScreen(`
    ${hudHTML()}
    <div class="archive-wrap">
      <h2 class="archive-title">🗄 INTELLIGENCE ARCHIVE</h2>
      <p class="archive-sub">Choose a Person of Interest to investigate</p>
      <div class="pack-toggle">
        ${packs.map(p => `<button class="pack-btn ${p.id === curPack.id ? 'sel' : ''}" data-pack="${p.id}">${p.label}<small>${p.title}</small></button>`).join('')}
      </div>
      <div class="dossier-grid">
        ${DATA.CHARACTERS.map(c => {
          const done = App.save.closed[c.id] || {};
          return `<button class="dossier-card" data-id="${c.id}">
            <span class="folder-tab">${esc(c.codename)}</span>
            <span class="polaroid"><span class="clip"></span>${Art.portrait(c)}</span>
            <span class="file-no">FILE No. ${c.fileNo}</span>
            ${done[curPack.id]
              ? '<span class="mini-stamp green">CASE CLOSED ✔</span>'
              : '<span class="mini-stamp red">CLASSIFIED</span>'}
            <span class="lvl-chips">${packs.map(p => done[p.id] ? `<span class="chip">${p.label} ✔</span>` : '').join('')}</span>
          </button>`;
        }).join('')}
      </div>
      <button class="btn subtle" id="btn-back-title">◀ HQ LOBBY</button>
    </div>`, 'archive');
  wireHud();

  $$('.pack-btn').forEach(b => b.onclick = () => {
    App.save.packId = b.dataset.pack;
    persist();
    Sfx.paper();
    showArchive();
  });
  $$('.dossier-card').forEach(b => b.onclick = () => {
    Sfx.swoosh();
    openDossier(DATA.CHARACTERS.find(c => c.id === b.dataset.id));
  });
  $('#btn-back-title').onclick = showTitle;
}

/* ============================================================
   SCREEN 4 — DOSSIER (folder opens, facts type in)
   ============================================================ */
async function openDossier(c) {
  App.char = c;
  App.pack = DATA.GRAMMAR_PACKS.find(p => p.id === App.save.packId) || DATA.GRAMMAR_PACKS[0];

  setScreen(`
    ${hudHTML()}
    <div class="dossier-wrap">
      <div class="folder open-anim">
        <div class="folder-inside">
          <div class="folder-left">
            <div class="polaroid big"><span class="clip"></span>${Art.portrait(c, 180, 200)}</div>
            <div class="stamp-slot" id="stamp-slot"></div>
          </div>
          <div class="folder-right">
            <div class="doss-line" id="dl-code"></div>
            <div class="doss-line" id="dl-name"></div>
            <div class="doss-facts" id="doss-facts"></div>
            <div class="doss-note">MISSION: report ${App.pack.steps.length} facts to HQ — with your voice.</div>
          </div>
        </div>
        <div class="folder-cover"><span>CONFIDENTIAL</span></div>
      </div>
      <div class="dossier-btns">
        <button class="btn" id="btn-back-archive">◀ BACK</button>
        <button class="btn big primary" id="btn-accept">🎙 ACCEPT MISSION</button>
      </div>
    </div>`, 'dossier');
  wireHud();
  $('#btn-back-archive').onclick = showArchive;
  $('#btn-accept').onclick = acceptMission;

  Sfx.paper();
  await sleep(650); // folder cover flips open (CSS)
  Sfx.swoosh();
  slamStamp($('#stamp-slot'), 'CONFIDENTIAL', 'red small');
  await typeInto($('#dl-code'), 'CODENAME: ' + c.codename, 22);
  await typeInto($('#dl-name'), 'NAME: ' + c.name, 22);
  const facts = $('#doss-facts');
  for (const s of App.pack.steps) {
    if (!document.contains(facts)) return;
    const row = document.createElement('div');
    row.className = 'fact-row';
    row.innerHTML = `<span class="fact-ico">${s.icon(c)}</span><span class="fact-label">${esc(s.factLabel)}:</span> <b>${esc(s.fact(c))}</b>`;
    facts.appendChild(row);
    Sfx.type();
    await sleep(170);
  }
}

async function acceptMission() {
  Sfx.stamp();
  const ov = document.createElement('div');
  ov.className = 'accept-ov';
  ov.innerHTML = '<div class="stamp green big">MISSION ACCEPTED ✔</div>';
  document.body.appendChild(ov);
  await sleep(950);
  ov.remove();
  startMission();
}

/* ============================================================
   SCREEN 5 — SPEAKING MISSION (record one clip per sentence)
   ============================================================ */
function startMission() {
  App.step = 0;
  App.clips = [];
  App.quietTries = 0;
  App.missionStartPoints = App.save.points;
  App.briefingQuality = null;
  App.briefingTier = 'medium';
  Sfx.bgmStop();

  setScreen(`
    ${hudHTML()}
    <div class="mission-wrap">
      <div class="radio-bar">📻 <span id="radio-msg"></span></div>
      <div class="mission-cols">
        <div class="mission-photo">
          <div class="polaroid"><span class="clip"></span>${Art.portrait(App.char)}</div>
          <div class="mission-name">${esc(App.char.name)}</div>
        </div>
        <div class="mission-main">
          <div class="progress-row">
            ${App.pack.steps.map((s, i) => `<div class="prog-node" data-i="${i}">${i + 1}</div>`).join('')}
            <div class="prog-bar"><div class="prog-fill" id="prog-fill"></div></div>
          </div>
          <div class="fact-card" id="fact-card"></div>
          <div class="prompt-big" id="prompt-big"></div>
          <div class="rec-zone" id="rec-zone"></div>
        </div>
      </div>
      <button class="btn subtle" id="btn-abort">✕ ABORT MISSION</button>
    </div>`, 'mission');
  wireHud();
  $('#btn-abort').onclick = () => { Recorder.stopPlayback(); clearTimeout(App.recTimeout); showArchive(); };
  runStep();
}

async function runStep() {
  const i = App.step, s = App.pack.steps[i], c = App.char;
  $$('.prog-node').forEach((n, k) => n.classList.toggle('done', k < i));
  const fill = $('#prog-fill');
  if (fill) fill.style.width = (i / App.pack.steps.length * 100) + '%';

  const fc = $('#fact-card');
  if (!fc) return;
  fc.innerHTML = `<span class="fact-ico big">${s.icon(c)}</span>
    <span class="fact-label">${esc(s.factLabel)}</span>
    <b class="fact-value" id="fact-value"></b>`;
  $('#prompt-big').innerHTML = '';
  renderRecZone('idle');

  Sfx.blip();
  await typeInto($('#radio-msg'), 'HQ ► ' + s.radio(c), 20);
  await typeInto($('#fact-value'), s.fact(c), 34);
  const pb = $('#prompt-big');
  if (pb) {
    pb.innerHTML = `<span class="say-ico">🗣</span> ` +
      esc(s.prompt(c)).replace(/______/g, '<span class="blank">______</span>');
    pb.classList.add('pop');
  }
}

function renderRecZone(state, data) {
  App.recState = state;
  const z = $('#rec-zone');
  if (!z) return;
  data = data || {};

  if (state === 'idle') {
    z.innerHTML = `
      <button class="mic-btn" id="btn-mic"><span class="mic-ico">🎙</span><span class="mic-txt">RECORD</span></button>
      <div class="rec-side">
        <button class="btn subtle" id="btn-example">🔊 EXAMPLE</button>
        <div class="rec-hint">Press, then say the sentence!</div>
      </div>`;
    $('#btn-mic').onclick = beginCountdown;
    $('#btn-example').onclick = speakExample;

  } else if (state === 'count') {
    z.innerHTML = `<div class="countdown" id="countdown">·</div>`;

  } else if (state === 'rec') {
    z.innerHTML = `
      <button class="mic-btn recording" id="btn-mic"><span class="mic-ico">■</span><span class="mic-txt">STOP</span></button>
      <div class="rec-side">
        <div class="wave" id="wave">${'<span></span>'.repeat(7)}</div>
        <div class="rec-timer"><div class="rec-timer-fill" id="rec-timer-fill"></div></div>
      </div>`;
    $('#btn-mic').onclick = stopRec;

  } else if (state === 'review') {
    const forceRetry = data.quiet && App.quietTries < 2;
    z.innerHTML = `
      ${data.quiet ? '<div class="quiet-note">📻 HQ could not hear you! Speak louder 💪</div>' : ''}
      <div class="review-row">
        <button class="btn" id="btn-play">▶ LISTEN</button>
        <button class="btn" id="btn-retry">↻ AGAIN</button>
        <button class="btn primary" id="btn-send" ${forceRetry ? 'disabled' : ''}>📡 SEND TO HQ</button>
      </div>`;
    $('#btn-play').onclick = () => { if (App.pendingClip) Recorder.play(App.pendingClip.blob); };
    $('#btn-retry').onclick = () => { Recorder.stopPlayback(); beginCountdown(); };
    $('#btn-send').onclick = sendClip;
  }
}

async function beginCountdown() {
  if (!Recorder.supported()) {
    hqToast('🎙 This browser cannot record audio — please use Chrome or Edge.');
    return;
  }
  renderRecZone('count');
  const cd = $('#countdown');
  if (cd) cd.textContent = '📡';
  try {
    await Recorder.init();
  } catch (err) {
    renderRecZone('idle');
    hqToast('🎙 Microphone blocked! Click the 🔒 icon in the address bar and allow the microphone, then try again.');
    return;
  }
  for (const n of ['3', '2', '1']) {
    const el = $('#countdown');
    if (!el) return; // screen changed
    el.textContent = n;
    el.classList.remove('zoom');
    void el.offsetWidth;
    el.classList.add('zoom');
    Sfx.click();
    await sleep(380);
  }
  if (!$('#rec-zone')) return;
  startRec();
}

function startRec() {
  renderRecZone('rec');
  const bars = $$('#wave span');
  Recorder.start(v => {
    const btn = $('#btn-mic');
    if (btn) btn.style.setProperty('--lvl', Math.min(1, v * 5).toFixed(3));
    bars.forEach((b, k) => {
      const wob = 0.6 + 0.4 * Math.sin(k * 1.7 + performance.now() / 90);
      b.style.height = (6 + Math.min(34, v * 300 * wob)) + 'px';
    });
  });
  const fill = $('#rec-timer-fill');
  if (fill) requestAnimationFrame(() => { fill.style.width = '100%'; });

  const step = App.pack.steps[App.step];
  const recStartedAt = performance.now();
  let autoStopArmed = false;
  Recorder.startRecognition(transcript => {
    if (autoStopArmed || App.recState !== 'rec') return;
    if (performance.now() - recStartedAt < 900) return; // let a few words out first
    if (!looksComplete(step, App.char, transcript)) return;
    autoStopArmed = true;
    clearTimeout(App.recTimeout);
    App.recTimeout = setTimeout(stopRec, 500); // brief grace period so the last word isn't cut off
  });
  App.recTimeout = setTimeout(stopRec, 8000);
}

async function stopRec() {
  clearTimeout(App.recTimeout);
  if (App.recState !== 'rec') return;
  App.recState = 'stopping';
  const [clip, stt] = await Promise.all([Recorder.stop(), Recorder.stopRecognition()]);
  if (!clip || !$('#rec-zone')) return;
  clip.stt = stt;
  App.pendingClip = clip;
  const quiet = clip.peak < 0.035 || clip.dur < 0.35;
  if (quiet) App.quietTries++; else App.quietTries = 0;
  Sfx.paper();
  renderRecZone('review', { quiet });
}

async function sendClip() {
  if (App.recState !== 'review' || !App.pendingClip) return;
  App.recState = 'sending';
  Recorder.stopPlayback();

  const s = App.pack.steps[App.step];
  const quality = evaluateClip(s, App.char, App.pendingClip.stt);
  App.clips.push({
    text: s.answer(App.char),
    blob: App.pendingClip.blob,
    ext: App.pendingClip.ext,
    quality,
  });
  App.pendingClip = null;
  App.quietTries = 0;

  const z = $('#rec-zone');
  if (z) {
    z.innerHTML = '<div class="verify-slot" id="verify-slot"></div>';
    slamStamp($('#verify-slot'), 'VERIFIED ✔', 'green');
  }
  Sfx.chime();
  addPoints(DATA.POINTS_PER_CLIP);
  const node = $(`.prog-node[data-i="${App.step}"]`);
  if (node) node.classList.add('done');

  await sleep(1050);
  App.step++;
  if (!$('#rec-zone')) return;
  if (App.step < App.pack.steps.length) runStep();
  else missionEvidenceDone();
}

function missionEvidenceDone() {
  const qs = App.clips.map(c => (c.quality != null ? c.quality : 0.75));
  App.briefingQuality = qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : 0.75;
  App.briefingTier = qualityTier(App.briefingQuality);

  const fill = $('#prog-fill');
  if (fill) fill.style.width = '100%';
  $$('.prog-node').forEach(n => n.classList.add('done'));
  const m = $('.mission-main');
  if (!m) return;
  m.innerHTML = `<div class="evidence-done">
    <div class="stamp gold big">ALL EVIDENCE COLLECTED</div>
    <p>HQ is waiting for your briefing, Agent${esc(agentName())}!</p>
    <button class="btn big primary" id="btn-to-debrief">🏢 GO TO HEADQUARTERS ▶</button>
  </div>`;
  Sfx.fanfare();
  $('#btn-to-debrief').onclick = showDebrief;
}

function speakExample() {
  if (!('speechSynthesis' in window)) return;
  const s = App.pack.steps[App.step];
  const u = new SpeechSynthesisUtterance(s.answer(App.char));
  u.lang = 'en-US';
  u.rate = 0.85;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

/* ============================================================
   SCREEN 6 — HEADQUARTERS DEBRIEFING (the reward)
   ============================================================ */
function showDebrief() {
  Sfx.bgmStop();
  const c = App.char, av = avatar();

  setScreen(`
    <div class="debrief-wrap" id="debrief">
      <div class="cinema">
        <div class="stage stage-a" id="stage-a">
          <div class="room-wall"><div class="wall-logo">${Art.logo(64)}</div></div>
          <div class="big-screen">
            <div class="screen-inner">${Art.portrait(c, 150, 168)}</div>
          </div>
          <div class="podium-agent" id="agent-slot">${Art.agentFull(av, 118)}</div>
          <div class="conf-table"></div>
          <div class="npc-backs">
            ${[0, 1, 2, 3].map(i => `<div class="npcback-slot" style="animation-delay:${i * 0.6}s">${Art.npcBack(i)}</div>`).join('')}
          </div>
          <div class="cmdr-slot" id="cmdr-slot">${Art.commander()}<div class="cmdr-mood" id="cmdr-mood"></div></div>
          <div class="cmdr-bubble" id="cmdr-bubble" hidden></div>
        </div>
        <div class="stage stage-b offstage" id="stage-b">
          <div class="room-wall dark"></div>
          <div class="npc-fronts">
            ${[0, 1, 2].map(i => `<div class="npcfront-slot">${Art.npcFront(i)}</div>`).join('')}
          </div>
          <div class="table-edge"></div>
        </div>
        <div class="cut-flash" id="cut-flash"></div>
        <div class="caption-bar" id="caption"></div>
        <div class="debrief-overlay" id="debrief-overlay" hidden></div>
      </div>
      <button class="btn subtle skip-btn" id="btn-skip">⏭ SKIP</button>
    </div>`, 'debrief');

  App.debriefGen++;
  App.debriefSkip = false;
  runDebrief(App.debriefGen);
}

function setStage(which) {
  const a = $('#stage-a'), b = $('#stage-b'), f = $('#cut-flash');
  if (!a || !b) return;
  const showA = which === 'a';
  if (a.classList.contains('offstage') === !showA) return; // already there
  // visibility (not display) so running CSS animations don't restart
  a.classList.toggle('offstage', !showA);
  b.classList.toggle('offstage', showA);
  if (f) {
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }
}

function pulseClass(el, cls, ms) {
  if (!el) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

/* Reaction pools are weighted by Briefing Quality, never negative —
   the "low" pool still reads as curious/attentive, not disappointed
   or mocking (agents tilt heads and compare notes, they don't sigh). */
const REACTION_POOLS = {
  high:   ['nod', 'write', 'smilepop', 'nod', 'write', 'smilepop'],
  medium: ['nod', 'tilt', 'write', 'nod', 'tilt'],
  low:    ['tilt', 'whisper', 'nod', 'tilt', 'whisper'],
};
const REACTION_INTERVAL = { high: 820, medium: 980, low: 1180 };

const CMDR_LINES = {
  high:   name => `“Excellent work, Agent${name}!”`,
  medium: name => `“Most of the intelligence was communicated clearly, Agent${name}.”`,
  low:    name => `“We gathered useful information, Agent${name}. Let's make the next report even clearer.”`,
};

function scheduleReactions(tier) {
  const pool = REACTION_POOLS[tier] || REACTION_POOLS.medium;
  const every = REACTION_INTERVAL[tier] || 980;
  const t = setInterval(() => {
    if (!$('#debrief')) { clearInterval(t); return; }
    const backs = $$('.npcback-slot');
    const fronts = $$('.npcfront-slot');
    const b = backs[Math.floor(Math.random() * backs.length)];
    if (b) pulseClass(b, 'nod', 900);
    const f = fronts[Math.floor(Math.random() * fronts.length)];
    if (f) pulseClass(f, pool[Math.floor(Math.random() * pool.length)], 1100);
  }, every);
  return t;
}

function setCommanderMood(tier) {
  const cm = $('#cmdr-slot'), badge = $('#cmdr-mood');
  if (!cm) return;
  cm.classList.remove('mood-impressed', 'mood-thinking', 'mood-neutral');
  cm.classList.add(tier === 'high' ? 'mood-impressed' : tier === 'low' ? 'mood-thinking' : 'mood-neutral');
  if (badge) {
    badge.textContent = tier === 'high' ? '👍' : tier === 'low' ? '🤔' : '🧐';
    badge.classList.add('show');
  }
}

function playClipAwait(clip, agentEl, live) {
  return new Promise(res => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      Art.setMouth(agentEl, 0);
      res();
    };
    const p = Recorder.play(clip.blob, {
      onLevel: v => { if (live()) Art.setMouth(agentEl, v); },
      onEnd: finish,
    });
    if (p && p.catch) p.catch(finish);
    setTimeout(finish, 15000); // safety net
  });
}

async function runDebrief(gen) {
  const live = () => gen === App.debriefGen && !App.debriefSkip && !!$('#debrief');
  const skipBtn = $('#btn-skip');
  if (skipBtn) skipBtn.onclick = () => {
    App.debriefSkip = true;
    Recorder.stopPlayback();
  };

  const agentEl = $('#agent-slot');
  await sleep(650);
  if (!live()) { finaleDebrief(gen); return; }

  // the agent walks to the front of the room
  if (agentEl) agentEl.classList.add('walk-in');
  for (let k = 0; k < 5; k++) {
    if (!live()) break;
    Sfx.footstep();
    await sleep(235);
  }
  if (live()) await sleep(450);

  const tier = App.briefingTier || 'medium';
  setCommanderMood(tier);
  const reactTimer = scheduleReactions(tier);

  // play each recorded sentence — the student IS the presenter
  for (let i = 0; i < App.clips.length; i++) {
    if (!live()) break;
    const clip = App.clips[i];
    setStage('a');
    await typeInto($('#caption'), '🗣 ' + clip.text, 18);
    if (!live()) break;

    let cutTimer = null;
    if (i % 2 === 1) cutTimer = setTimeout(() => { if (live()) setStage('b'); }, 1100);
    await playClipAwait(clip, agentEl, live);
    clearTimeout(cutTimer);
    setStage('a');
    if (!live()) break;
    await sleep(700);
  }

  clearInterval(reactTimer);
  finaleDebrief(gen);
}

async function finaleDebrief(gen) {
  if (gen !== App.debriefGen || !$('#debrief')) return;
  Recorder.stopPlayback();
  setStage('a');
  const cap = $('#caption');
  if (cap) cap.textContent = '';
  const skipBtn = $('#btn-skip');
  if (skipBtn) skipBtn.remove();

  // the commander stands
  const cm = $('#cmdr-slot');
  if (cm) cm.classList.add('standing');
  Sfx.blip();
  await sleep(550);
  if (gen !== App.debriefGen) return;

  const bubble = $('#cmdr-bubble');
  if (bubble) {
    bubble.hidden = false;
    const line = CMDR_LINES[App.briefingTier || 'medium'](agentName());
    await typeInto(bubble, line, 32, false);
  }
  await sleep(350);
  if (gen !== App.debriefGen || !$('#debrief')) return;

  // celebration
  Sfx.applause(3.4);
  Sfx.fanfare();
  confetti(90);
  $$('.npcback-slot').forEach(el => el.classList.add('clap'));
  if (cm) cm.classList.add('clap');

  await sleep(1250);
  if (gen !== App.debriefGen || !$('#debrief')) return;
  const ov = $('#debrief-overlay');
  if (!ov) return;
  ov.hidden = false;
  ov.innerHTML = '<div class="stamp red giant">MISSION COMPLETE</div>';
  Sfx.stamp();
  await sleep(1150);
  if (gen !== App.debriefGen || !$('#debrief')) return;
  showScorePanel(ov);
}

function showScorePanel(ov) {
  const oldRank = rankFor(App.missionStartPoints);
  App.save.points += DATA.MISSION_BONUS;
  const closed = App.save.closed[App.char.id] || (App.save.closed[App.char.id] = {});
  closed[App.pack.id] = true;
  persist();
  const newRank = rankFor(App.save.points);
  const evidencePts = App.clips.length * DATA.POINTS_PER_CLIP;
  const tier = App.briefingTier || 'medium';
  const clarityLabel = { high: 'CRYSTAL CLEAR', medium: 'MOSTLY CLEAR', low: 'PARTIALLY RECEIVED' }[tier];
  const understandLabel = { high: 'FULL UNDERSTANDING', medium: 'GENERAL UNDERSTANDING', low: 'BASIC UNDERSTANDING' }[tier];
  const missionRank = rankLetter(App.briefingQuality != null ? App.briefingQuality : 0.75);

  ov.innerHTML = `
    <div class="panel score-panel">
      <h2>📋 MISSION REPORT</h2>
      <div class="eval-grid">
        <div class="eval-row"><span>🗂 Information Collected</span><b>${App.clips.length} / ${App.pack.steps.length}</b></div>
        <div class="eval-row"><span>📡 Communication Clarity</span><b>${clarityLabel}</b></div>
        <div class="eval-row"><span>🏢 HQ Understanding</span><b>${understandLabel}</b></div>
        <div class="eval-row rank"><span>🎖 Mission Rank</span><b class="rank-letter rank-${missionRank}">${missionRank}</b></div>
      </div>
      <div class="score-row"><span>🎙 Evidence recorded</span><b>${App.clips.length} × ${DATA.POINTS_PER_CLIP} = ${evidencePts}</b></div>
      <div class="score-row"><span>🏆 Mission bonus</span><b>+${DATA.MISSION_BONUS}</b></div>
      <div class="score-row total"><span>🏅 Total points</span><b>${App.save.points}</b></div>
      <div class="score-rank">${newRank.icon} RANK: <b>${newRank.name}</b></div>
      <div class="score-stars">⭐⭐⭐</div>
      <div class="dl-row">
        <span class="dl-hint">💾 save voice clips:</span>
        ${App.clips.map((cl, i) => `<button class="btn subtle dl-clip" data-i="${i}">clip ${i + 1}</button>`).join('')}
      </div>
      <div class="score-btns">
        <button class="btn" id="btn-again">▶ WATCH AGAIN</button>
        <button class="btn big primary" id="btn-new-mission">🗄 NEW MISSION</button>
      </div>
    </div>`;

  $('#btn-new-mission').onclick = showArchive;
  $('#btn-again').onclick = showDebrief;
  $$('.dl-clip').forEach(b => b.onclick = () => downloadClip(App.clips[+b.dataset.i], +b.dataset.i));

  if (newRank !== oldRank) {
    setTimeout(() => {
      if (!$('#debrief')) return;
      const pr = document.createElement('div');
      pr.className = 'promo-ov';
      pr.innerHTML = `<div class="promo-card">🎉 PROMOTION! 🎉<br>${newRank.icon} <b>${newRank.name}</b></div>`;
      document.body.appendChild(pr);
      Sfx.promo();
      setTimeout(() => pr.remove(), 2600);
    }, 700);
  }
}

function downloadClip(cl, i) {
  if (!cl) return;
  const a = document.createElement('a');
  const url = URL.createObjectURL(cl.blob);
  a.href = url;
  const slug = cl.text.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  a.download = `${App.char.name}_${i + 1}_${slug}.${cl.ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function confetti(n) {
  const host = $('.cinema');
  if (!host) return;
  const colors = ['#ffb400', '#e5484d', '#3fb950', '#2980b9', '#ff6fa5', '#9b59b6'];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'confetti';
    s.style.left = Math.random() * 100 + '%';
    s.style.background = colors[i % colors.length];
    s.style.animationDuration = (2.2 + Math.random() * 2) + 's';
    s.style.animationDelay = (Math.random() * 0.9) + 's';
    s.style.transform = `rotate(${Math.random() * 360}deg)`;
    host.appendChild(s);
    setTimeout(() => s.remove(), 5200);
  }
}

/* ============================================================
   BOOT
   ============================================================ */
window.addEventListener('DOMContentLoaded', async () => {
  await Art.loadOverrides();
  Sfx.setMuted(App.save.muted);
  // unlock audio on the first tap/click anywhere
  document.addEventListener('pointerdown', () => Sfx.getCtx(), { once: true });
  showTitle();
});
