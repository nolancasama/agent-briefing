/* ============================================================
   INTEL — English Typing Hack
   Type each word to push the hack forward. The mark's own facts
   are hidden in the word stream: typing one decrypts that line
   of the subject file. Mistakes freeze input briefly and raise
   the security alert; a full alert costs two words, never the
   game. Relaxed mode switches the alert off.
   ============================================================ */
(() => {
  'use strict';
  const D = typeof module !== 'undefined' && module.exports ? require('../data.js') : DATA;
  const rngFor = typeof module !== 'undefined' && module.exports ? require('../missions.js').rng : Missions.rng;
  const LENGTH = { 1: 10, 2: 12, 3: 14 };

  function shuffle(list, random) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const typed = value => value.toLowerCase().replace(/^(a|an) /, '');

  /* Pure sequence generation (unit-tested under Node). */
  function generate({ mark, pack, tier = 1, seed = 1 }) {
    const random = rngFor(seed);
    const facts = pack.steps.filter(s => s.factLabel !== 'NAME').map(s => ({
      key: s.factLabel === "DOESN'T LIKE" ? 'dislikes' : s.factLabel.toLowerCase(),
      value: s.fact(mark), sentence: s.answer(mark),
    }));
    const factWords = shuffle([{ text: mark.name.toLowerCase(), factKey: 'name', sentence: `This is ${mark.name}.` },
      ...facts.map(f => ({ text: typed(f.value), factKey: f.key, sentence: f.sentence }))], random);
    const used = new Set(factWords.map(w => w.text));
    let pool = [];
    for (let t = tier; t >= 1 && pool.length < LENGTH[tier]; t--) pool = pool.concat(shuffle(D.INTEL_VOCAB[t].filter(w => !used.has(w)), random));
    const filler = pool.slice(0, LENGTH[tier] - factWords.length).map(text => ({ text, factKey: null }));
    // Spread fact words through the stream so decrypted lines arrive steadily.
    const words = filler.slice();
    factWords.forEach((w, i) => {
      const at = Math.min(words.length, Math.round((i + 1) * (LENGTH[tier] / factWords.length)) - 1 - Math.floor(random() * 2));
      words.splice(Math.max(0, at), 0, w);
    });
    return { words, revealed: facts.map(f => f.key) };
  }

  function validate(puzzle, mark, pack, tier) {
    const errors = [];
    if (puzzle.words.length !== LENGTH[tier]) errors.push(`expected ${LENGTH[tier]} words, got ${puzzle.words.length}`);
    pack.steps.filter(s => s.factLabel !== 'NAME').forEach(s => {
      if (!puzzle.words.some(w => w.text === typed(s.fact(mark)))) errors.push(`missing fact word ${s.fact(mark)}`);
    });
    if (new Set(puzzle.words.map(w => w.text)).size !== puzzle.words.length) errors.push('a word repeats');
    if (puzzle.words.some(w => !/^[a-z]+( [a-z]+)*$/.test(w.text))) errors.push('only lowercase letters and single spaces');
    return errors;
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { generate, validate, LENGTH }; return; }

  /* ---------------- browser ---------------- */
  const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

  function mount(host, ctx) {
    const { kit, mark, profile } = ctx;
    const puzzle = generate({ mark, pack: ctx.pack, tier: ctx.tier, seed: ctx.seed });
    const words = puzzle.words, relaxed = ctx.relaxed;
    const rate = { 1: 1.1, 2: 1.5, 3: 1.9 }[ctx.tier];
    let index = 0, pos = 0, errors = 0, resets = 0, alert = 0, freeze = 0, finished = false;
    const decrypted = new Set();
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

    const root = document.createElement('div');
    root.className = 'mg-typing';
    root.innerHTML = `
      <div class="mgt-terminal">
        <div class="mgt-head"><span>SECURE TERMINAL // FILE ${mark.fileNo}</span><span>SUBJECT: ${mark.codename}</span></div>
        <div class="mgt-meters">
          <label>HACK PROGRESS<div class="mgt-bar"><i id="mgt-progress"></i></div></label>
          ${relaxed ? '<label class="mgt-relaxed">SECURITY ALERT <b>OFF · RELAXED MODE</b></label>' : '<label>SECURITY ALERT<div class="mgt-bar alert"><i id="mgt-alert"></i></div></label>'}
        </div>
        <div class="mgt-body">
          <div class="mgt-main">
            <div class="mgt-hint" id="mgt-hint">TYPE THE WORD</div>
            <div class="mgt-word" id="mgt-word" aria-live="polite"></div>
            <div class="mgt-queue" id="mgt-queue"></div>
          </div>
          <div class="mgt-log"><div class="mgt-log-title">DECRYPTED FILE</div><div id="mgt-log"></div></div>
        </div>
        <div class="mgt-keys" id="mgt-keys" ${coarse ? '' : 'hidden'}>
          ${ROWS.map(r => `<div>${r.split('').map(ch => `<button type="button" data-k="${ch}">${ch}</button>`).join('')}</div>`).join('')}
          <div><button type="button" class="space" data-k=" ">space</button></div>
        </div>
        <button type="button" class="btn ghost mgt-toggle" id="mgt-toggle">${coarse ? 'HIDE' : 'SHOW'} LETTER KEYS</button>
      </div>
      <div class="mgt-granted" id="mgt-granted" hidden></div>`;
    host.appendChild(root);
    const $ = s => root.querySelector(s);

    function render() {
      const w = words[index];
      if (!w) return;
      $('#mgt-word').innerHTML = w.text.split('').map((ch, i) =>
        `<span class="${i < pos ? 'ok' : i === pos ? 'cur' : ''}${ch === ' ' ? ' sp' : ''}">${ch === ' ' ? '␣' : ch}</span>`).join('');
      $('#mgt-word').classList.toggle('fact', !!w.factKey);
      $('#mgt-word').style.fontSize = w.text.length > 10 ? 'clamp(28px, 4.4vw, 46px)' : w.text.length > 7 ? 'clamp(34px, 5.6vw, 58px)' : '';
      $('#mgt-hint').textContent = w.factKey ? 'CLASSIFIED WORD — TYPE TO DECRYPT' : 'TYPE THE WORD';
      $('#mgt-queue').textContent = words.slice(index + 1, index + 4).map(x => x.factKey ? '■'.repeat(x.text.length) : x.text).join('   ');
      $('#mgt-progress').style.width = (index / words.length * 100) + '%';
    }
    function logLine(text, cls) {
      const p = document.createElement('p'); p.className = cls || ''; p.textContent = '> ' + text;
      $('#mgt-log').appendChild(p);
    }
    function wrong() {
      errors++; freeze = 0.6;
      if (!relaxed) alert = Math.min(100, alert + 5);
      const cur = $('#mgt-word .cur');
      if (cur) { cur.classList.remove('bad'); void cur.offsetWidth; cur.classList.add('bad'); }
      $('#mgt-word').classList.add('frozen');
      kit.sfx.tone({ f: 180, f2: 120, t: 0.14, type: 'square', v: 0.05 });
    }
    function press(ch) {
      if (finished || kit.paused || freeze > 0) return;
      const w = words[index];
      if (ch !== w.text[pos]) { wrong(); return; }
      pos++;
      if (!relaxed) alert = Math.max(0, alert - 0.6);
      kit.sfx.tone({ f: 880 + pos * 40, t: 0.04, type: 'square', v: 0.035 });
      if (pos >= w.text.length) {
        if (w.factKey && !decrypted.has(w.factKey)) {
          decrypted.add(w.factKey);
          logLine(w.sentence, 'fact');
          kit.sfx.good();
        } else kit.sfx.tone({ f: 1320, f2: 1760, t: 0.08, type: 'sine', v: 0.05 });
        index++; pos = 0;
        if (index >= words.length) { finish(); return; }
      }
      render();
    }
    function firewall() {
      resets++; alert = 25; freeze = 1.2;
      index = Math.max(0, index - 2); pos = 0;
      kit.sfx.tone({ f: 520, f2: 260, t: 0.5, type: 'sawtooth', v: 0.06 });
      logLine('FIREWALL RESET — 2 words lost. Keep going!', 'warn');
      root.classList.add('alarm'); kit.after(900, () => root.classList.remove('alarm'));
      render();
    }
    function finish() {
      finished = true;
      $('#mgt-progress').style.width = '100%';
      const score = Math.max(40, 100 - errors * 2 - resets * 10);
      const lines = [`This is ${mark.name}.`, ...profile.packFacts.map(f => f.sentence)];
      const panel = $('#mgt-granted');
      panel.hidden = false;
      panel.innerHTML = `<div class="mgt-granted-stamp">ACCESS GRANTED</div>
        <div class="mgt-file"><div class="mgt-file-tab">CLASSIFIED // ${mark.codename}</div>
          ${lines.map((l, i) => `<p style="animation-delay:${0.5 + i * 0.25}s">${l}</p>`).join('')}</div>
        <button type="button" class="btn primary big" id="mgt-continue">OPEN THE FILE</button>`;
      kit.sfx.success();
      kit.on($('#mgt-continue'), 'click', () => ctx.done({ success: true, score, revealed: puzzle.revealed, stats: { errors, resets, words: words.length } }));
      $('#mgt-continue').focus();
    }

    kit.on(window, 'keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey || finished) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : null;
      if (!k || !/[a-z ]/.test(k)) return;
      e.preventDefault();
      press(k);
    });
    root.querySelectorAll('[data-k]').forEach(b => kit.on(b, 'pointerdown', e => { e.preventDefault(); press(b.dataset.k); }));
    kit.on($('#mgt-toggle'), 'click', () => {
      const keys = $('#mgt-keys'); keys.hidden = !keys.hidden;
      $('#mgt-toggle').textContent = (keys.hidden ? 'SHOW' : 'HIDE') + ' LETTER KEYS';
    });

    kit.loop(dt => {
      if (finished) return;
      if (freeze > 0) { freeze -= dt; if (freeze <= 0) $('#mgt-word').classList.remove('frozen'); }
      if (!relaxed) {
        alert += rate * dt;
        if (alert >= 100) firewall();
      }
    }, () => {
      const a = $('#mgt-alert');
      if (a) { a.style.width = alert + '%'; a.parentNode.classList.toggle('hot', alert > 70); }
    });

    logLine('Connecting to secure server…');
    logLine('Find the classified words!');
    render();
    return { destroy() { root.remove(); } };
  }

  Minigames.register({
    id: 'typing', kind: 'intel', title: 'ENGLISH TYPING HACK',
    brief: c => `Hack the security terminal. Type each word to decrypt ${c.mark.name}'s file.`,
    mount,
  });
})();
