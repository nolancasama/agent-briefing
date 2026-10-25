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
  recTimeout: 0, recClock: 0, missionStartPoints: 0,
  debriefGen: 0, debriefSkip: false,
  autoSendTimeout: 0, missionRewarded: false,
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
  Recorder.release();
  clearTimeout(App.recTimeout);
  clearTimeout(App.autoSendTimeout);
  clearInterval(App.recClock);
  const app = $('#app');
  app.className = 'screen-' + cls;
  app.innerHTML = html;
}

/* ---------- briefing evaluation ----------
   All the judgement lives in js/evaluate.js (unit-tested in
   test-eval.js). Here we only adapt a grammar-pack step into the
   { fact, frame } target that module expects.

   Recognition never gates play: a mismatch or an unverifiable clip
   still records, still sends, still appears in the debrief. */
function targetFor(step, c) {
  return { fact: step.fact(c), frame: step.prompt(c) };
}

function hudHTML() {
  const r = rankFor(App.save.points);
  return `<div class="hud">
    <div class="hud-chip hud-rank">${r.icon} <b>${r.name}</b></div>
    <div class="hud-chip hud-pts">${Icons.medal(16)} <b id="hud-points">${App.save.points}</b> pts</div>
    <button class="btn ghost" id="btn-mute" title="Sound on/off" aria-label="Sound on/off">${App.save.muted ? Icons.soundOff(20) : Icons.soundOn(20)}</button>
  </div>`;
}

function wireHud() {
  const b = $('#btn-mute');
  if (b) b.onclick = () => {
    App.save.muted = !App.save.muted;
    Sfx.setMuted(App.save.muted);
    persist();
    b.innerHTML = App.save.muted ? Icons.soundOff(20) : Icons.soundOn(20);
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
      <div class="title-tape">TOP SECRET</div>
      <h1 class="title-big"><span>AGENT</span> <span>BRIEFING</span></h1>
      <p class="title-sub">SPEAK ENGLISH · COMPLETE THE MISSION</p>
      <div class="title-btns">
        <button class="btn primary big" id="btn-start">${Icons.play(22)} START MISSION</button>
        <button class="btn ghost" id="btn-agent-id">${Icons.id(20)} AGENT ID</button>
      </div>
      <p class="radio-line" id="title-radio"></p>
    </div>`, 'title');
  wireHud();
  $('#btn-start').onclick = () => {
    Sfx.blip();
    if (App.save.avatar) showArchive(); else showAgentId(true);
  };
  $('#btn-agent-id').onclick = () => showAgentId(false);
  typeInto($('#title-radio'), 'HQ // Welcome, Agent. Headquarters needs your report…', 30, false);
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
      <h2 class="panel-title">AGENT ID CARD</h2>
      <div class="agent-gender-picker">
        <span class="opt-label">CHOOSE YOUR AGENT</span>
        <div class="agent-gender-options">
          ${[{gender:'m', label:'MALE AGENT'},{gender:'f',label:'FEMALE AGENT'}].map(p => `<button class="agent-gender-choice ${av.gender === p.gender ? 'sel' : ''}" data-gender="${p.gender}" aria-pressed="${av.gender === p.gender}">
            <span class="agent-gender-model">${Art.agentFull(Object.assign({}, av, {gender:p.gender,hair:p.gender==='f' && av.hair==='short' ? 'bob' : av.hair}), 78)}</span>
            <span>${p.label}</span>
          </button>`).join('')}
        </div>
      </div>
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
          <div class="opt-row"><span class="opt-label">OUTFIT</span>
            <div class="opt-vals">
              ${DATA.AVATAR_OPTIONS.outfits.map((opt, i) => `<button class="pill ${av.outfit === opt ? 'sel' : ''}" data-key="outfit" data-val="${opt}">${['SUIT','TRENCH COAT','SKIRT SUIT'][i]}</button>`).join('')}
            </div></div>
          ${swatchRow('CLOTHES COLOR', 'suit', DATA.AVATAR_OPTIONS.suits)}
          ${swatchRow('TIE / DETAIL', 'tie', DATA.AVATAR_OPTIONS.ties)}
          <div class="opt-row"><span class="opt-label">SUNGLASSES</span>
            <div class="opt-vals">
              <button class="pill ${av.shades ? 'sel' : ''}" data-key="shades" data-val="1">ON</button>
              <button class="pill ${!av.shades ? 'sel' : ''}" data-key="shades" data-val="">OFF</button>
            </div></div>
        </div>
      </div>
      <div class="agentid-btns">
        <button class="btn ghost" id="btn-agent-back">${Icons.back(18)} BACK</button>
        <button class="btn secondary big" id="btn-agent-save">${Icons.check(20)} SAVE &amp; CONTINUE</button>
      </div>
    </div>`, 'agentid');
  wireHud();

  const state = Object.assign({}, av);
  const refreshAgentPreview = () => {
    $('#av-preview').innerHTML = Art.agentFull(state, 150);
    $$('.agent-gender-choice').forEach(card => {
      const model = card.querySelector('.agent-gender-model');
      if (model) model.innerHTML = Art.agentFull(Object.assign({}, state, {gender: card.dataset.gender}), 78);
    });
  };
  $$('.agent-gender-choice').forEach(b => b.onclick = () => {
    const next = b.dataset.gender;
    if (state.gender === next) return;
    if (next === 'f' && state.hair === 'short') state.hair = 'bob';
    if (next === 'm' && state.hair === 'bob') state.hair = 'short';
    state.gender = next;
    $$('.agent-gender-choice').forEach(card => {
      const selected = card.dataset.gender === next;
      card.classList.toggle('sel', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
    $$('[data-key="hair"]').forEach(x => {
      if (x.dataset.val) x.classList.toggle('sel', x.dataset.val === state.hair);
    });
    refreshAgentPreview();
    Sfx.click();
  });
  $$('.swatch, .pill').forEach(b => {
    if (!b.dataset.key) return;
    b.onclick = () => {
      const k = b.dataset.key;
      state[k] = k === 'shades' ? !!b.dataset.val : b.dataset.val;
      Sfx.click();
      $$(`[data-key="${k}"]`).forEach(x => x.classList.toggle('sel',
        k === 'shades' ? (!!x.dataset.val === !!state[k]) : x.dataset.val === String(state[k])));
      refreshAgentPreview();
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
      <h2 class="archive-title">${Icons.archive(24)} INTELLIGENCE ARCHIVE</h2>
      <p class="archive-sub">Choose a Person of Interest to investigate</p>
      <div class="pack-toggle">
        ${packs.map((p, i) => `<button class="pack-btn ${p.id === curPack.id ? 'sel' : ''}" data-pack="${p.id}" aria-pressed="${p.id === curPack.id}">${i === 0 ? 'FIRST REPORT' : 'DEEP COVER'}</button>`).join('')}
      </div>
      <div class="dossier-grid">
        ${DATA.CHARACTERS.map(c => {
          const done = App.save.closed[c.id] || {};
          return `<button class="dossier-card" data-id="${c.id}">
            <span class="folder-tab">${esc(c.codename)}</span>
            <span class="polaroid"><span class="clip"></span>${Art.portrait(c)}</span>
            <span class="file-no">FILE No. ${c.fileNo}</span>
            ${done[curPack.id]
              ? `<span class="mini-stamp green">CASE CLOSED ${Icons.check(12)}</span>`
              : '<span class="mini-stamp red">CLASSIFIED</span>'}
          </button>`;
        }).join('')}
      </div>
      <button class="btn ghost" id="btn-back-title">${Icons.back(18)} HQ LOBBY</button>
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
        <button class="btn ghost" id="btn-back-archive">${Icons.back(18)} BACK</button>
        <button class="btn primary big" id="btn-accept">${Icons.mic(22)} ACCEPT MISSION</button>
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
    // NAME already appears in the typed identity header above. Keep the
    // dossier's facts for the additional intelligence only.
    if (s.factLabel === 'NAME') continue;
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
  App.briefing = null;
  App.briefingTier = 'medium';
  App.missionRewarded = false;
  Sfx.bgmStop();

  setScreen(`
    ${hudHTML()}
    <div class="mission-wrap">
      <div class="intel-display">
        <div class="mission-head">
          <span class="tech-label">HQ // CHANNEL 04</span>
          <span class="tech-label" id="report-count">REPORT 1 / ${App.pack.steps.length}</span>
        </div>
        <div class="hq-question" id="radio-msg"></div>
        <div class="mission-display-body">
          <div class="mission-photo">
            <div class="polaroid"><span class="clip"></span>${Art.portrait(App.char, 190, 215)}</div>
            <div class="mission-name">PERSON OF INTEREST // ${esc(App.char.name)}</div>
          </div>
          <div class="mission-main">
            <div class="fact-card" id="fact-card"></div>
            <div class="prompt-big" id="prompt-big"></div>
            <div class="rec-zone" id="rec-zone"></div>
          </div>
        </div>
      </div>
      <button class="btn danger" id="btn-abort">${Icons.close(18)} ABORT MISSION</button>
    </div>`, 'mission');
  wireHud();
  $('#btn-abort').onclick = () => { Recorder.stopPlayback(); Recorder.release(); clearTimeout(App.recTimeout); showArchive(); };
  runStep();
}

async function runStep() {
  const i = App.step, s = App.pack.steps[i], c = App.char;
  const report = $('#report-count');
  if (report) report.textContent = `REPORT ${i + 1} / ${App.pack.steps.length}`;

  const fc = $('#fact-card');
  if (!fc) return;
  const prompt = s.prompt(c);
  const cue = prompt.includes('______') ? prompt.split('______')[0].trim() : '';
  fc.innerHTML = `<span class="fact-label">${esc(s.factLabel)}</span>
    <span class="fact-cue">${esc(cue)}</span>
    <b class="fact-value" id="fact-value"></b>`;
  $('#prompt-big').innerHTML = '';
  renderRecZone('idle');

  Sfx.blip();
  await typeInto($('#radio-msg'), s.radio(c), 20);
  await typeInto($('#fact-value'), s.fact(c), 34);
  const pb = $('#prompt-big');
  if (pb) {
    pb.innerHTML = esc(s.prompt(c)).replace(/______/g, '<span class="blank">______</span>');
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
      <button class="mic-btn" id="btn-mic" aria-label="Record"><span class="mic-ico">${Icons.mic(38)}</span><span class="mic-txt">RECORD</span></button>
      <div class="rec-side">
        <button class="btn ghost" id="btn-example">${Icons.soundOn(18)} EXAMPLE</button>
        <div class="rec-hint">Press, then say the sentence!</div>
      </div>`;
    $('#btn-mic').onclick = beginCountdown;
    $('#btn-example').onclick = speakExample;

  } else if (state === 'count') {
    z.innerHTML = `<div class="countdown" id="countdown">READY</div>`;

  } else if (state === 'rec') {
    z.innerHTML = `
      <button class="mic-btn recording" id="btn-mic" aria-label="Stop recording"><span class="mic-ico">${Icons.stop(34)}</span><span class="mic-txt">STOP</span></button>
      <div class="rec-side">
        <div class="wave" id="wave">${'<span></span>'.repeat(7)}</div>
        <div class="rec-clock" id="rec-clock">REC 0:00</div>
        <div class="rec-timer"><div class="rec-timer-fill" id="rec-timer-fill"></div></div>
      </div>`;
    $('#btn-mic').onclick = stopRec;

  } else if (state === 'review') {
    const forceRetry = data.quiet && App.quietTries < 2;
    const duration = App.pendingClip ? App.pendingClip.dur.toFixed(1) + 's' : '0.0s';
    z.innerHTML = `
      ${data.quiet ? '<div class="quiet-note">HQ could not hear the signal. Please speak louder.</div>' : ''}
      ${data.autoSend ? '<div class="auto-send-note">INTELLIGENCE VERIFIED — SENDING TO HQ...</div>' : ''}
      <div class="review-row">
        <button class="btn ghost review-play" id="btn-play" aria-label="Play recording">${Icons.play(22)} <span>${duration}</span></button>
        <button class="btn secondary" id="btn-retry">${Icons.retry(19)} AGAIN</button>
        <button class="btn primary big" id="btn-send" ${forceRetry || data.autoSend ? 'disabled' : ''}>${Icons.send(21)} SEND TO HQ</button>
      </div>`;
    $('#btn-play').onclick = () => { if (App.pendingClip) Recorder.play(App.pendingClip.blob); };
    $('#btn-retry').onclick = () => { Recorder.stopPlayback(); beginCountdown(); };
    $('#btn-send').onclick = sendClip;
  }
}

async function beginCountdown() {
  clearTimeout(App.autoSendTimeout);
  if (!Recorder.supported()) {
    hqToast('This browser cannot record audio — please use Chrome or Edge.');
    return;
  }
  renderRecZone('count');
  const cd = $('#countdown');
  if (cd) cd.innerHTML = Icons.send(34);
  try {
    await Recorder.init();
  } catch (err) {
    renderRecZone('idle');
    hqToast('Microphone blocked. Allow microphone access in the address bar, then try again.');
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
  const clockStarted = performance.now();
  clearInterval(App.recClock);
  App.recClock = setInterval(() => {
    const clock = $('#rec-clock');
    if (clock) clock.textContent = 'REC 0:' + String(Math.floor((performance.now() - clockStarted) / 1000)).padStart(2, '0');
  }, 100);
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
    if (!Evaluate.looksComplete(targetFor(step, App.char), transcript)) return;
    autoStopArmed = true;
    clearTimeout(App.recTimeout);
    // Very fast children may finish before 900ms. Remember recognition
    // rather than throwing it away and waiting for an unnecessary 8s.
    const minimumSpeechMs = Math.max(0, 900 - (performance.now() - recStartedAt));
    App.recTimeout = setTimeout(stopRec, minimumSpeechMs + 500);
  });
  App.recTimeout = setTimeout(stopRec, 8000);
}

async function stopRec() {
  clearTimeout(App.recTimeout);
  clearInterval(App.recClock);
  if (App.recState !== 'rec') return;
  App.recState = 'stopping';
  const [clip, stt] = await Promise.all([Recorder.stop(), Recorder.stopRecognition()]);
  if (!clip || !$('#rec-zone')) return;
  clip.stt = stt;
  App.pendingClip = clip;
  const quiet = clip.peak < 0.035 || clip.dur < 0.35;
  if (quiet) App.quietTries++; else App.quietTries = 0;
  Sfx.paper();
  // Only auto-send when HQ has actually heard the target FACT *and*
  // its sentence frame. A merely plausible/interim/partial recognizer
  // result still gets a manual SEND button, never an automatic rejection.
  const target = targetFor(App.pack.steps[App.step], App.char);
  const verified = !quiet &&
    Evaluate.evaluateClip(target, stt).verification === 'confirmed' &&
    Evaluate.looksComplete(target, stt && stt.transcript);
  renderRecZone('review', { quiet, autoSend: verified });
  if (verified) {
    App.autoSendTimeout = setTimeout(() => {
      if (App.recState === 'review' && App.pendingClip === clip) sendClip();
    }, 550);
  }
}

async function sendClip() {
  if (App.recState !== 'review' || !App.pendingClip) return;
  clearTimeout(App.autoSendTimeout);
  App.recState = 'sending';
  Recorder.stopPlayback();

  const s = App.pack.steps[App.step];
  const evalResult = Evaluate.evaluateClip(targetFor(s, App.char), App.pendingClip.stt);
  App.clips.push({
    text: s.answer(App.char),
    blob: App.pendingClip.blob,
    ext: App.pendingClip.ext,
    eval: evalResult,
  });
  App.pendingClip = null;
  App.quietTries = 0;

  /* Truthful stamp: only claim VERIFIED when the fact actually came
     through. Anything else is still accepted and still scores points —
     it just says "received" rather than "verified". No child is told
     mid-mission that they were wrong; that detail belongs in the
     after-action report. */
  const z = $('#rec-zone');
  if (z) {
    z.innerHTML = '<div class="verify-slot" id="verify-slot"></div>';
    const confirmed = evalResult.verification === 'confirmed';
    slamStamp($('#verify-slot'),
      confirmed ? 'VERIFIED' : 'RECEIVED',
      confirmed ? 'green' : 'amber');
  }
  Sfx.chime();
  addPoints(DATA.POINTS_PER_CLIP);
  await sleep(1050);
  App.step++;
  if (!$('#rec-zone')) return;
  if (App.step < App.pack.steps.length) runStep();
  else missionEvidenceDone();
}

function missionEvidenceDone() {
  Recorder.release(); // finished speaking: turn off the browser's live microphone
  App.briefing = Evaluate.evaluateMission(App.clips.map(c => c.eval));
  App.briefingTier = App.briefing.tier;

  const m = $('.mission-display-body');
  if (!m) return;
  m.innerHTML = `<div class="evidence-done">
    <div class="stamp gold big">ALL EVIDENCE COLLECTED</div>
    <p>HQ is waiting for your briefing, Agent${esc(agentName())}!</p>
    <button class="btn primary big" id="btn-to-debrief">${Icons.building(22)} GO TO HEADQUARTERS</button>
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
        </div>
        <div class="stage stage-b offstage" id="stage-b">
          <div class="room-wall dark"></div>
          <div class="npc-fronts">
            ${[0, 1, 2].map(i => `<div class="npcfront-slot ${i === 1 ? 'lead-official' : ''}" ${i === 1 ? 'id="lead-official"' : ''}>${Art.npcFront(i)}</div>`).join('')}
          </div>
          <div class="official-reply" id="official-reply" hidden></div>
        </div>
        <div class="cut-flash" id="cut-flash"></div>
        <div class="caption-bar" id="caption"></div>
        <div class="debrief-overlay" id="debrief-overlay" hidden></div>
      </div>
      <button class="btn ghost skip-btn" id="btn-skip">${Icons.skip(18)} SKIP</button>
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

/* The commander never claims HQ understood more than it did. When
   nothing could be verified he thanks the agent for the report itself
   rather than praising content he cannot vouch for. */
const OFFICIAL_LINES = {
  high:   name => `“Excellent work, Agent${name}!”`,
  medium: name => `“Good report, Agent${name}. We have what we need.”`,
  low:    name => `“We gathered useful information, Agent${name}. Let's make the next report even clearer.”`,
  unverified: name => `“Report received, Agent${name}. Good work out there.”`,
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

function setLeadOfficialMood(tier) {
  const lead = $('#lead-official');
  if (lead) lead.dataset.mood = tier;
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
  setLeadOfficialMood(tier);
  const reactTimer = scheduleReactions(tier);

  // play each recorded sentence — the student IS the presenter
  for (let i = 0; i < App.clips.length; i++) {
    if (!live()) break;
    const clip = App.clips[i];
    setStage('a');
    await typeInto($('#caption'), clip.text, 18);
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

  // The center listener is HQ's lead analyst and delivers the reply.
  // Keep the room in the listener's camera view so the voice has an
  // obvious source, rather than inventing a separate commander.
  setStage('b');
  const lead = $('#lead-official');
  if (lead) lead.classList.add('replying');
  Sfx.blip();
  await sleep(550);
  if (gen !== App.debriefGen || !$('#debrief')) return;

  const bubble = $('#official-reply');
  if (bubble) {
    bubble.hidden = false;
    const key = App.briefing && !App.briefing.rank ? 'unverified' : (App.briefingTier || 'medium');
    const line = OFFICIAL_LINES[key](agentName());
    await typeInto(bubble, line, 32, false);
  }
  await sleep(350);
  if (gen !== App.debriefGen || !$('#debrief')) return;

  // celebration
  Sfx.applause(3.4);
  Sfx.fanfare();
  confetti(90);
  $$('.npcback-slot, .npcfront-slot').forEach(el => el.classList.add('clap'));

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
  // Replaying a briefing is free; it must never issue another mission bonus.
  const firstReport = !App.missionRewarded;
  if (firstReport) {
    App.save.points += DATA.MISSION_BONUS;
    const closed = App.save.closed[App.char.id] || (App.save.closed[App.char.id] = {});
    closed[App.pack.id] = true;
    App.missionRewarded = true;
    persist();
  }
  const newRank = rankFor(App.save.points);
  const evidencePts = App.clips.length * DATA.POINTS_PER_CLIP;
  const b = App.briefing || Evaluate.evaluateMission(App.clips.map(c => c.eval));

  /* No grade is invented when nothing could be verified — the report
     says so instead of guessing. */
  const rankBlock = b.rank
    ? `<div class="aar-rank-letter rank-${b.rank}">${b.rank}</div>`
    : `<div class="aar-rank-none">SIGNAL<br>UNVERIFIED</div>`;
  const allUnverified = !b.rank;

  ov.innerHTML = `
    <div class="aar">
      <div class="aar-head">
        <span class="aar-kicker">CLASSIFIED // AGENT${esc(agentName())}</span>
        <h2 class="aar-title">AFTER-ACTION REPORT</h2>
      </div>

      <div class="aar-rank">
        <span class="aar-rank-label">MISSION RANK</span>
        ${rankBlock}
      </div>

      <div class="aar-rows">
        <div class="aar-row"><span>INTELLIGENCE</span><b>${App.clips.length} / ${App.pack.steps.length}</b></div>
        <div class="aar-row"><span>CONTENT</span><b>${allUnverified ? '—' : esc(b.contentLabel)}</b></div>
        <div class="aar-row"><span>TRANSMISSION</span><b>${allUnverified ? 'HQ received the clips; words could not be checked.' : esc(b.transmissionLabel)}</b></div>
      </div>

      <div class="aar-points">
        <div class="aar-row"><span>EVIDENCE RECORDED</span><b>${App.clips.length} × ${DATA.POINTS_PER_CLIP} = ${evidencePts}</b></div>
        <div class="aar-row"><span>MISSION BONUS</span><b>+${DATA.MISSION_BONUS}</b></div>
        <div class="aar-row total"><span>TOTAL POINTS</span><b>${App.save.points}</b></div>
        <div class="aar-row"><span>AGENT RANK</span><b>${esc(newRank.name)}</b></div>
      </div>

      <div class="aar-seal"><span class="aar-seal-mark"></span><span class="aar-seal-txt">HQ LEAD ANALYST</span></div>

      <div class="aar-dl">
        <span class="aar-dl-hint">SAVE VOICE CLIPS</span>
        ${App.clips.map((cl, i) => `<button class="btn ghost dl-clip" data-i="${i}">${i + 1}</button>`).join('')}
      </div>

      <div class="aar-btns">
        <button class="btn secondary" id="btn-again">${Icons.play(18)} WATCH AGAIN</button>
        <button class="btn primary big" id="btn-new-mission">${Icons.folder(21)} NEW MISSION</button>
      </div>
    </div>`;

  $('#btn-new-mission').onclick = showArchive;
  $('#btn-again').onclick = showDebrief;
  $$('.dl-clip').forEach(b => b.onclick = () => downloadClip(App.clips[+b.dataset.i], +b.dataset.i));

  if (firstReport && newRank !== oldRank) {
    setTimeout(() => {
      if (!$('#debrief')) return;
      const pr = document.createElement('div');
      pr.className = 'promo-ov';
      pr.innerHTML = `<div class="promo-card">PROMOTION<br>${newRank.icon} <b>${newRank.name}</b></div>`;
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
  const colors = ['#ffbd3f', '#d94a52', '#37b7d8', '#f4ead5'];
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
