/* ============================================================
   INTEL — Password Cracking
   One vault per fact in the grammar pack. Each password is a word
   from the mark's file; English clues go from general to specific.
   The agent builds the word from letter tiles (or the keyboard).
   Deduction, not speed: there is no timer.
   ============================================================ */
(() => {
  'use strict';
  const D = typeof module !== 'undefined' && module.exports ? require('../data.js') : DATA;
  const rngFor = typeof module !== 'undefined' && module.exports ? require('../missions.js').rng : Missions.rng;

  // The shared bank covers has/likes/wants/dislikes; personality and
  // abilities need their own clue sets.
  const EXTRA = [
    ['KIND', 'kind', 'It is a word about a person.', 'This person is nice.', 'This person helps others and shares.'],
    ['FUNNY', 'funny', 'It is a word about a person.', 'This person makes jokes.', 'This person makes friends laugh.'],
    ['BRAVE', 'brave', 'It is a word about a person.', 'This person is strong inside.', 'This person is not afraid.'],
    ['SMART', 'smart', 'It is a word about a person.', 'This person studies well.', 'This person knows many answers.'],
    ['FRIENDLY', 'friendly', 'It is a word about a person.', 'This person says hello.', 'This person makes friends easily.'],
    ['HAPPY', 'happy', 'It is a word about a person.', 'This person smiles a lot.', 'This person feels good, not sad.'],
    ['SWIM', 'swim', 'You can do it.', 'You do it in water.', 'You do it in a pool with your arms and legs.'],
    ['SING', 'sing', 'You can do it.', 'You use your voice.', 'You do it with music and a song.'],
    ['RUN', 'run fast', 'You can do it.', 'You use your legs.', 'You do it in a race. It is faster than walking.'],
    ['DANCE', 'dance', 'You can do it.', 'You move your body.', 'You move to music at a party.'],
    ['PIANO', 'play the piano', 'It makes music.', 'It is an instrument.', 'It has black and white keys.'],
  ].map(([answer, factValue, ...clues]) => ({ answer, factValue, clues }));
  const ALIAS = { 'ride a bike': 'BIKE' };
  const BANK = D.PASSWORD_BANK.concat(EXTRA);
  const DECOYS = { 1: 3, 2: 5, 3: 7 };
  const ABOUT = {
    personality: n => `a word about ${n}`, likes: n => `something ${n} likes`, can: n => `something ${n} can do`,
    has: n => `something ${n} has`, wants: n => `something ${n} wants`, dislikes: n => `something ${n} doesn't like`,
  };

  function shuffle(list, random) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function entryFor(value) {
    return ALIAS[value] ? BANK.find(e => e.answer === ALIAS[value]) : BANK.find(e => e.factValue === value);
  }

  /* Pure puzzle generation (unit-tested under Node). */
  function generate({ mark, pack, tier = 1, seed = 1 }) {
    const random = rngFor(seed);
    const facts = pack.steps.filter(s => s.factLabel !== 'NAME').map(s => ({
      key: s.factLabel === "DOESN'T LIKE" ? 'dislikes' : s.factLabel.toLowerCase(), value: s.fact(mark), sentence: s.answer(mark),
    }));
    const vaults = shuffle(facts, random).map(f => {
      const entry = entryFor(f.value);
      const letters = entry.answer.split('');
      const spare = 'ABCDEFGHIJKLMNOPRSTUWY'.split('').filter(ch => !letters.includes(ch));
      const pool = shuffle(letters.concat(shuffle(spare, random).slice(0, DECOYS[tier])), random);
      return { key: f.key, value: f.value, sentence: f.sentence, about: ABOUT[f.key](mark.name), answer: entry.answer, clues: entry.clues.slice(), pool };
    });
    return { vaults, revealed: facts.map(f => f.key) };
  }

  function validate(puzzle, mark) {
    const errors = [];
    const finals = new Map(BANK.map(e => [e.clues[e.clues.length - 1], e.answer]));
    if (finals.size !== BANK.length) errors.push('two bank entries share a final clue');
    if (new Set(BANK.map(e => e.answer)).size !== BANK.length) errors.push('two bank entries share an answer');
    puzzle.vaults.forEach(v => {
      if (mark.facts[v.key].value !== v.value) errors.push(`${v.answer} is not ${mark.name}'s ${v.key}`);
      const pool = v.pool.slice();
      v.answer.split('').forEach(ch => { const i = pool.indexOf(ch); if (i < 0) errors.push(`${v.answer}: tile ${ch} missing`); else pool.splice(i, 1); });
      if (v.clues.length < 3) errors.push(`${v.answer}: needs three clues`);
      if (!/^[A-Z]+$/.test(v.answer)) errors.push(`${v.answer}: letters only`);
    });
    return errors;
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { generate, validate, BANK, entryFor }; return; }

  /* ---------------- browser ---------------- */
  function mount(host, ctx) {
    const { kit, mark } = ctx;
    const puzzle = generate({ mark, pack: ctx.pack, tier: ctx.tier, seed: ctx.seed });
    let v = 0, score = 100, wrong = 0, hints = 0, extraClues = 0, totalWrong = 0, shown = 1, busy = false;
    let slots = [], used = [], locked = 0;

    const root = document.createElement('div');
    root.className = 'mg-password';
    root.innerHTML = `
      <div class="mgw-vault" id="mgw-vault">
        <div class="mgw-inside" id="mgw-inside"></div>
        <svg viewBox="-100 -100 200 200" class="mgw-door" aria-hidden="true">
          <circle r="94" class="rim"/><circle r="80" class="face"/>
          <g class="dial" id="mgw-dial">${Array.from({ length: 24 }, (_, i) => `<line x1="0" y1="-62" x2="0" y2="${i % 3 ? -54 : -48}" transform="rotate(${i * 15})"/>`).join('')}
            <circle r="40" class="knob"/><rect x="-5" y="-40" width="10" height="26" rx="3" class="handle"/></g>
          ${[0, 90, 180, 270].map(a => `<rect x="-8" y="-92" width="16" height="14" rx="3" class="bolt" transform="rotate(${a})"/>`).join('')}
        </svg>
        <div class="mgw-light" id="mgw-light"></div>
        <div class="mgw-count" id="mgw-count"></div>
      </div>
      <div class="mgw-console">
        <div class="mgw-top"><span id="mgw-about"></span><span>SCORE <b id="mgw-score">100</b></span></div>
        <ol class="mgw-clues" id="mgw-clues"></ol>
        <div class="mgw-slots" id="mgw-slots"></div>
        <div class="mgw-pool" id="mgw-pool"></div>
        <div class="mgw-actions">
          <button type="button" class="btn ghost" id="mgw-clue">NEXT CLUE −10</button>
          <button type="button" class="btn ghost" id="mgw-hint" hidden>HINT</button>
          <button type="button" class="btn secondary" id="mgw-clear">CLEAR</button>
          <button type="button" class="btn primary" id="mgw-check">CHECK</button>
        </div>
        <div class="mgw-msg" id="mgw-msg" aria-live="polite"></div>
      </div>`;
    host.appendChild(root);
    const $ = s => root.querySelector(s);
    const cur = () => puzzle.vaults[v];

    function setup() {
      const p = cur();
      shown = 1; wrong = 0; locked = 0; busy = false;
      slots = Array(p.answer.length).fill(null); used = Array(p.pool.length).fill(false);
      root.classList.remove('open');
      $('#mgw-count').textContent = `VAULT ${v + 1} / ${puzzle.vaults.length}`;
      $('#mgw-about').innerHTML = `PASSWORD: <b>${p.about}</b>`;
      $('#mgw-hint').hidden = true;
      msg('Read the clue. Build the password.', '');
      draw();
      kit.sfx.blip();
    }
    function msg(text, cls) { const m = $('#mgw-msg'); m.textContent = text; m.className = 'mgw-msg ' + cls; }
    function draw() {
      const p = cur();
      $('#mgw-clues').innerHTML = p.clues.slice(0, shown).map((c, i) => `<li class="${i === shown - 1 ? 'new' : ''}">${c}</li>`).join('');
      $('#mgw-clue').disabled = shown >= p.clues.length;
      $('#mgw-slots').innerHTML = slots.map((s, i) => `<button type="button" class="slot ${i < locked ? 'locked' : ''} ${s ? 'full' : ''}" data-i="${i}">${s ? s.ch : ''}</button>`).join('');
      $('#mgw-pool').innerHTML = p.pool.map((ch, i) => `<button type="button" class="tile" data-i="${i}" ${used[i] ? 'disabled' : ''}>${ch}</button>`).join('');
      $('#mgw-score').textContent = score;
    }
    function place(i) {
      if (busy || used[i]) return;
      const at = slots.indexOf(null);
      if (at < 0) return;
      slots[at] = { ch: cur().pool[i], from: i }; used[i] = true;
      kit.sfx.tone({ f: 660, t: 0.05, type: 'triangle', v: 0.06 });
      draw();
      if (slots.indexOf(null) < 0) msg('Press CHECK (or Enter).', '');
    }
    function remove(at) {
      if (busy || at < locked || !slots[at]) return;
      used[slots[at].from] = false; slots[at] = null;
      // keep letters packed to the left
      const rest = slots.slice(locked).filter(Boolean);
      slots = slots.slice(0, locked).concat(rest, Array(slots.length - locked - rest.length).fill(null));
      draw();
    }
    function clear() { for (let i = slots.length - 1; i >= locked; i--) if (slots[i]) { used[slots[i].from] = false; slots[i] = null; } draw(); }
    function typeLetter(ch) {
      const i = cur().pool.findIndex((c, k) => c === ch && !used[k]);
      if (i >= 0) place(i);
    }
    function backspace() { for (let i = slots.length - 1; i >= locked; i--) if (slots[i]) { remove(i); return; } }
    function check() {
      if (busy) return;
      if (slots.indexOf(null) >= 0) { msg('Fill every box first.', 'bad'); return; }
      const guess = slots.map(s => s.ch).join('');
      if (guess === cur().answer) return open();
      wrong++; totalWrong++; score = Math.max(40, score - 8);
      kit.sfx.tone({ f: 200, f2: 110, t: 0.3, type: 'sawtooth', v: 0.06 });
      const slotsEl = $('#mgw-slots'); slotsEl.classList.remove('shake'); void slotsEl.offsetWidth; slotsEl.classList.add('shake');
      $('#mgw-light').className = 'mgw-light red';
      kit.after(700, () => { $('#mgw-light').className = 'mgw-light'; });
      if (wrong >= 3) { $('#mgw-hint').hidden = false; $('#mgw-hint').textContent = locked === 0 ? 'HINT: FIRST LETTER' : 'HINT: ONE MORE LETTER'; }
      msg(wrong >= 3 ? 'ACCESS DENIED — try a HINT.' : shown < cur().clues.length ? 'ACCESS DENIED — read the clues again, or get the next clue.' : 'ACCESS DENIED — try again.', 'bad');
      draw();
    }
    function hint() {
      const p = cur();
      if (busy || locked >= p.answer.length - 1) return;
      clear();
      const ch = p.answer[locked];
      const i = p.pool.findIndex((c, k) => c === ch && !used[k]);
      slots[locked] = { ch, from: i }; used[i] = true; locked++; hints++;
      score = Math.max(40, score - 10);
      $('#mgw-hint').hidden = true; wrong = 0;
      msg(`Hint: letter ${locked} is ${ch}.`, '');
      draw();
    }
    function open() {
      busy = true;
      const p = cur();
      $('#mgw-inside').innerHTML = `<span>${(D.FACT_VISUALS[p.value] || {}).emoji || '📁'}</span><b>${p.sentence}</b>`;
      root.classList.add('open');
      $('#mgw-light').className = 'mgw-light green';
      kit.sfx.success();
      msg(`ACCESS GRANTED — ${p.sentence}`, 'good');
      kit.after(2300, () => {
        v++;
        if (v < puzzle.vaults.length) { setup(); return; }
        ctx.done({ success: true, score, revealed: puzzle.revealed, stats: { wrong: totalWrong, hints, extraClues } });
      });
    }

    kit.on($('#mgw-clue'), 'click', () => {
      if (busy || shown >= cur().clues.length) return;
      shown++; extraClues++; score = Math.max(40, score - 10);
      kit.sfx.blip(); draw();
    });
    kit.on($('#mgw-slots'), 'click', e => { const b = e.target.closest('.slot'); if (b) remove(+b.dataset.i); });
    kit.on($('#mgw-pool'), 'click', e => { const b = e.target.closest('.tile'); if (b && !b.disabled) place(+b.dataset.i); });
    kit.on($('#mgw-hint'), 'click', hint);
    kit.on($('#mgw-clear'), 'click', () => { if (!busy) clear(); });
    kit.on($('#mgw-check'), 'click', check);
    kit.on(window, 'keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') { e.preventDefault(); check(); }
      else if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
      else if (/^[a-z]$/i.test(e.key)) { e.preventDefault(); typeLetter(e.key.toUpperCase()); }
    });

    setup();
    return { destroy() { root.remove(); } };
  }

  Minigames.register({
    id: 'password', kind: 'intel', title: 'PASSWORD CRACKING',
    brief: c => `${c.mark.name}'s file is in locked vaults. Read the English clues and crack each password.`,
    mount,
  });
})();
