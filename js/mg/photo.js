/* ============================================================
   INTEL — Photographic Identification
   Three rounds, one per fact in the grammar pack. HQ reads a fact
   sentence; the agent picks the one surveillance frame of four
   that shows it. Each verb has its own visual grammar so the
   English, not just the noun, decides the answer:
     can → doing the action · likes → ❤️ · has → holding / beside
     wants → 💭 thought bubble · doesn't like → yuck face + 💢
   From tier 2, one decoy shows the right item with the opposite
   verb (likes↔doesn't like, has↔wants).
   ============================================================ */
(() => {
  'use strict';
  const D = typeof module !== 'undefined' && module.exports ? require('../data.js') : DATA;
  const rngFor = typeof module !== 'undefined' && module.exports ? require('../missions.js').rng : Missions.rng;

  const CONTRAST = { likes: 'dislikes', dislikes: 'likes', has: 'wants', wants: 'has' };
  const VERB = { likes: 'likes', dislikes: "doesn't like", has: 'has', wants: 'wants', can: 'can', personality: 'is' };

  function shuffle(list, random) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const valuesFor = key => Array.from(new Set(D.CHARACTERS.map(c => c.facts[key].value)));
  const emojiOf = value => (D.FACT_VISUALS[value] || {}).emoji || '❓';
  const pad = n => String(n).padStart(2, '0');

  /* Pure puzzle generation (unit-tested under Node). */
  function generate({ mark, pack, tier = 1, seed = 1 }) {
    const random = rngFor(seed);
    const facts = pack.steps.filter(s => s.factLabel !== 'NAME').map(s => {
      const label = s.factLabel === "DOESN'T LIKE" ? 'dislikes' : s.factLabel.toLowerCase();
      return { key: label, value: s.fact(mark), sentence: s.answer(mark) };
    });
    const rounds = facts.map((fact, r) => {
      const others = shuffle(valuesFor(fact.key).filter(v => v !== fact.value && emojiOf(v) !== emojiOf(fact.value)), random);
      const decoys = others.slice(0, 3).map(value => ({ key: fact.key, value }));
      if (tier >= 2 && CONTRAST[fact.key]) decoys[2] = { key: CONTRAST[fact.key], value: fact.value };
      const options = shuffle([{ key: fact.key, value: fact.value }, ...decoys], random).map((o, i) => ({
        ...o, emoji: emojiOf(o.value), correct: o.key === fact.key && o.value === fact.value,
        cam: 'CAM ' + pad(1 + Math.floor(random() * 24)),
        time: `${pad(8 + Math.floor(random() * 10))}:${pad(Math.floor(random() * 60))}:${pad(Math.floor(random() * 60))}`,
        slot: i,
      }));
      return { clue: fact.sentence, factKey: fact.key, value: fact.value, options, answer: options.findIndex(o => o.correct), round: r };
    });
    return { rounds, revealed: facts.map(f => f.key) };
  }

  function validate(puzzle, mark) {
    const errors = [];
    puzzle.rounds.forEach((round, r) => {
      if (round.options.length !== 4) errors.push(`round ${r}: needs four frames`);
      const right = round.options.filter(o => o.correct);
      if (right.length !== 1) errors.push(`round ${r}: exactly one frame must match`);
      if (right[0] && (right[0].key !== round.factKey || right[0].value !== mark.facts[round.factKey].value)) errors.push(`round ${r}: the matching frame shows the wrong fact`);
      if (round.options[round.answer] !== right[0]) errors.push(`round ${r}: answer index is wrong`);
      const ids = round.options.map(o => o.key + '|' + o.value);
      if (new Set(ids).size !== 4) errors.push(`round ${r}: duplicate frames`);
      round.options.filter(o => !o.correct && o.key === round.factKey).forEach(o => {
        if (o.value === round.value || o.emoji === emojiOf(round.value)) errors.push(`round ${r}: a decoy looks like the answer`);
      });
    });
    return errors;
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { generate, validate, VERB }; return; }

  /* ---------------- browser: drawing ---------------- */
  const FW = 450, FH = 240, GAP = 20, W = FW * 2 + GAP * 3, H = FH * 2 + GAP * 3;
  const SCENES = {
    pool:   ['#5fb4d8', '#2f7fae', '#bfe6f2'], field: ['#8fcf7a', '#4f9a4a', '#d9f0c2'],
    room:   ['#e6d3b3', '#b9926a', '#f6ead6'], street: ['#a9b7c6', '#6b7c8e', '#e2e8ee'],
    park:   ['#a5d68f', '#5c9c55', '#e8f5d8'], stage: ['#5b4b8a', '#2f2650', '#c9b8f2'],
    shop:   ['#f1c27d', '#c08a3e', '#fbe6c4'], school: ['#d7e3f1', '#8aa2bf', '#f4f8fc'],
    kitchen: ['#f3d9c6', '#c99a7a', '#fdf1e6'], night: ['#3d4c6e', '#1d2640', '#8ea0c8'],
  };
  const sceneFor = o => ({
    swim: 'pool', soccer: 'field', 'run fast': 'field', flowers: 'park', 'ride a bike': 'park', rain: 'street',
    sing: 'stage', dance: 'stage', 'play the piano': 'school', books: 'school', homework: 'school', drawing: 'school',
    carrots: 'kitchen', tomatoes: 'kitchen', brave: 'night', robots: 'shop', music: 'room',
  })[o.value] || ({ wants: 'shop', has: 'park', dislikes: 'kitchen', personality: 'park', likes: 'room', can: 'park' })[o.key];

  const PERSONALITY = {
    kind:     { pose: 'hold', friend: true,  items: [['🎁', 92, -36, 34]], note: 'helping' },
    funny:    { pose: 'wave', friend: true,  items: [['😂', 150, -110, 38], ['🤪', -6, -150, 28]] },
    brave:    { pose: 'idle', friend: false, items: [['👻', -110, -110, 46], ['💪', 70, -70, 34]] },
    smart:    { pose: 'idle', friend: false, items: [['💡', 0, -175, 40], ['📝', 76, -40, 34], ['💯', 112, -96, 28]] },
    friendly: { pose: 'wave', friend: true,  items: [['👋', 150, -128, 30]] },
    happy:    { pose: 'dance', friend: false, items: [['☀️', 120, -150, 42], ['✨', -90, -130, 28], ['✨', 80, -30, 22]] },
  };
  const ACTION_POSE = { swim: 'swim', sing: 'sing', 'run fast': 'run', dance: 'dance', 'play the piano': 'idle', 'ride a bike': 'ride' };

  function emoji(g, ch, x, y, size) {
    g.font = `${size}px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, x, y);
  }

  function drawFrame(kit, g, option, mark, friendLook) {
    const [sky, ground, light] = SCENES[sceneFor(option)];
    const grad = g.createLinearGradient(0, 0, 0, FH);
    grad.addColorStop(0, light); grad.addColorStop(0.62, sky); grad.addColorStop(0.62, ground); grad.addColorStop(1, ground);
    g.fillStyle = grad; g.fillRect(0, 0, FW, FH);
    // Faint scene furniture so frames read as different places.
    g.globalAlpha = 0.18; g.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) g.fillRect(30 + i * 110, 26 + (i % 2) * 14, 70, 44);
    g.globalAlpha = 1;
    const cx = FW / 2 - 30, base = FH - 18, scale = 2.05, person = { look: mark.look };
    const pose = option.key === 'can' ? ACTION_POSE[option.value] || 'idle'
      : option.key === 'dislikes' ? 'yuck' : option.key === 'has' ? 'hold'
      : option.key === 'personality' ? (PERSONALITY[option.value] || {}).pose || 'idle' : 'idle';
    if (option.key === 'can' && option.value === 'swim') {
      kit.drawChild(g, person, cx, base - 20, { view: 'front', scale, pose, showProp: false });
      g.fillStyle = 'rgba(40,130,190,.78)'; g.fillRect(0, base - 78, FW, 100);
      g.strokeStyle = '#e8f7ff'; g.lineWidth = 3;
      for (let x = 0; x < FW; x += 40) { g.beginPath(); g.arc(x + 20, base - 78, 20, Math.PI, 0); g.stroke(); }
    } else if (option.key === 'personality' && PERSONALITY[option.value] && PERSONALITY[option.value].friend) {
      kit.drawChild(g, person, cx - 40, base, { view: 'front', scale, pose, showProp: false });
      kit.drawChild(g, { look: friendLook }, cx + 120, base, { view: 'front', scale: 1.55, pose: option.value === 'funny' ? 'dance' : 'wave', showProp: false });
    } else {
      kit.drawChild(g, person, cx, base, { view: 'front', scale, pose, showProp: false });
    }
    const e = option.emoji;
    if (option.key === 'can') {
      if (option.value === 'run fast') { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 4; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(cx - 70 - i * 6, base - 120 + i * 24); g.lineTo(cx - 150 - i * 6, base - 120 + i * 24); g.stroke(); } }
      if (option.value === 'play the piano') { emoji(g, '🎹', cx + 104, base - 52, 78); emoji(g, '🎵', cx + 150, base - 140, 30); }
      if (option.value === 'sing' || option.value === 'dance') { emoji(g, '🎵', cx + 100, base - 150, 34); emoji(g, '🎶', cx - 100, base - 120, 30); }
    } else if (option.key === 'likes') {
      emoji(g, e, cx + 98, base - 70, 56); emoji(g, '❤️', cx + 98, base - 140, 40); emoji(g, '❤️', cx + 150, base - 112, 24);
    } else if (option.key === 'has') {
      const pet = /🐶|🐱|🐰|🐦|🐹|🐕/.test(e);
      emoji(g, e, pet ? cx + 96 : cx + 70, pet ? base - 30 : base - 80, pet ? 62 : 58);
    } else if (option.key === 'wants') {
      g.fillStyle = '#fff'; g.strokeStyle = '#18283d'; g.lineWidth = 2;
      [[cx + 48, base - 152, 7], [cx + 66, base - 172, 11]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); });
      g.beginPath(); g.ellipse(cx + 138, base - 178, 68, 44, 0, 0, 7); g.fill(); g.stroke();
      emoji(g, e, cx + 138, base - 178, 50);
    } else if (option.key === 'dislikes') {
      emoji(g, e, cx + 100, base - 60, 56); emoji(g, '💢', cx + 46, base - 168, 34); emoji(g, '👎', cx - 90, base - 70, 36);
    } else if (option.key === 'personality' && PERSONALITY[option.value]) {
      PERSONALITY[option.value].items.forEach(([ch, dx, dy, size]) => emoji(g, ch, cx + dx, base + dy, size));
    }
    // Surveillance overlay: scanlines, vignette, CAM id and timestamp.
    g.fillStyle = 'rgba(0,20,30,.08)'; for (let y = 0; y < FH; y += 4) g.fillRect(0, y, FW, 1);
    const v = g.createRadialGradient(FW / 2, FH / 2, FH * 0.35, FW / 2, FH / 2, FW * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,10,25,.45)'); g.fillStyle = v; g.fillRect(0, 0, FW, FH);
    g.font = 'bold 15px "Courier New",monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = 'rgba(5,12,24,.65)'; g.fillRect(8, 8, 170, 22);
    g.fillStyle = '#ff5d5d'; g.beginPath(); g.arc(20, 19, 5, 0, 7); g.fill();
    g.fillStyle = '#e9f6ff'; g.fillText(`${option.cam}  REC`, 30, 11);
    g.textAlign = 'right'; g.fillStyle = 'rgba(5,12,24,.65)'; g.fillRect(FW - 106, FH - 30, 98, 22);
    g.fillStyle = '#e9f6ff'; g.fillText(option.time, FW - 14, FH - 27);
  }

  function mount(host, ctx) {
    const { kit, mark } = ctx;
    const puzzle = generate({ mark, pack: ctx.pack, tier: ctx.tier, seed: ctx.seed });
    const friendLook = D.CHARACTERS.filter(c => c.id !== mark.id)[ctx.seed % (D.CHARACTERS.length - 1)].look;
    const root = document.createElement('div');
    root.className = 'mg-photo';
    root.innerHTML = `
      <div class="mgp-brief">
        <div class="mgp-round" id="mgp-round"></div>
        <div class="mgp-clue"><span class="mgp-clue-label">HQ CLUE</span><b id="mgp-clue"></b></div>
        <div class="mgp-score">SCORE <b id="mgp-score">100</b></div>
      </div>
      <div class="mgp-stage" id="mgp-stage"></div>
      <div class="mgp-status" id="mgp-status" aria-live="polite">Click the photo that matches the clue · keys 1–4</div>`;
    host.appendChild(root);
    const { canvas, g } = kit.canvas(root.querySelector('#mgp-stage'), W, H);

    const frames = []; // offscreen caches, redrawn once per round
    let round = 0, score = 100, wrong = 0, state = 'pick', anim = 0, picked = -1;
    let marks = []; // per-frame 'no' marks this round
    const rect = i => ({ x: GAP + (i % 2) * (FW + GAP), y: GAP + Math.floor(i / 2) * (FH + GAP) });

    function buildRound() {
      const r = puzzle.rounds[round];
      frames.length = 0; marks = [false, false, false, false]; picked = -1; state = 'pick'; anim = 0;
      r.options.forEach(o => {
        const off = document.createElement('canvas'); off.width = FW; off.height = FH;
        drawFrame(kit, off.getContext('2d'), o, mark, friendLook); frames.push(off);
      });
      root.querySelector('#mgp-round').textContent = `ROUND ${round + 1} / ${puzzle.rounds.length}`;
      const clue = root.querySelector('#mgp-clue');
      clue.textContent = r.clue; clue.classList.remove('pop'); void clue.offsetWidth; clue.classList.add('pop');
      setStatus('Click the photo that matches the clue · keys 1–4');
      kit.sfx.blip();
    }
    function setStatus(text, cls) {
      const s = root.querySelector('#mgp-status'); s.textContent = text; s.className = 'mgp-status ' + (cls || '');
    }
    function choose(i) {
      if (state !== 'pick' || kit.paused || marks[i]) return;
      const r = puzzle.rounds[round];
      if (i === r.answer) {
        picked = i; state = 'confirm'; anim = 0;
        kit.sfx.good(); setStatus('MATCH CONFIRMED — ' + r.clue, 'good');
        kit.after(1900, () => {
          round++;
          if (round < puzzle.rounds.length) buildRound();
          else finish();
        });
      } else {
        marks[i] = true; wrong++; score = Math.max(40, score - 10);
        root.querySelector('#mgp-score').textContent = score;
        kit.sfx.bad(); setStatus('NO MATCH — read the clue again. Look at the verb!', 'bad');
      }
    }
    function finish() {
      state = 'done';
      kit.sfx.success();
      setStatus('FILE UNLOCKED — all photos identified.', 'good');
      kit.after(900, () => ctx.done({ success: true, score, revealed: puzzle.revealed, stats: { wrong, rounds: puzzle.rounds.length } }));
    }

    kit.on(canvas, 'pointerdown', e => {
      const b = canvas.getBoundingClientRect();
      const x = (e.clientX - b.left) / b.width * W, y = (e.clientY - b.top) / b.height * H;
      for (let i = 0; i < 4; i++) { const p = rect(i); if (x >= p.x && x <= p.x + FW && y >= p.y && y <= p.y + FH) choose(i); }
    });
    kit.on(window, 'keydown', e => { const n = Number(e.key); if (n >= 1 && n <= 4) choose(n - 1); });

    let hover = -1;
    kit.on(canvas, 'pointermove', e => {
      const b = canvas.getBoundingClientRect();
      const x = (e.clientX - b.left) / b.width * W, y = (e.clientY - b.top) / b.height * H;
      hover = -1;
      for (let i = 0; i < 4; i++) { const p = rect(i); if (x >= p.x && x <= p.x + FW && y >= p.y && y <= p.y + FH) hover = i; }
      canvas.style.cursor = hover >= 0 && state === 'pick' && !marks[hover] ? 'pointer' : 'default';
    });

    let t = 0;
    kit.loop(dt => { t += dt; if (state === 'confirm') anim = Math.min(1, anim + dt * 2.2); }, () => {
      g.fillStyle = '#081322'; g.fillRect(0, 0, W, H);
      for (let i = 0; i < frames.length; i++) {
        if (state === 'confirm' && i === picked) continue;
        const p = rect(i);
        g.globalAlpha = state === 'confirm' ? 1 - anim * 0.75 : marks[i] ? 0.45 : 1;
        g.drawImage(frames[i], p.x, p.y);
        g.globalAlpha = 1;
        g.lineWidth = hover === i && state === 'pick' && !marks[i] ? 4 : 2;
        g.strokeStyle = hover === i && state === 'pick' && !marks[i] ? '#ffbd3f' : 'rgba(55,183,216,.55)';
        g.strokeRect(p.x, p.y, FW, FH);
        g.fillStyle = '#ffbd3f'; g.font = 'bold 18px "Courier New",monospace'; g.textAlign = 'right'; g.textBaseline = 'top';
        g.fillText(String(i + 1), p.x + FW - 12, p.y + 10);
        if (marks[i]) stamp(p.x + FW / 2, p.y + FH / 2, 'NO MATCH', '#d94a52', -0.12);
      }
      if (state === 'confirm' && frames[picked]) {
        const p = rect(picked), e = 1 - Math.pow(1 - anim, 3);
        const tw = FW + (W - 2 * GAP - FW) * e * 0.85, th = FH + (H - 2 * GAP - FH) * e * 0.85;
        const x = p.x + ((W - tw) / 2 - p.x) * e, y = p.y + ((H - th) / 2 - p.y) * e;
        g.drawImage(frames[picked], x, y, tw, th);
        g.lineWidth = 5; g.strokeStyle = '#3fd28a'; g.strokeRect(x, y, tw, th);
        // corner brackets of a target lock
        g.strokeStyle = '#ffbd3f'; g.lineWidth = 4;
        [[x, y, 1, 1], [x + tw, y, -1, 1], [x, y + th, 1, -1], [x + tw, y + th, -1, -1]].forEach(([cx, cy, sx, sy]) => {
          g.beginPath(); g.moveTo(cx + sx * 36, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * 36); g.stroke();
        });
        if (anim > 0.55) stamp(W / 2, H / 2 + th * 0.28, 'MATCH CONFIRMED', '#2fae6d', -0.08, 1 + (1 - Math.min(1, (anim - 0.55) * 4)) * 0.6);
      }
      if (state === 'pick') { // sweeping analysis line
        const y = (t * 120) % H; g.fillStyle = 'rgba(55,183,216,.10)'; g.fillRect(0, y, W, 3);
      }
    });
    function stamp(x, y, text, color, rot, s = 1) {
      g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s);
      g.font = 'bold 34px "Courier New",monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const w = g.measureText(text).width + 30;
      g.fillStyle = 'rgba(255,255,255,.82)'; g.fillRect(-w / 2, -26, w, 52);
      g.lineWidth = 4; g.strokeStyle = color; g.strokeRect(-w / 2, -26, w, 52);
      g.fillStyle = color; g.fillText(text, 0, 2); g.restore();
    }

    buildRound();
    return { destroy() { root.remove(); } };
  }

  Minigames.register({
    id: 'photo', kind: 'intel', title: 'PHOTOGRAPHIC IDENTIFICATION',
    brief: c => `Surveillance photos of ${c.mark.name} came in. Find the photo that matches each HQ clue.`,
    mount,
  });
})();
