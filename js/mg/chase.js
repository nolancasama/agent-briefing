/* ============================================================
   INTERCEPT — Side-scrolling Foot Pursuit
   The agent chases the mark through the city. Forks in the route
   are decided by the mark's facts: HQ radios a sentence ("He likes
   soccer!") and the fact-consistent sign leads to a shortcut lane
   with boost pads; the other lane is crowded and slower — never a
   dead end. After the forks the mark tires a little and starts
   hiding behind street objects; SEARCH (E) finds them, running past
   lets them slip out in the background and come out ahead.
   Bumping an obstacle is a stumble, never a failure.
   ============================================================ */
(() => {
  'use strict';
  const D = typeof module !== 'undefined' && module.exports ? require('../data.js') : DATA;
  const rngFor = typeof module !== 'undefined' && module.exports ? require('../missions.js').rng : Missions.rng;

  /* ---------- level constants (shared by generator, validator and game) ---------- */
  const GROUND = 452, UPPER = 300, STAIR = 170, FORK_LEN = 1700, LENGTH = 32000;
  const JUMP_V = 650, GRAVITY = 1900, MAX_SPEED = 275;
  const JUMP_REACH = (2 * JUMP_V / GRAVITY) * MAX_SPEED; // ≈188 px
  const OBSTACLES = {
    box:     { w: 44, h: 44 },
    bench:   { w: 84, h: 36 },
    barrier: { w: 22, h: 50 },
    cones:   { w: 54, h: 32 },
    banner:  { w: 70, h: 0, top: GROUND - 112, bottom: GROUND - 40 }, // slide under
    gap:     { w: 110, h: 0 },
    door:    { w: 18, h: 110 },
  };
  const POOLS = {
    city:    ['box', 'bench', 'barrier', 'cones', 'banner', 'gap', 'box', 'cones'],
    park:    ['bench', 'box', 'barrier', 'banner', 'gap', 'bench', 'cones'],
    station: ['box', 'barrier', 'banner', 'door', 'cones', 'door', 'bench'],
  };
  const HIDES = ['vending', 'tree', 'billboard', 'shop', 'boxes'];
  const PLACES = {
    'a dog': ['🐕', 'DOG PARK'], 'a cat': ['🐈', 'CAT CAFE'], 'a skateboard': ['🛹', 'SKATE PARK'],
    'a rabbit': ['🐰', 'PET SHOP'], 'a bird': ['🐦', 'BIRD GARDEN'], 'a hamster': ['🐹', 'PET SHOP'],
    'a new ball': ['⚽', 'SPORTS SHOP'], 'a red bike': ['🚲', 'BIKE SHOP'], 'a puppy': ['🐶', 'PUPPY CAFE'],
    'a telescope': ['🔭', 'SPACE MUSEUM'], 'a big drum': ['🥁', 'DRUM SHOP'], 'a camera': ['📷', 'CAMERA SHOP'],
    carrots: ['🥕', 'VEGETABLE MARKET'], rain: ['🌧️', 'RAINY ROAD'], spiders: ['🕷️', 'BUG HOUSE'],
    tomatoes: ['🍅', 'TOMATO FARM'], homework: ['📝', 'STUDY CENTER'], snakes: ['🐍', 'REPTILE ZOO'],
  };
  const NEUTRAL = [['🥐', 'BAKERY'], ['☕', 'CAFE'], ['🧸', 'TOY SHOP'], ['🚌', 'BUS STOP'], ['🍦', 'ICE CREAM']];
  const FORK_KEYS = ['likes', 'can', 'has', 'wants', 'dislikes'];

  function place(value) {
    const v = D.FACT_VISUALS[value];
    if (v && v.place) return { emoji: v.place.emoji, word: v.place.word };
    const p = PLACES[value];
    return p ? { emoji: p[0], word: p[1] } : null;
  }
  function shuffle(list, random) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ---------- pure level generation (unit-tested under Node) ---------- */
  function generate({ mark, pack, tier = 1, seed = 1 }) {
    const random = rngFor(seed);
    const pick = list => list[Math.floor(random() * list.length)];
    const themes = tier >= 2 ? ['city', 'park', 'station'] : ['city'];
    const theme = themes[Math.floor(random() * themes.length)];
    const pool = POOLS[theme].filter(t => tier >= 2 || t !== 'gap' || random() < 0.5);
    const facts = pack.steps.filter(s => s.factLabel !== 'NAME').map(s => ({
      key: s.factLabel === "DOESN'T LIKE" ? 'dislikes' : s.factLabel.toLowerCase(), value: s.fact(mark), sentence: s.answer(mark),
    })).filter(f => FORK_KEYS.includes(f.key) && place(f.value));
    const forkFacts = shuffle(facts, random).slice(0, tier >= 3 ? 3 : 2);
    const obstacles = [], forks = [], hides = [], boosts = [], drinks = [];
    const spacing = { 1: [420, 640], 2: [380, 600], 3: [340, 540] }[tier];

    function stretch(a, b, lane = 'ground', types = pool) {
      let x = a + spacing[0] * 0.6;
      while (x < b - 80) {
        const type = pick(types);
        obstacles.push({ x: Math.round(x), lane, type, w: OBSTACLES[type].w });
        x += OBSTACLES[type].w + spacing[0] + random() * (spacing[1] - spacing[0]);
      }
    }
    let cursor = 900;
    forkFacts.forEach(f => {
      stretch(cursor, cursor + 1500);
      const x = cursor + 1700, end = x + FORK_LEN;
      const correctLane = random() < 0.5 ? 'upper' : 'ground';
      const wrongLane = correctLane === 'upper' ? 'ground' : 'upper';
      let right, wrong;
      if (f.key === 'dislikes') {
        wrong = place(f.value);
        right = (() => { const n = pick(NEUTRAL); return { emoji: n[0], word: n[1] }; })();
      } else {
        right = place(f.value);
        const others = Array.from(new Set(D.CHARACTERS.map(c => c.facts[f.key].value))).filter(v => v !== f.value && place(v) && place(v).word !== right.word);
        wrong = place(pick(others));
      }
      forks.push({ x, end, key: f.key, value: f.value, clue: f.sentence, correctLane, signs: { [correctLane]: right, [wrongLane]: wrong } });
      // Inside the fork: the shortcut lane has boosts and at most one obstacle;
      // the other lane is crowded (slower) with more obstacles.
      const inner = [x + STAIR + 160, end - STAIR - 160];
      const safe = ['box', 'bench', 'cones', 'barrier'];
      [[correctLane, 1], [wrongLane, tier >= 2 ? 3 : 2]].forEach(([lane, n]) => {
        for (let i = 0; i < n; i++) {
          const type = pick(safe);
          obstacles.push({ x: Math.round(inner[0] + (i + 0.5) * (inner[1] - inner[0]) / n), lane, type, w: OBSTACLES[type].w, fork: forks.length - 1 });
        }
      });
      [0.25, 0.75].forEach(t => boosts.push({ x: Math.round(inner[0] + t * (inner[1] - inner[0]) - 40), lane: correctLane, fork: forks.length - 1 }));
      cursor = end + 260;
    });
    const hideCount = Math.min(3, tier);
    for (let i = 0; i < hideCount; i++) {
      stretch(cursor, cursor + 1300);
      hides.push({ x: cursor + 1500, type: pick(HIDES) });
      cursor += 1500 + 380;
    }
    stretch(cursor, LENGTH);
    // Energy drinks on clear ground between obstacles.
    for (let x = 1600; x < LENGTH; x += 2600 + Math.floor(random() * 900)) {
      const clear = !obstacles.some(o => o.lane === 'ground' && Math.abs(o.x - x) < 160) &&
        !forks.some(f => x > f.x - 220 && x < f.end + 220) && !hides.some(h => Math.abs(h.x - x) < 200);
      if (clear) drinks.push({ x });
    }
    return { theme, length: LENGTH, obstacles, forks, hides, boosts, drinks, hideCount };
  }

  function laneCost(level, f, lane) {
    const len = f.end - f.x;
    const speed = lane === f.correctLane ? 1.15 : 0.72;
    const hits = level.obstacles.filter(o => o.lane === lane && o.x > f.x && o.x < f.end).length;
    return len / (MAX_SPEED * speed) + hits * 0.4;
  }

  function validate(level, mark, pack) {
    const errors = [];
    ['ground', 'upper'].forEach(lane => {
      const list = level.obstacles.filter(o => o.lane === lane).sort((a, b) => a.x - b.x);
      for (let i = 1; i < list.length; i++) {
        if (list[i].x - (list[i - 1].x + list[i - 1].w) < 220) errors.push(`${lane} obstacles too close at ${list[i].x}`);
      }
    });
    level.obstacles.forEach(o => {
      if (o.type === 'gap' && o.w > JUMP_REACH - 50) errors.push(`gap at ${o.x} wider than a jump`);
      if (o.lane === 'upper' && !level.forks.some(f => o.x > f.x + STAIR && o.x + o.w < f.end - STAIR)) errors.push(`upper obstacle outside a walkway at ${o.x}`);
      if (o.lane === 'upper' && ['gap', 'banner', 'door'].includes(o.type)) errors.push('walkway obstacles must be simple');
      level.forks.forEach(f => {
        if (o.lane === 'ground' && (Math.abs(o.x - f.x) < 240 || Math.abs(o.x - f.end) < 200)) errors.push(`obstacle blocks fork stairs at ${o.x}`);
      });
      level.hides.forEach(h => { if (o.lane === 'ground' && Math.abs(o.x - h.x) < 180) errors.push(`obstacle next to hiding spot at ${o.x}`); });
    });
    if (level.hides.length < 1 || level.hides.length > 3) errors.push('hiding spots must be 1–3');
    level.hides.forEach(h => { if (level.forks.some(f => h.x > f.x - 250 && h.x < f.end + 250)) errors.push('hiding spot inside a fork'); });
    const lastFork = level.forks.length ? level.forks[level.forks.length - 1].end : 0;
    if (level.hides.some(h => h.x < lastFork)) errors.push('hiding spots must come after the forks');
    if (mark && pack) {
      const facts = Object.fromEntries(pack.steps.filter(s => s.factLabel !== 'NAME').map(s => [s.factLabel === "DOESN'T LIKE" ? 'dislikes' : s.factLabel.toLowerCase(), s.fact(mark)]));
      level.forks.forEach((f, i) => {
        if (facts[f.key] !== f.value) errors.push(`fork ${i} clue is not the mark's fact`);
        const wrongLane = f.correctLane === 'upper' ? 'ground' : 'upper';
        const target = place(f.value);
        if (f.key === 'dislikes') {
          if (f.signs[wrongLane].word !== target.word) errors.push(`fork ${i}: the disliked place must be the wrong way`);
          if (f.signs[f.correctLane].word === target.word) errors.push(`fork ${i}: the right way shows the disliked place`);
        } else {
          if (f.signs[f.correctLane].word !== target.word) errors.push(`fork ${i}: right-way sign does not match the clue`);
          if (f.signs[wrongLane].word === target.word) errors.push(`fork ${i}: both signs match the clue`);
        }
        if (!(laneCost(level, f, f.correctLane) < laneCost(level, f, wrongLane))) errors.push(`fork ${i}: the clue lane is not the shortcut`);
        if (!level.boosts.some(b => b.fork === i && b.lane === f.correctLane)) errors.push(`fork ${i}: shortcut has no boost`);
      });
      if (level.forks.length < 2) errors.push('need at least two forks');
    }
    return errors;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generate, validate, laneCost, place, JUMP_REACH, GROUND, UPPER, STAIR, OBSTACLES };
    return;
  }

  /* ============================================================
     Browser game
     ============================================================ */
  const W = 960, H = 540;
  const THEME = {
    city:    { sky: ['#9fd3f2', '#e4f3fb'], far: '#8fa8c4', mid: ['#c96a52', '#e0a458', '#6a8fb3', '#8b6fae', '#5aa38f'], ground: '#c9c2b6', curb: '#8c867b', road: '#4b5160' },
    park:    { sky: ['#a9dcf5', '#f0f9e8'], far: '#93c48b', mid: ['#4f9a4a', '#5fae57', '#3f8a44'], ground: '#cbb88f', curb: '#7fae5f', road: '#6fa35a' },
    station: { sky: ['#5c6f8f', '#aab7cc'], far: '#4f5d78', mid: ['#7d8aa3', '#94a1b8', '#6e7b94'], ground: '#d6d2c8', curb: '#f0c419', road: '#3d4454' },
  };

  function mount(host, ctx) {
    const { kit, mark, profile } = ctx;
    const level = generate({ mark, pack: ctx.pack, tier: ctx.tier, seed: ctx.seed });
    const theme = THEME[level.theme];
    const random = rngFor(ctx.seed ^ 0x5bd1e995);
    const relaxed = ctx.relaxed;
    const timeLimit = relaxed ? Infinity : { 1: 95, 2: 85, 3: 75 }[ctx.tier];
    const markBase = MAX_SPEED * ({ 1: 0.80, 2: 0.83, 3: 0.86 }[ctx.tier]) * (relaxed ? 0.85 : 1);
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const Pro = profile.Pro;

    const root = document.createElement('div');
    root.className = 'mg-chase';
    root.innerHTML = `<div class="mgc-stage" id="mgc-stage"></div>
      <div class="mgc-radio" id="mgc-radio" hidden><span class="mgc-radio-tag">HQ RADIO</span><b id="mgc-radio-text"></b></div>
      <div class="mgc-help" id="mgc-help">→ RUN &nbsp; ↑ / SPACE JUMP &nbsp; ↓ SLIDE &nbsp; E SEARCH</div>`;
    host.appendChild(root);
    const { canvas, g } = kit.canvas(root.querySelector('#mgc-stage'), W, H);
    if (coarse) kit.touchPad(root, [{ key: 'left', label: '◀' }, { key: 'right', label: '▶' }, { key: 'up', label: 'JUMP' }, { key: 'down', label: 'SLIDE' }, { key: 'e', label: 'SEARCH' }]);

    const body = () => ({ x: 0, y: GROUND, vy: 0, speed: 0, lane: 'ground', onGround: true, slide: false, stumble: 0, frame: 0, fall: 0 });
    const P = Object.assign(body(), { x: 160, coyote: 0, buffer: 0, boost: 0, slow: false });
    const M = Object.assign(body(), { x: 500, hidden: -1, hideTime: 0, slip: 0, tired: false, burst: 0, found: 0 });
    const walkers = Array.from({ length: 6 }, (_, i) => ({ x: 300 + i * 520 + random() * 200, dir: random() < 0.5 ? -1 : 1, look: D.CHARACTERS[i % 6].look, speed: 40 + random() * 30, frame: 0 }));
    const markPerson = { look: mark.look };
    let t = 0, state = 'countdown', countdown = 2.2, camX = 0, stumbles = 0, wrongForks = 0, rightForks = 0, foundHides = 0, markHides = 0;
    let farFor = 0, cue = '', cueColor = '#fff', cueTime = 0, lastD = 0, cueCheck = 0, slow = 1, endTimer = 0, endText = '';
    const forkSeen = new Set(), forkJudged = new Set();
    let musicStep = 0;

    function groundAt(x, lane) {
      if (lane !== 'upper') return GROUND;
      const f = level.forks.find(k => x >= k.x && x <= k.end);
      if (!f) return GROUND;
      if (x < f.x + STAIR) return GROUND - (x - f.x) / STAIR * (GROUND - UPPER);
      if (x > f.end - STAIR) return UPPER + (x - (f.end - STAIR)) / STAIR * (GROUND - UPPER);
      return UPPER;
    }
    function forkAt(x) { return level.forks.find(k => x >= k.x && x <= k.end); }
    const onWalkwayRange = x => level.forks.some(k => x >= k.x - 80 && x <= k.end);
    function radio(text, ms) {
      const r = root.querySelector('#mgc-radio');
      root.querySelector('#mgc-radio-text').textContent = text;
      r.hidden = false; r.classList.remove('in'); void r.offsetWidth; r.classList.add('in');
      kit.sfx.blip();
      if (ms) kit.after(ms, () => { r.hidden = true; });
    }
    function setCue(text, color, secs) { cue = text; cueColor = color; cueTime = secs || 1.2; }

    function hitBox(b) {
      const h = b.slide ? 30 : 62;
      return { l: b.x - 13, r: b.x + 13, t: b.y - h, b: b.y };
    }
    function obstacleBox(o) {
      const spec = OBSTACLES[o.type], gy = groundAt(o.x + o.w / 2, o.lane);
      if (o.type === 'banner') return { l: o.x, r: o.x + o.w, t: spec.top, b: spec.bottom };
      return { l: o.x, r: o.x + o.w, t: gy - spec.h, b: gy };
    }
    const doorOpen = o => o.forceOpen > 0 || ((t + o.x / 300) % 2.6) < 1.5;

    /* ---------- physics shared by both runners ---------- */
    function step(b, dt, wantJump) {
      if (b.fall > 0) { // climbing out of a gap
        b.fall -= dt; b.y = Math.min(GROUND + 70, b.y + 300 * dt);
        if (b.fall <= 0) { b.x = b.fallTo; b.y = GROUND; b.vy = 0; b.speed = 60; b.onGround = true; }
        return;
      }
      const gy = groundAt(b.x, b.lane);
      if (wantJump && (b.onGround || b.coyote > 0)) { b.vy = -JUMP_V; b.onGround = false; b.coyote = 0; if (b === P) kit.sfx.tone({ f: 420, f2: 680, t: 0.12, type: 'triangle', v: 0.05 }); }
      b.x += b.speed * dt;
      if (!b.onGround) {
        b.vy += GRAVITY * dt; b.y += b.vy * dt;
        const ny = groundAt(b.x, b.lane);
        if (b.y >= ny && b.vy >= 0) { b.y = ny; b.vy = 0; b.onGround = true; }
      } else {
        const gap = b.lane === 'ground' && level.obstacles.find(o => o.type === 'gap' && b.x > o.x + 8 && b.x < o.x + o.w - 8);
        if (gap) { b.onGround = false; b.fall = 0.75; b.fallTo = gap.x + gap.w + 14; b.vy = 0; if (b === P) { stumbles++; setCue('OOPS! CLIMB OUT', '#ffbd3f', 1); kit.sfx.bad(); } return; }
        if (Math.abs(b.y - gy) < 30) b.y = gy; else { b.onGround = false; }
      }
      if (b.coyote !== undefined) b.coyote = b.onGround ? 0.1 : Math.max(0, b.coyote - dt);
      b.frame += dt * (b.speed / 22);
    }
    function collide(b) {
      if (b.fall > 0 || b.stumble > 0) return;
      const hb = hitBox(b);
      for (const o of level.obstacles) {
        if (o.hit || o.type === 'gap' || o.lane !== b.lane || o.x > b.x + 60 || o.x + o.w < b.x - 60) continue;
        if (o.type === 'door' && doorOpen(o)) continue;
        const ob = obstacleBox(o);
        if (hb.r > ob.l && hb.l < ob.r && hb.b > ob.t + 2 && hb.t < ob.b) {
          if (o.type === 'door') o.forceOpen = 1.5; else o.hit = true;
          b.stumble = 0.55; b.speed *= 0.25;
          if (b === P) { stumbles++; setCue('OOPS!', '#ffbd3f', 0.8); kit.sfx.tone({ f: 160, f2: 90, t: 0.2, type: 'square', v: 0.06 }); }
          return;
        }
      }
    }

    /* ---------- the player ---------- */
    let jumpHeld = false, searchHeld = false;
    function updatePlayer(dt) {
      const k = kit.keys;
      const jumpKey = k.up || k.space;
      if (jumpKey && !jumpHeld) P.buffer = 0.13;
      jumpHeld = jumpKey;
      P.buffer = Math.max(0, P.buffer - dt);
      // Lane choice at a fork: jumping (or ↑) at the stairs takes the walkway.
      const f = level.forks.find(k2 => P.x > k2.x - 70 && P.x < k2.x + 40);
      if (f && P.lane === 'ground' && P.buffer > 0 && P.onGround) { P.lane = 'upper'; P.buffer = 0; kit.sfx.tone({ f: 520, t: 0.08, type: 'triangle', v: 0.05 }); }
      if (P.lane === 'upper' && !onWalkwayRange(P.x)) P.lane = 'ground';
      const fk = forkAt(P.x);
      P.slow = !!fk && P.lane !== fk.correctLane && P.x > fk.x + STAIR && P.x < fk.end - STAIR;
      if (P.stumble > 0) P.stumble -= dt;
      const cap = (P.boost > 0 ? 1.35 : 1) * (P.slow ? 0.72 : 1) * MAX_SPEED;
      if (P.stumble <= 0 && P.fall <= 0) {
        if (k.right) P.speed = Math.min(cap, P.speed + 950 * dt);
        else if (k.left) P.speed = Math.max(-150, P.speed - 1300 * dt);
        else P.speed = P.speed > 0 ? Math.max(0, P.speed - 900 * dt) : Math.min(0, P.speed + 900 * dt);
        if (P.speed > cap) P.speed = Math.max(cap, P.speed - 600 * dt);
      }
      P.slide = k.down && P.onGround && P.speed > 40;
      P.boost = Math.max(0, P.boost - dt);
      const wantJump = P.buffer > 0 && !P.slide && !f;
      if (wantJump && (P.onGround || P.coyote > 0)) P.buffer = 0;
      step(P, dt, wantJump);
      P.x = Math.max(40, P.x);
      collide(P);
      level.boosts.forEach(b => { if (!b.used && b.lane === P.lane && Math.abs(P.x - (b.x + 40)) < 40 && P.onGround) { b.used = true; P.boost = 1.4; setCue('SHORTCUT BOOST!', '#3fd28a', 1); kit.sfx.tone({ f: 600, f2: 1200, t: 0.25, type: 'sine', v: 0.07 }); } });
      level.drinks.forEach(d => { if (!d.used && P.lane === 'ground' && Math.abs(P.x - d.x) < 24 && P.y > GROUND - 70) { d.used = true; P.boost = 1.6; setCue('SPEED BOOST!', '#3fd28a', 1); kit.sfx.tone({ f: 700, f2: 1400, t: 0.25, type: 'sine', v: 0.07 }); } });
      // HQ judges the fork once the agent commits to a lane.
      level.forks.forEach((fo, i) => {
        if (!forkJudged.has(i) && P.x > fo.x + STAIR + 40) {
          forkJudged.add(i);
          if (P.lane === fo.correctLane) { rightForks++; radio(fo.key === 'dislikes' ? `Smart! ${fo.clue} Shortcut!` : `Good thinking! Shortcut!`, 2200); }
          else { wrongForks++; radio(`Slow crowd here! Remember: ${fo.clue}`, 2600); }
        }
      });
      // SEARCH a hiding spot.
      if (k.e && !searchHeld) search();
      searchHeld = k.e;
    }
    function search() {
      const h = level.hides.find(hd => Math.abs(P.x - (hd.x + 30)) < 110);
      if (!h) { setCue('NOTHING HERE', '#9fb4c9', 0.7); return; }
      if (M.hidden === level.hides.indexOf(h)) {
        M.hidden = -1; M.found = 0.9; M.x = h.x + 70; M.y = GROUND; M.speed = 0; foundHides++;
        setCue('FOUND YOU!', '#3fd28a', 1.2); kit.sfx.good();
      } else setCue('NOBODY THERE', '#9fb4c9', 0.7);
    }

    /* ---------- the mark ---------- */
    function updateMark(dt) {
      const d = M.x - P.x;
      const lastFork = level.forks[level.forks.length - 1];
      const forksDone = !lastFork || M.x > lastFork.end;
      if (!M.tired && relaxed && t > 60) { M.tired = true; radio(`${Pro} is getting tired! Catch ${profile.pro === 'he' ? 'him' : 'her'}!`, 2500); }
      if (M.found > 0) { M.found -= dt; M.speed = 0; M.frame += dt * 3; return; }
      if (M.hidden >= 0) {
        M.speed = 0; M.hideTime += dt;
        const h = level.hides[M.hidden];
        if (P.x > h.x + 140) { M.hidden = -1; M.slip = 1; M.x = h.x + 30; } // agent ran past: slip out behind
        return;
      }
      if (M.slip > 0) { // moving along the background, faster, until well ahead
        M.x += (P.speed + 170) * dt; M.frame += dt * 14;
        if (M.x > P.x + 320) { M.slip = 0; M.y = GROUND; M.lane = 'ground'; setCue(`${Pro.toUpperCase()} SLIPPED AWAY!`, '#ff8a8a', 1.2); }
        return;
      }
      let target = markBase * (1 + 0.06 * Math.sin(t * 0.9) + 0.04 * Math.sin(t * 2.3));
      if (M.burst > 0) { M.burst -= dt; target *= 1.18; }
      else if (random() < dt * 0.08) M.burst = 0.9;
      // Keep a lead until every fork has been run, so the clues always matter.
      if (!forksDone && d < 170) target = Math.max(target, P.speed + 25);
      if (d > 650) target *= d > 900 ? 0.62 : 0.78; // rubber band: let a reading child catch up
      if (M.tired) target *= 0.6;
      if (forksDone && d < 120 && !M.tired) target = Math.min(target, MAX_SPEED * 0.9);
      if (M.stumble > 0) M.stumble -= dt;
      else M.speed += Math.sign(target - M.speed) * Math.min(Math.abs(target - M.speed), 700 * dt);
      // Look ahead: jump, slide, choose lane at forks, hide.
      const f = level.forks.find(k => M.x > k.x - 30 && M.x < k.x + 10);
      if (f && M.lane === 'ground' && f.correctLane === 'upper') M.lane = 'upper';
      if (M.lane === 'upper' && !onWalkwayRange(M.x)) M.lane = 'ground';
      let jump = false;
      M.slide = false;
      for (const o of level.obstacles) {
        if (o.lane !== M.lane || o.hit) continue;
        const ahead = o.x - M.x;
        if (o.type === 'banner' && ahead > -o.w - 10 && ahead < 40) M.slide = true;
        else if (o.type === 'gap' && ahead > 18 && ahead < 46) jump = true;
        else if (o.type === 'door' && ahead > 0 && ahead < 60 && !doorOpen(o)) o.forceOpen = 1.2; // doors open for the mark
        else if (!['banner', 'gap', 'door'].includes(o.type) && ahead > 20 && ahead < 62) jump = true;
      }
      const h = level.hides.find((hd, i) => !hd.used && M.x > hd.x && M.x < hd.x + 40 && i >= 0);
      if (h && M.lane === 'ground' && d > 150 && M.onGround) {
        h.used = true; M.hidden = level.hides.indexOf(h); M.hideTime = 0; markHides++;
        M.x = h.x + 30; radio(`Where did ${profile.pro} go? Look for a clue and SEARCH (E)!`, 2600);
        return;
      }
      if (h && !h.used && d <= 150) h.used = true; // too close to hide here
      step(M, dt, jump);
      collide(M);
    }

    /* ---------- loop ---------- */
    kit.every(150, () => {
      if (state !== 'run') return;
      const bass = [110, 110, 131, 110, 147, 110, 131, 98][musicStep % 8];
      kit.sfx.tone({ f: bass, t: 0.12, type: 'triangle', v: 0.06 });
      if (musicStep % 2 === 0) kit.sfx.noise({ bp: 6000, t: 0.03, v: 0.02, q: 1.5 });
      if (musicStep % 16 === 12) kit.sfx.tone({ f: bass * 4, t: 0.18, type: 'square', v: 0.025 });
      musicStep++;
    });

    kit.loop(dt0 => {
      const dt = dt0 * slow;
      t += dt;
      cueTime = Math.max(0, cueTime - dt);
      level.obstacles.forEach(o => { if (o.forceOpen > 0) o.forceOpen -= dt; });
      walkers.forEach(w => { w.x += w.dir * w.speed * dt; w.frame += dt * 5; if (w.x < camX - 200) w.x += W + 600; if (w.x > camX + W + 400) w.x -= W + 600; });
      if (state === 'countdown') {
        countdown -= dt0;
        if (countdown <= 0) { state = 'run'; radio(`${Pro} is running! Catch ${profile.pro === 'he' ? 'him' : 'her'}!`, 2200); kit.after(4500, () => { const h = root.querySelector('#mgc-help'); if (h) h.classList.add('fade'); }); }
      } else if (state === 'run') {
        updatePlayer(dt); updateMark(dt);
        // HQ radios the fork clue as the agent approaches it.
        level.forks.forEach((f, i) => {
          if (!forkSeen.has(i) && P.x > f.x - 900) { forkSeen.add(i); radio(`${f.clue} Which way will ${profile.pro} go?`, 5200); }
        });
        const d = M.x - P.x;
        cueCheck += dt;
        if (cueCheck > 1) {
          if (lastD - d > 35 && !cueTime) setCue('GAINING!', '#3fd28a', 0.9);
          else if (d - lastD > 45 && !cueTime) setCue('LOSING GROUND', '#ff8a8a', 0.9);
          lastD = d; cueCheck = 0;
        }
        const catchable = M.hidden < 0 && M.slip <= 0 && M.lane === P.lane && P.fall <= 0 && M.fall <= 0;
        if (catchable && d < 34 && d > -40) caught();
        const esc = { 1: [1250, 7], 2: [1150, 5.5], 3: [1050, 4.5] }[ctx.tier];
        farFor = d > esc[0] && !relaxed ? farFor + dt : 0;
        if (farFor > esc[1] || t > timeLimit) escaped();
      } else if (state === 'caught' || state === 'escaped') {
        endTimer -= dt0;
        slow = Math.min(1, slow + dt0 * 0.6);
        if (state === 'caught') { P.speed = Math.max(0, P.speed - 600 * dt0); P.x += P.speed * dt0 * 0.3; M.frame = 0; }
        else { M.x += 300 * dt0; M.frame += dt0 * 14; }
        if (endTimer <= 0) finish();
      }
      camX += ((P.x - 280) - camX) * Math.min(1, dt0 * 8);
      camX = Math.max(0, camX);
    }, render);

    function caught() {
      state = 'caught'; slow = 0.3; endTimer = 2.4;
      endText = 'You caught me!';
      kit.sfx.success();
    }
    function escaped() {
      state = 'escaped'; endTimer = 2.4;
      endText = `${Pro} got away!`;
      kit.sfx.tone({ f: 330, f2: 196, t: 0.6, type: 'triangle', v: 0.08 });
    }
    let finished = false;
    function finish() {
      if (finished) return; finished = true;
      const score = Math.max(40, Math.min(100, 100 - stumbles * 4 - wrongForks * 10 + foundHides * 5));
      const stats = { stumbles, wrongForks, rightForks, foundHides, time: Math.round(t), theme: level.theme };
      if (state === 'caught') ctx.done({ success: true, outcome: 'caught', score, wrongPicks: 0, markHides, stats });
      else ctx.done({ success: false, outcome: 'escaped', score: Math.min(score, 60), wrongPicks: 0, markHides, stats });
    }

    /* ---------- drawing ---------- */
    function emoji(ch, x, y, size) {
      g.font = `${size}px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, x, y);
    }
    const farBlocks = Array.from({ length: 24 }, (_, i) => ({ x: i * 110, w: 70 + random() * 60, h: 90 + random() * 120 }));
    const midBlocks = Array.from({ length: 14 }, (_, i) => ({ x: i * 200, w: 170 + random() * 20, h: 170 + random() * 90, c: theme.mid[i % theme.mid.length], awning: random() < 0.6 }));
    function background() {
      const sky = g.createLinearGradient(0, 0, 0, GROUND);
      sky.addColorStop(0, theme.sky[0]); sky.addColorStop(1, theme.sky[1]);
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      // far layer
      g.fillStyle = theme.far;
      const farOff = (camX * 0.2) % 2640;
      farBlocks.forEach(b => {
        for (let k = 0; k < 2; k++) {
          const x = b.x - farOff + k * 2640;
          if (x > W || x + b.w < 0) continue;
          if (level.theme === 'park') { g.beginPath(); g.ellipse(x + b.w / 2, GROUND - 120, b.w, b.h * 0.6, 0, Math.PI, 0); g.fill(); }
          else g.fillRect(x, GROUND - 130 - b.h, b.w, b.h + 130);
        }
      });
      // mid layer: shopfronts / trees / platforms
      const midOff = (camX * 0.5) % 2800;
      midBlocks.forEach(b => {
        for (let k = 0; k < 2; k++) {
          const x = b.x - midOff + k * 2800;
          if (x > W || x + b.w < 0) continue;
          if (level.theme === 'park') {
            g.fillStyle = '#7a5532'; g.fillRect(x + b.w / 2 - 8, GROUND - 120, 16, 120);
            g.fillStyle = b.c; g.beginPath(); g.arc(x + b.w / 2, GROUND - 150, 56, 0, 7); g.fill();
            g.beginPath(); g.arc(x + b.w / 2 - 34, GROUND - 128, 38, 0, 7); g.arc(x + b.w / 2 + 36, GROUND - 126, 36, 0, 7); g.fill();
          } else if (level.theme === 'station') {
            g.fillStyle = b.c; g.fillRect(x, GROUND - 250, b.w, 250);
            g.fillStyle = '#2b3446'; g.fillRect(x + 14, GROUND - 210, b.w - 28, 60);
            g.fillStyle = '#ffd34d'; g.fillRect(x + 14, GROUND - 150, b.w - 28, 6);
            g.fillStyle = '#e8eef7'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillText('PLATFORM ' + (1 + (Math.round(b.x / 200) % 4)), x + b.w / 2, GROUND - 176);
          } else {
            g.fillStyle = b.c; g.fillRect(x, GROUND - b.h, b.w, b.h);
            g.fillStyle = 'rgba(255,255,255,.55)';
            for (let wy = GROUND - b.h + 18; wy < GROUND - 90; wy += 34) for (let wx = x + 16; wx < x + b.w - 26; wx += 36) g.fillRect(wx, wy, 20, 20);
            g.fillStyle = '#2d3b4f'; g.fillRect(x + 20, GROUND - 74, b.w - 40, 74);
            g.fillStyle = 'rgba(180,220,255,.5)'; g.fillRect(x + 26, GROUND - 68, b.w - 52, 40);
            if (b.awning) { for (let s = 0; s < b.w - 20; s += 20) { g.fillStyle = s % 40 ? '#fff' : '#d94a52'; g.fillRect(x + 10 + s, GROUND - 92, 20, 16); } }
          }
        }
      });
      // background walkers (decorative crowd)
      walkers.forEach(w => {
        const sx = w.x - camX * 0.85;
        if (sx < -40 || sx > W + 40) return;
        g.globalAlpha = 0.65;
        kit.drawChild(g, { look: w.look }, sx, GROUND - 26, { view: 'side', scale: 0.8, pose: 'walk', frame: w.frame, facing: w.dir < 0 ? 'left' : 'right', showProp: false });
        g.globalAlpha = 1;
      });
      // ground
      g.fillStyle = theme.road; g.fillRect(0, GROUND + 52, W, H - GROUND - 52);
      g.fillStyle = theme.ground; g.fillRect(0, GROUND, W, 52);
      g.fillStyle = theme.curb; g.fillRect(0, GROUND + 46, W, 8);
      g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2;
      for (let x = -((camX) % 64); x < W; x += 64) { g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x - 14, GROUND + 46); g.stroke(); }
      if (level.theme !== 'park') { g.fillStyle = 'rgba(255,255,255,.7)'; for (let x = -((camX * 1.0) % 120); x < W; x += 120) g.fillRect(x, GROUND + 70, 60, 6); }
    }
    function drawFork(f) {
      const x0 = f.x - camX, x1 = f.end - camX;
      if (x1 < -50 || x0 > W + 300) return;
      // walkway with supports and stairs
      g.fillStyle = '#566377';
      for (let x = x0 + STAIR + 60; x < x1 - STAIR; x += 220) g.fillRect(x, UPPER, 14, GROUND - UPPER);
      g.fillStyle = '#3f4a5c'; g.fillRect(x0 + STAIR, UPPER, x1 - x0 - 2 * STAIR, 16);
      g.strokeStyle = '#8a97ab'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x0 + STAIR, UPPER - 30); g.lineTo(x1 - STAIR, UPPER - 30); g.stroke();
      for (let x = x0 + STAIR; x < x1 - STAIR; x += 30) { g.beginPath(); g.moveTo(x, UPPER - 30); g.lineTo(x, UPPER); g.stroke(); }
      for (let s = 0; s < 10; s++) {
        const sx = x0 + s * STAIR / 10, sy = GROUND - (s + 1) * (GROUND - UPPER) / 10;
        g.fillStyle = s % 2 ? '#5d6a7e' : '#4c586b'; g.fillRect(sx, sy, STAIR / 10 + 1, GROUND - sy);
        const ex = x1 - (s + 1) * STAIR / 10;
        g.fillRect(ex, sy, STAIR / 10 + 1, GROUND - sy);
      }
      // the crowded lane
      const fk = f, crowdLane = fk.correctLane === 'upper' ? 'ground' : 'upper';
      const cy = crowdLane === 'upper' ? UPPER : GROUND;
      for (let x = x0 + STAIR + 80; x < x1 - STAIR - 40; x += 95) {
        g.globalAlpha = 0.5;
        kit.drawChild(g, { look: D.CHARACTERS[Math.abs(Math.round(x + camX)) % 6].look }, x, cy - 2, { view: 'side', scale: 0.7, pose: 'idle', facing: 'left', showProp: false });
        g.globalAlpha = 1;
      }
      // signpost before the stairs
      const px = x0 - 150;
      g.fillStyle = '#6b4f2a'; g.fillRect(px - 4, GROUND - 190, 8, 190);
      [['upper', GROUND - 186, '↗'], ['ground', GROUND - 128, '→']].forEach(([lane, y, arrow]) => {
        const s = f.signs[lane];
        g.fillStyle = '#fdf6e3'; g.strokeStyle = '#2d3b4f'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(px - 10, y); g.lineTo(px + 196, y); g.lineTo(px + 216, y + 24); g.lineTo(px + 196, y + 48); g.lineTo(px - 10, y + 48); g.closePath(); g.fill(); g.stroke();
        emoji(s.emoji, px + 16, y + 25, 26);
        g.fillStyle = '#1b2638'; g.font = `bold ${s.word.length > 12 ? 13 : 16}px sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(`${arrow} ${s.word}`, px + 34, y + 25);
      });
    }
    function drawObstacle(o) {
      const x = o.x - camX;
      if (x > W + 40 || x + o.w < -40) return;
      const gy = groundAt(o.x + o.w / 2, o.lane);
      g.save();
      if (o.hit) { g.translate(x + o.w / 2, gy); g.rotate(0.5); g.translate(-(x + o.w / 2), -gy); g.globalAlpha = 0.6; }
      g.strokeStyle = '#1b2638'; g.lineWidth = 2;
      switch (o.type) {
        case 'box': g.fillStyle = '#c8955a'; g.fillRect(x, gy - 44, 44, 44); g.strokeRect(x, gy - 44, 44, 44); g.beginPath(); g.moveTo(x, gy - 22); g.lineTo(x + 44, gy - 22); g.stroke(); break;
        case 'bench': g.fillStyle = '#7b5a3a'; g.fillRect(x, gy - 36, 84, 10); g.fillRect(x, gy - 50, 84, 8); g.fillStyle = '#39424f'; g.fillRect(x + 6, gy - 26, 6, 26); g.fillRect(x + 72, gy - 26, 6, 26); break;
        case 'barrier': g.fillStyle = '#e8eef4'; g.fillRect(x, gy - 50, 22, 50); g.fillStyle = '#d94a52'; for (let s = 0; s < 3; s++) g.fillRect(x, gy - 46 + s * 16, 22, 7); g.strokeRect(x, gy - 50, 22, 50); break;
        case 'cones': for (let c = 0; c < 2; c++) { const cx = x + 13 + c * 28; g.fillStyle = '#ff8a2a'; g.beginPath(); g.moveTo(cx - 12, gy); g.lineTo(cx, gy - 32); g.lineTo(cx + 12, gy); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.fillRect(cx - 6, gy - 18, 12, 5); } break;
        case 'banner': { const s = OBSTACLES.banner; g.fillStyle = '#4c586b'; g.fillRect(x - 6, 0, 4, s.top); g.fillRect(x + o.w + 2, 0, 4, s.top);
          g.fillStyle = '#ffbd3f'; g.fillRect(x, s.top, o.w, s.bottom - s.top); g.strokeRect(x, s.top, o.w, s.bottom - s.top);
          g.fillStyle = '#1b2638'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SALE', x + o.w / 2, (s.top + s.bottom) / 2 - 8); g.fillText('↓ SLIDE', x + o.w / 2, (s.top + s.bottom) / 2 + 10); break; }
        case 'gap': g.fillStyle = '#1d2533'; g.fillRect(x, GROUND, o.w, H - GROUND); g.strokeStyle = '#ffbd3f'; g.setLineDash([8, 6]); g.strokeRect(x, GROUND, o.w, 4); g.setLineDash([]); break;
        case 'door': { const open = doorOpen(o); g.fillStyle = '#6e7b94'; g.fillRect(x - 10, gy - 124, o.w + 20, 14);
          g.fillStyle = 'rgba(170,215,255,.55)'; const sh = open ? 22 : 0; g.fillRect(x - sh, gy - 110, o.w / 2 + 2, 110); g.fillRect(x + o.w / 2 + sh, gy - 110, o.w / 2, 110);
          g.strokeRect(x - sh, gy - 110, o.w / 2 + 2, 110); g.strokeRect(x + o.w / 2 + sh, gy - 110, o.w / 2, 110); break; }
      }
      g.restore();
    }
    function drawHide(h, idx) {
      const x = h.x - camX;
      if (x > W + 60 || x < -140) return;
      const hiding = M.hidden === idx;
      if (hiding) { // peeking tells drawn behind the object
        const bob = Math.sin(t * 3) * 3;
        g.fillStyle = mark.look.hairColor; g.beginPath(); g.arc(x + 56, GROUND - 84 + bob, 11, Math.PI, 0); g.fill();
      }
      g.strokeStyle = '#1b2638'; g.lineWidth = 2;
      switch (h.type) {
        case 'vending': g.fillStyle = '#d94a52'; g.fillRect(x, GROUND - 120, 70, 120); g.strokeRect(x, GROUND - 120, 70, 120);
          g.fillStyle = '#e9f6ff'; g.fillRect(x + 8, GROUND - 110, 40, 64); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { g.fillStyle = ['#3fa7d6', '#f6d743', '#59cd90'][c]; g.fillRect(x + 12 + c * 12, GROUND - 104 + r * 20, 8, 14); }
          g.fillStyle = '#1b2638'; g.fillRect(x + 54, GROUND - 90, 8, 18); break;
        case 'tree': g.fillStyle = '#7a5532'; g.fillRect(x + 26, GROUND - 90, 20, 90); g.fillStyle = '#3f8a44';
          g.beginPath(); g.arc(x + 36, GROUND - 120, 50, 0, 7); g.arc(x + 6, GROUND - 100, 32, 0, 7); g.arc(x + 70, GROUND - 98, 32, 0, 7); g.fill(); break;
        case 'billboard': g.fillStyle = '#566377'; g.fillRect(x + 8, GROUND - 60, 8, 60); g.fillRect(x + 58, GROUND - 60, 8, 60);
          g.fillStyle = '#2d6cdf'; g.fillRect(x - 10, GROUND - 130, 94, 74); g.strokeRect(x - 10, GROUND - 130, 94, 74);
          g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.fillText('READ', x + 37, GROUND - 100); g.fillText('ENGLISH!', x + 37, GROUND - 80);
          g.fillStyle = '#4c586b'; g.fillRect(x - 6, GROUND - 56, 86, 56); break;
        case 'shop': g.fillStyle = '#e0a458'; g.fillRect(x - 10, GROUND - 140, 100, 140); g.fillStyle = '#2d3b4f'; g.fillRect(x + 10, GROUND - 100, 60, 100);
          for (let s = 0; s < 5; s++) { g.fillStyle = s % 2 ? '#fff' : '#37b7d8'; g.fillRect(x - 14 + s * 22, GROUND - 124, 22, 18); } break;
        case 'boxes': g.fillStyle = '#c8955a'; [[0, 0], [44, 0], [22, 44], [0, 88]].forEach(([dx, dy]) => { g.fillRect(x + dx, GROUND - 44 - dy, 44, 44); g.strokeRect(x + dx, GROUND - 44 - dy, 44, 44); }); break;
      }
      if (hiding) {
        const a = 0.5 + 0.5 * Math.sin(t * 6);
        g.globalAlpha = a; g.fillStyle = '#ffbd3f'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.fillText('?', x + 36, GROUND - 158); g.globalAlpha = 1;
        if (Math.abs(P.x - (h.x + 30)) < 110) { g.fillStyle = 'rgba(5,12,24,.8)'; g.fillRect(x - 6, GROUND - 210, 92, 26); g.fillStyle = '#3fd28a'; g.font = 'bold 14px "Courier New",monospace'; g.fillText('PRESS E', x + 40, GROUND - 197); }
      }
    }
    function drawRunner(b, isAgent) {
      if (b.fall > 0 && b.y > GROUND + 40) return;
      const x = b.x - camX;
      if (x < -60 || x > W + 60) return;
      const pose = !b.onGround && b.fall <= 0 ? 'jump' : b.slide ? 'duck' : Math.abs(b.speed) > 20 ? 'run' : 'idle';
      if (b.stumble > 0 && Math.floor(t * 16) % 2) g.globalAlpha = 0.45;
      const opts = { view: 'side', scale: 1.15, pose, frame: b.frame, facing: b.speed < -5 ? 'left' : 'right', showProp: false };
      if (isAgent) kit.drawAgent(g, ctx.agent, x, b.y, opts);
      else kit.drawChild(g, markPerson, x, b.y, opts);
      g.globalAlpha = 1;
    }
    function hud() {
      // distance meter
      const d = Math.max(0, Math.round((M.x - P.x) / 10));
      g.fillStyle = 'rgba(5,12,24,.72)'; g.fillRect(16, 14, 420, 46); g.strokeStyle = 'rgba(55,183,216,.6)'; g.strokeRect(16, 14, 420, 46);
      g.fillStyle = '#9fb4c9'; g.font = 'bold 12px "Courier New",monospace'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('DISTANCE TO MARK', 28, 28);
      g.fillStyle = '#ffbd3f'; g.font = 'bold 20px "Courier New",monospace'; g.fillText(`${d} m`, 28, 48);
      const bx = 176, bw = 244, frac = Math.max(0, Math.min(1, (M.x - P.x) / 1000));
      g.fillStyle = '#1b2638'; g.fillRect(bx, 34, bw, 8);
      g.fillStyle = frac < 0.3 ? '#3fd28a' : frac < 0.7 ? '#ffbd3f' : '#ff6b6b'; g.fillRect(bx, 34, bw * frac, 8);
      emoji('🕵️', bx, 38, 18); emoji('🏃', bx + bw * frac, 38, 18);
      if (timeLimit !== Infinity && state === 'run') {
        const left = Math.max(0, Math.ceil(timeLimit - t));
        g.fillStyle = 'rgba(5,12,24,.72)'; g.fillRect(W - 116, 14, 100, 46);
        g.fillStyle = left <= 10 ? '#ff6b6b' : '#e9f6ff'; g.font = 'bold 26px "Courier New",monospace'; g.textAlign = 'center'; g.fillText(`${left}s`, W - 66, 38);
      }
      if (cueTime > 0) {
        g.globalAlpha = Math.min(1, cueTime * 3); g.fillStyle = cueColor; g.font = 'bold 30px sans-serif'; g.textAlign = 'center';
        g.strokeStyle = 'rgba(5,12,24,.85)'; g.lineWidth = 6; g.strokeText(cue, W / 2, 112); g.fillText(cue, W / 2, 112); g.globalAlpha = 1;
      }
      if (state === 'countdown') {
        g.fillStyle = 'rgba(5,12,24,.4)'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#ffbd3f'; g.font = 'bold 90px sans-serif'; g.textAlign = 'center';
        g.fillText(countdown > 1.5 ? 'READY' : countdown > 0.6 ? 'SET' : 'GO!', W / 2, H / 2);
      }
      if (state === 'caught' || state === 'escaped') {
        const mx = M.x - camX;
        if (state === 'caught') {
          g.fillStyle = '#fff'; g.strokeStyle = '#1b2638'; g.lineWidth = 3;
          const bx2 = Math.min(W - 200, Math.max(20, mx - 80)), by = M.y - 150;
          g.beginPath(); g.roundRect ? g.roundRect(bx2, by, 190, 48, 12) : g.rect(bx2, by, 190, 48); g.fill(); g.stroke();
          g.fillStyle = '#1b2638'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillText(endText, bx2 + 95, by + 25);
        } else {
          g.fillStyle = 'rgba(5,12,24,.55)'; g.fillRect(0, H / 2 - 50, W, 100);
          g.fillStyle = '#ffbd3f'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.fillText(endText, W / 2, H / 2);
        }
      }
    }
    function render() {
      background();
      level.forks.forEach(drawFork);
      level.boosts.forEach(b => {
        const x = b.x - camX; if (x < -90 || x > W + 10 || b.used) return;
        const gy = groundAt(b.x + 40, b.lane);
        g.fillStyle = '#3fd28a'; g.fillRect(x, gy - 6, 80, 6);
        g.fillStyle = '#e9fff3'; g.font = 'bold 16px sans-serif'; g.textAlign = 'center'; g.fillText('»»»', x + 40, gy - 14);
      });
      level.drinks.forEach(d => { const x = d.x - camX; if (!d.used && x > -30 && x < W + 30) emoji('🥤', x, GROUND - 26 + Math.sin(t * 4 + d.x) * 4, 30); });
      level.obstacles.forEach(drawObstacle);
      // Mark first so hiding objects cover them; slipping marks move along the background.
      if (M.slip > 0) { g.globalAlpha = 0.55; kit.drawChild(g, markPerson, M.x - camX, GROUND - 30, { view: 'side', scale: 0.85, pose: 'run', frame: M.frame, showProp: false }); g.globalAlpha = 1; }
      else if (M.hidden < 0) {
        if (state === 'caught') kit.drawChild(g, markPerson, M.x - camX, M.y, { view: 'side', scale: 1.15, pose: 'wave', facing: 'left', showProp: false });
        else drawRunner(M, false);
      }
      level.hides.forEach(drawHide);
      drawRunner(P, true);
      if (M.found > 0) { g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.fillText('Oh no!', M.x - camX, M.y - 92); }
      hud();
    }

    return { destroy() { root.remove(); } };
  }

  Minigames.register({
    id: 'chase', kind: 'intercept', title: 'FOOT PURSUIT',
    brief: c => `${c.mark.name} is running! Chase ${c.profile.pro === 'he' ? 'him' : 'her'} through the city. Use HQ's English clues to pick the shortcut.`,
    mount,
  });
})();
