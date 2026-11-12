/* ============================================================
   INTERCEPT — Drone Surveillance
   A top-down neighbourhood (roads, a park with a pond and trees,
   a covered market, houses and shops). People walk a path graph on
   seeded itineraries; the mark sometimes waits under trees, under
   the market roof or inside a building. At 1× zoom the drone sees
   only shirt colours; at 2× hair and props are readable. Hold SCAN
   on a person, confirm, and the team van drives the roads to them.
   Battery is generous; an empty battery just returns the drone to
   base. A wrong target waves: "Not our target — sorry!"
   ============================================================ */
(() => {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports;
  const D = NODE ? require('../data.js') : DATA;
  const M = NODE ? require('../missions.js') : Missions;

  const MW = 2400, MH = 1500, RX = [300, 900, 1500, 2100], RY = [250, 750, 1250];
  const HORIZON = 900, MAX_HIDE = 9;
  const BASE = { x: 300, y: 1250 };

  /* ---------- pure scenario generation ---------- */
  function generate({ mark, pack, tier = 1, seed = 1, profile }) {
    const random = M.rng(seed);
    const range = (a, b) => a + random() * (b - a);
    profile = profile || (() => {
      const p = M.profile(mark, pack);
      if (tier === 3) p.clues.push(`${p.Pro} has ${p.look.hair === 'bob' ? 'a bob haircut' : p.look.hair + ' hair'}.`);
      return p;
    })();
    // A fixed town: the streets never change, only the people do.
    const LAYOUT = [['houses', 'park', 'shops'], ['parking', 'market', 'construction']];
    const blocks = [];
    for (let by = 0; by < 2; by++) for (let bx = 0; bx < 3; bx++) {
      blocks.push({ bx, by, x: RX[bx], y: RY[by], w: RX[bx + 1] - RX[bx], h: RY[by + 1] - RY[by], kind: LAYOUT[by][bx] });
    }
    const nodes = [], edges = [];
    const add = (x, y, type) => { nodes.push({ id: nodes.length, x, y, type: type || 'road' }); return nodes.length - 1; };
    const link = (a, b) => { edges.push([a, b]); };
    const grid = RY.map(y => RX.map(x => add(x, y)));
    const mid = RY.map(() => []);
    // Roads, with a midpoint on every segment and doors on the house/shop sides.
    for (let r = 0; r < RY.length; r++) for (let c = 0; c < RX.length - 1; c++) {
      const m = add((RX[c] + RX[c + 1]) / 2, RY[r]);
      mid[r][c] = m; link(grid[r][c], m); link(m, grid[r][c + 1]);
      const above = blocks.find(b => b.bx === c && b.by === r - 1), below = blocks.find(b => b.bx === c && b.by === r);
      const doorBlock = [below, above].find(b => b && (b.kind === 'houses' || b.kind === 'shops'));
      if (doorBlock) link(m, add(nodes[m].x + 70, RY[r] + (doorBlock === below ? 34 : -34), 'door'));
    }
    for (let c = 0; c < RX.length; c++) for (let r = 0; r < RY.length - 1; r++) link(grid[r][c], grid[r + 1][c]);
    // Cover spots: park trees, market roof, carport, construction tarp, and an alley through the houses.
    const covers = [];
    blocks.forEach(b => {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      if (b.kind === 'houses') {
        const n = add(cx, cy, 'alley');
        link(n, mid[b.by][b.bx]); link(n, mid[b.by + 1][b.bx]);
        covers.push({ kind: 'alley', x: cx - 34, y: b.y + 60, w: 68, h: b.h - 120 });
        return;
      }
      if (b.kind === 'shops') return;
      const type = { park: 'tree', market: 'market', parking: 'carport', construction: 'tarp' }[b.kind];
      const nx = b.kind === 'park' ? cx - 90 : cx;
      const n = add(nx, cy, type);
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([dx, dy]) => link(n, grid[b.by + dy][b.bx + dx]));
      if (b.kind === 'park') { covers.push({ kind: 'trees', x: nx, y: cy, r: 95 }); b.pond = { x: b.x + b.w - 150, y: cy, r: 85 }; }
      else covers.push({ kind: type, x: nx - 130, y: cy - 95, w: 260, h: 190 });
    });
    const pads = blocks.filter(b => ['houses', 'shops', 'construction'].includes(b.kind)).map(b => ({ x: b.x + b.w * 0.22, y: b.y + b.h / 2 }));
    const adj = nodes.map(() => []);
    edges.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
    const crowd = M.makeCrowd(profile, { count: { 1: 10, 2: 14, 3: 18 }[tier], tier, rng: random });
    const hideCount = 1 + Math.floor(random() * Math.min(3, tier + 1));
    const people = crowd.map((p, i) => ({ ...p, segs: itinerary(random, nodes, adj, p.isMark, p.isMark ? hideCount : 0, (i * 5 + 3) % nodes.length) }));
    return { blocks, nodes, edges, adj, covers, pads, people, profile, hideCount };
  }

  function path(adj, from, to) {
    const prev = new Map([[from, -1]]), q = [from];
    while (q.length) { const n = q.shift(); if (n === to) break; adj[n].forEach(m => { if (!prev.has(m)) { prev.set(m, n); q.push(m); } }); }
    if (!prev.has(to)) return null;
    const out = []; for (let n = to; n !== -1; n = prev.get(n)) out.unshift(n);
    return out;
  }

  function itinerary(random, nodes, adj, isMark, hides, start) {
    const range = (a, b) => a + random() * (b - a);
    const segs = [];
    const speed = isMark ? range(58, 66) : range(36, 60);
    let t = 0, at = start, last = -1;
    const hideAt = Array.from({ length: hides }, (_, i) => 20 + i * 40 + range(0, 20));
    const go = to => {
      const a = nodes[at], b = nodes[to], dur = Math.hypot(b.x - a.x, b.y - a.y) / speed;
      segs.push({ type: 'walk', x0: a.x, y0: a.y, x1: b.x, y1: b.y, t0: t, t1: t + dur });
      t += dur; last = at; at = to;
    };
    const stay = (dur, hidden, hide) => { const n = nodes[at]; segs.push({ type: hidden ? 'hidden' : 'idle', kind: n.type, x0: n.x, y0: n.y, x1: n.x, y1: n.y, t0: t, t1: t + dur, hide }); t += dur; };
    while (t < HORIZON) {
      if (hideAt.length && t >= hideAt[0]) {
        hideAt.shift();
        const spots = nodes.filter(n => ['tree', 'market', 'door', 'alley', 'carport', 'tarp'].includes(n.type)).map(n => path(adj, at, n.id)).filter(Boolean).sort((a, b) => a.length - b.length);
        const route = spots[Math.floor(random() * Math.min(3, spots.length))];
        route.slice(1).forEach(go);
        stay(range(4, 8), true, true);
        continue;
      }
      const n = nodes[at];
      if (n.type === 'door' && !isMark && random() < 0.5) { stay(range(2, 5), true, false); }
      else if (random() < 0.12) stay(range(1, isMark ? 2 : 4), false, false);
      const options = adj[at].filter(m => m !== last);
      go((options.length ? options : adj[at])[Math.floor(random() * (options.length || adj[at].length))]);
    }
    return segs;
  }

  function at(person, t) {
    const segs = person.segs;
    t = t % segs[segs.length - 1].t1;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (segs[mid].t1 < t) lo = mid + 1; else hi = mid; }
    const s = segs[lo], k = s.t1 > s.t0 ? Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0))) : 1;
    return {
      x: s.x0 + (s.x1 - s.x0) * k, y: s.y0 + (s.y1 - s.y0) * k, moving: s.type === 'walk',
      inside: s.type === 'hidden' && s.kind === 'door', angle: Math.atan2(s.y1 - s.y0, s.x1 - s.x0) + Math.PI / 2, seg: s,
    };
  }
  function covered(scn, x, y) {
    return scn.covers.some(c => c.r ? Math.hypot(x - c.x, y - c.y) < c.r : x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h);
  }

  function validate(scn) {
    const errors = [];
    errors.push(...M.validateCrowd(scn.profile, scn.people));
    // Every node reachable from the base intersection (the team drives this graph).
    const baseNode = scn.nodes.find(n => n.x === BASE.x && n.y === BASE.y);
    if (!baseNode) errors.push('no base node');
    else scn.nodes.forEach(n => { if (!path(scn.adj, baseNode.id, n.id)) errors.push(`node ${n.id} unreachable`); });
    const onGraph = (x, y) => scn.nodes.some(n => Math.hypot(n.x - x, n.y - y) < 0.5);
    const mark = scn.people.find(p => p.isMark);
    mark.segs.forEach(s => {
      if (!onGraph(s.x0, s.y0) || !onGraph(s.x1, s.y1)) errors.push('mark waypoint off the paths');
      if (s.type === 'hidden' && s.t1 - s.t0 > MAX_HIDE) errors.push('mark hidden too long');
      if (s.x0 < 0 || s.x0 > MW || s.y0 < 0 || s.y0 > MH) errors.push('mark leaves the map');
    });
    const hides = mark.segs.filter(s => s.hide).length;
    if (hides < 1 || hides > 3) errors.push(`mark hides ${hides} times`);
    if (!scn.pads.length) errors.push('no recharge pad');
    if (scn.pads.some(p => p.x < 0 || p.x > MW || p.y < 0 || p.y > MH)) errors.push('pad off the map');
    scn.blocks.forEach(b => { if (b.pond && scn.nodes.some(n => Math.hypot(n.x - b.pond.x, n.y - b.pond.y) < b.pond.r)) errors.push('path through the pond'); });
    return errors;
  }

  if (NODE) { module.exports = { generate, validate, at, covered, path, BASE }; return; }

  /* ============================================================
     Browser game
     ============================================================ */
  const W = 960, H = 540, MINI_W = 180, MINI_H = 112, CELL = 150;

  function mount(host, ctx) {
    const { kit, profile } = ctx;
    const scn = generate({ mark: ctx.mark, pack: ctx.pack, tier: ctx.tier, seed: ctx.seed, profile });
    const relaxed = ctx.relaxed;
    const timeLimit = relaxed ? Infinity : { 1: 240, 2: 210, 3: 190 }[ctx.tier];
    const drain = { 1: 0.42, 2: 0.5, 3: 0.58 }[ctx.tier];
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const markP = scn.people.find(p => p.isMark);
    let t = 0, finished = false, battery = 100, zoom = 1, zoomShown = 1, scanT = 0, scanned = null, wrongPicks = 0, success = null, rtb = 0;
    const drone = { x: BASE.x + 150, y: BASE.y - 150, vx: 0, vy: 0 };
    const van = { x: BASE.x, y: BASE.y, angle: 0, route: [], target: null, lastSeen: null, stopped: true };
    const waved = new Map(), searched = new Set();
    let bubble = null;

    const root = document.createElement('div');
    root.className = 'mg-drone';
    root.innerHTML = `
      <div class="mgd-stage" id="mgd-stage"></div>
      <aside class="mgd-panel">
        <div class="mgd-block"><div class="mgd-label">HQ INTEL // FIND THE MARK</div>
          <ul class="mgd-clues">${profile.clues.map(c => `<li>${c}</li>`).join('')}</ul></div>
        <div class="mgd-block"><div class="mgd-label">BATTERY</div><div class="mgd-battery"><i id="mgd-bat"></i><span id="mgd-bat-txt">100%</span></div></div>
        <div class="mgd-block"><div class="mgd-label">SCAN RESULT</div><div class="mgd-card" id="mgd-card">Fly over a person and hold SCAN (Space).</div>
          <button type="button" class="btn primary" id="mgd-send" disabled>CONFIRM TARGET — SEND TEAM</button></div>
        <div class="mgd-block"><div class="mgd-label">FIELD TEAM</div><div class="mgd-team" id="mgd-team">Van waiting at base.</div></div>
        <div class="mgd-row"><button type="button" class="btn ghost" id="mgd-zoom">ZOOM 2×</button><button type="button" class="btn secondary" id="mgd-scan">HOLD TO SCAN</button></div>
        <div class="mgd-time" id="mgd-time"></div>
      </aside>`;
    host.appendChild(root);
    const $ = s => root.querySelector(s);
    const { canvas, g } = kit.canvas($('#mgd-stage'), W, H);
    if (coarse) kit.touchPad($('#mgd-stage'), [{ key: 'left', label: '◀' }, { key: 'up', label: '▲' }, { key: 'down', label: '▼' }, { key: 'right', label: '▶' }]);

    /* pre-rendered map layers: ground (under people) and cover (over people) */
    const ground = document.createElement('canvas'); ground.width = MW; ground.height = MH;
    const cover = document.createElement('canvas'); cover.width = MW; cover.height = MH;
    const mini = document.createElement('canvas'); mini.width = MINI_W; mini.height = MINI_H;
    drawMap(ground.getContext('2d'), cover.getContext('2d'));
    mini.getContext('2d').drawImage(ground, 0, 0, MINI_W, MINI_H);
    mini.getContext('2d').drawImage(cover, 0, 0, MINI_W, MINI_H);

    function drawMap(gg, cc) {
      gg.fillStyle = '#8fc77a'; gg.fillRect(0, 0, MW, MH);
      const roofColors = ['#c96a52', '#6a8fb3', '#e0a458', '#8b6fae', '#5aa38f', '#b8584a'];
      // outer houses for a full neighbourhood feel
      for (let x = 20; x < MW; x += 130) for (const y of [40, MH - 150]) { gg.fillStyle = roofColors[(x / 130 | 0) % 6]; gg.fillRect(x, y, 100, 110); gg.fillStyle = 'rgba(0,0,0,.15)'; gg.fillRect(x, y + 55, 100, 4); }
      scn.blocks.forEach((b, i) => {
        const pad = 46;
        if (b.kind === 'park') {
          gg.fillStyle = '#7fbf6a'; gg.fillRect(b.x + 30, b.y + 30, b.w - 60, b.h - 60);
          gg.fillStyle = '#5fa8d8'; gg.beginPath(); gg.arc(b.pond.x, b.pond.y, b.pond.r, 0, 7); gg.fill();
          gg.strokeStyle = '#d8c79a'; gg.lineWidth = 3; gg.beginPath(); gg.arc(b.pond.x, b.pond.y, b.pond.r + 6, 0, 7); gg.stroke();
          gg.fillStyle = '#e6d3a3'; gg.fillRect(b.x + 60, b.y + b.h - 120, 90, 60); // playground sand
        } else if (b.kind === 'market') {
          gg.fillStyle = '#d9cfbf'; gg.fillRect(b.x + 30, b.y + 30, b.w - 60, b.h - 60);
        } else if (b.kind === 'parking') {
          gg.fillStyle = '#6d7380'; gg.fillRect(b.x + 30, b.y + 30, b.w - 60, b.h - 60);
          gg.strokeStyle = '#e8e8e8'; gg.lineWidth = 3;
          for (let px = b.x + 50; px < b.x + b.w - 50; px += 56) { gg.beginPath(); gg.moveTo(px, b.y + 40); gg.lineTo(px, b.y + 120); gg.moveTo(px, b.y + b.h - 120); gg.lineTo(px, b.y + b.h - 40); gg.stroke(); }
          const carCols = ['#d94a52', '#37b7d8', '#f4c518', '#e8eef4', '#2d3b4f', '#5aa38f'];
          for (let px = b.x + 58, i = 0; px < b.x + b.w - 90; px += 112, i++) { gg.fillStyle = carCols[i % 6]; gg.fillRect(px, b.y + 52, 40, 60); gg.fillStyle = carCols[(i + 3) % 6]; gg.fillRect(px + 56, b.y + b.h - 112, 40, 60); }
        } else if (b.kind === 'construction') {
          gg.fillStyle = '#c9a66b'; gg.fillRect(b.x + 30, b.y + 30, b.w - 60, b.h - 60);
          gg.strokeStyle = '#f39c12'; gg.lineWidth = 6; gg.setLineDash([18, 12]); gg.strokeRect(b.x + 34, b.y + 34, b.w - 68, b.h - 68); gg.setLineDash([]);
          gg.fillStyle = '#8c8c8c'; [[b.x + b.w - 130, b.y + 70], [b.x + b.w - 110, b.y + b.h - 120]].forEach(([x, y]) => gg.fillRect(x, y, 70, 46));
          gg.fillStyle = '#f4c518'; gg.fillRect(b.x + 70, b.y + b.h - 90, 120, 14); gg.fillRect(b.x + 70, b.y + b.h - 104, 14, 40);
        } else {
          for (let hx = b.x + pad; hx < b.x + b.w - pad - 80; hx += 130) for (const hy of [b.y + 70, b.y + b.h - 180]) {
            if (b.kind === 'houses' && Math.abs(hx + 55 - (b.x + b.w / 2)) < 90) continue; // leave room for the alley
            gg.fillStyle = roofColors[(hx / 130 + hy) % 6 | 0]; gg.fillRect(hx, hy, 110, 110);
            gg.fillStyle = 'rgba(0,0,0,.18)'; gg.fillRect(hx, hy + 53, 110, 4);
            if (b.kind === 'shops') { gg.fillStyle = '#fff'; gg.fillRect(hx + 10, hy + (hy < b.y + b.h / 2 ? -12 : 112), 90, 10); }
          }
        }
      });
      // paths (diagonals) and roads
      gg.strokeStyle = '#e6d8b0'; gg.lineWidth = 22; gg.lineCap = 'round';
      scn.edges.forEach(([a, b]) => { const A = scn.nodes[a], B = scn.nodes[b]; if (A.type !== 'road' || B.type !== 'road') { gg.beginPath(); gg.moveTo(A.x, A.y); gg.lineTo(B.x, B.y); gg.stroke(); } });
      gg.fillStyle = '#5b6170';
      RX.forEach(x => gg.fillRect(x - 30, 0, 60, MH));
      RY.forEach(y => gg.fillRect(0, y - 30, MW, 60));
      gg.fillStyle = '#c9c2b6';
      RX.forEach(x => { gg.fillRect(x - 40, 0, 10, MH); gg.fillRect(x + 30, 0, 10, MH); });
      RY.forEach(y => { gg.fillRect(0, y - 40, MW, 10); gg.fillRect(0, y + 30, MW, 10); });
      gg.fillStyle = '#f2f2f2';
      RX.forEach(x => { for (let y = 0; y < MH; y += 60) gg.fillRect(x - 2, y, 4, 30); });
      RY.forEach(y => { for (let x = 0; x < MW; x += 60) gg.fillRect(x, y - 2, 30, 4); });
      scn.nodes.filter(n => n.type === 'door').forEach(n => { gg.fillStyle = '#3d2b1f'; gg.fillRect(n.x - 16, n.y - 8, 32, 16); });
      scn.pads.forEach(p => { gg.fillStyle = '#2d3b4f'; gg.beginPath(); gg.arc(p.x, p.y, 44, 0, 7); gg.fill(); gg.strokeStyle = '#ffbd3f'; gg.lineWidth = 5; gg.stroke(); gg.fillStyle = '#ffbd3f'; gg.font = 'bold 44px sans-serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText('H', p.x, p.y + 2); });
      gg.fillStyle = '#22314a'; gg.fillRect(BASE.x - 90, BASE.y + 50, 120, 70); gg.fillStyle = '#ffbd3f'; gg.font = 'bold 22px sans-serif'; gg.textAlign = 'center'; gg.fillText('BASE', BASE.x - 30, BASE.y + 88);
      // cover layer
      scn.covers.forEach(c => {
        if (c.kind === 'trees') {
          for (let k = 0; k < 9; k++) {
            const a = k / 9 * Math.PI * 2, r = k ? 62 : 0;
            cc.fillStyle = k % 2 ? '#3f8a44' : '#4f9a4a'; cc.beginPath(); cc.arc(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 52, 0, 7); cc.fill();
          }
        } else if (c.kind === 'market') {
          for (let s = 0; s < c.w; s += 26) { cc.fillStyle = (s / 26) % 2 ? '#f4ead5' : '#d94a52'; cc.fillRect(c.x + s, c.y, 26, c.h); }
          cc.strokeStyle = '#7b2f2f'; cc.lineWidth = 4; cc.strokeRect(c.x, c.y, c.w, c.h);
          cc.fillStyle = '#1b2638'; cc.font = 'bold 26px sans-serif'; cc.textAlign = 'center'; cc.fillText('MARKET', c.x + c.w / 2, c.y + c.h / 2 + 8);
        } else if (c.kind === 'carport') {
          cc.fillStyle = '#9aa6b6'; cc.fillRect(c.x, c.y, c.w, c.h);
          cc.fillStyle = 'rgba(0,0,0,.12)'; for (let s = 0; s < c.w; s += 20) cc.fillRect(c.x + s, c.y, 3, c.h);
          cc.strokeStyle = '#566377'; cc.lineWidth = 4; cc.strokeRect(c.x, c.y, c.w, c.h);
          cc.fillStyle = '#1b2638'; cc.font = 'bold 24px sans-serif'; cc.textAlign = 'center'; cc.fillText('P  CARPORT', c.x + c.w / 2, c.y + c.h / 2 + 8);
        } else if (c.kind === 'tarp') {
          cc.fillStyle = '#2f7fd8'; cc.fillRect(c.x, c.y, c.w, c.h);
          cc.strokeStyle = 'rgba(255,255,255,.35)'; cc.lineWidth = 2;
          for (let s = 0; s < c.w + c.h; s += 30) { cc.beginPath(); cc.moveTo(c.x + Math.min(s, c.w), c.y + Math.max(0, s - c.w)); cc.lineTo(c.x + Math.max(0, s - c.h), c.y + Math.min(s, c.h)); cc.stroke(); }
          cc.fillStyle = '#fff'; cc.font = 'bold 22px sans-serif'; cc.textAlign = 'center'; cc.fillText('CONSTRUCTION', c.x + c.w / 2, c.y + c.h / 2 + 8);
        } else if (c.kind === 'alley') {
          cc.fillStyle = '#4a4f5c'; cc.fillRect(c.x, c.y, c.w, c.h);
          cc.fillStyle = '#c96a52'; for (let y = c.y; y < c.y + c.h; y += 70) { cc.fillRect(c.x, y, c.w / 2 - 4, 54); }
          cc.fillStyle = '#6a8fb3'; for (let y = c.y + 35; y < c.y + c.h; y += 70) { cc.fillRect(c.x + c.w / 2 + 4, y, c.w / 2 - 4, 54); }
        }
      });
      // scattered trees elsewhere in the park
      scn.blocks.filter(b => b.kind === 'park').forEach(b => { [[b.x + 90, b.y + 80], [b.x + b.w - 80, b.y + 70], [b.x + 120, b.y + b.h - 70]].forEach(([x, y]) => { cc.fillStyle = '#3f8a44'; cc.beginPath(); cc.arc(x, y, 36, 0, 7); cc.fill(); }); });
    }

    const viewScale = () => zoomShown === 1 ? 0.5 : 1; // world → screen
    const stateOf = p => (success && p.isMark) ? success.pos : (waved.get(p.id) && t < waved.get(p.id).until ? waved.get(p.id).pos : at(p, t));
    const seenFromAir = s => !s.inside && !covered(scn, s.x, s.y);
    function screenOf(x, y) { const s = viewScale(); return { x: (x - drone.x) * s + W / 2, y: (y - drone.y) * s + H / 2 }; }
    function inView(x, y) { const p = screenOf(x, y); return p.x > 0 && p.x < W && p.y > 0 && p.y < H; }

    function setTeam(text) { $('#mgd-team').textContent = text; }
    let zoomNag = 0;
    function scanTick(dt, holding) {
      if (!holding) { scanT = 0; return; }
      if (zoom !== 2) { // the clues are only readable up close
        if (zoomNag <= 0) { $('#mgd-card').textContent = 'Zoom in to 2× first (E / +), then scan.'; zoomNag = 2; kit.sfx.blip(); }
        return;
      }
      // person nearest the crosshair
      let best = null, bd = 1e9;
      scn.people.forEach(p => { const s = stateOf(p); if (!seenFromAir(s)) return; const sp = screenOf(s.x, s.y), d = Math.hypot(sp.x - W / 2, sp.y - H / 2); if (d < 46 && d < bd) { bd = d; best = p; } });
      if (!best) { scanT = 0; return; }
      if (scanned && scanned.id === best.id) return;
      scanT += dt;
      if (Math.floor(scanT * 10) !== Math.floor((scanT - dt) * 10)) kit.sfx.tone({ f: 1200 + scanT * 800, t: 0.03, type: 'square', v: 0.03 });
      if (scanT >= 0.8) {
        scanned = best; scanT = 0;
        const hairWord = best.look.hair === 'bob' ? 'bob haircut' : best.look.hair + ' hair';
        $('#mgd-card').innerHTML = `<span class="mgd-swatch" style="background:${best.look.shirt}"></span><span class="mgd-prop">${best.prop ? best.prop.emoji : '—'}</span><span class="mgd-hair">${hairWord}</span>`;
        $('#mgd-send').disabled = false;
        kit.sfx.good();
      }
    }
    function send() {
      if (!scanned || finished || success) return;
      van.target = scanned.id; van.lastSeen = { x: stateOf(scanned).x, y: stateOf(scanned).y }; van.stopped = false; van.route = routeTo(van.lastSeen);
      setTeam('Team van on the way!');
      kit.sfx.tone({ f: 520, f2: 780, t: 0.18, type: 'triangle', v: 0.06 });
    }
    function nearestNode(x, y) { let b = scn.nodes[0]; scn.nodes.forEach(n => { if (Math.hypot(n.x - x, n.y - y) < Math.hypot(b.x - x, b.y - y)) b = n; }); return b; }
    function routeTo(pos) {
      const from = nearestNode(van.x, van.y), to = nearestNode(pos.x, pos.y);
      const ids = path(scn.adj, from.id, to.id) || [to.id];
      return ids.map(id => ({ x: scn.nodes[id].x, y: scn.nodes[id].y })).concat([{ x: pos.x, y: pos.y }]);
    }
    let retarget = 0;
    function updateVan(dt) {
      if (van.stopped || van.target === null) return;
      const p = scn.people.find(x => x.id === van.target), s = stateOf(p);
      retarget -= dt;
      if (retarget <= 0 && seenFromAir(s) && inView(s.x, s.y)) { van.lastSeen = { x: s.x, y: s.y }; van.route = routeTo(van.lastSeen); retarget = 1; }
      if (Math.hypot(s.x - van.x, s.y - van.y) < 46 && !s.inside) return contact(p, s);
      const next = van.route[0];
      if (!next) {
        van.stopped = true;
        if (Math.hypot(s.x - van.x, s.y - van.y) < 120 && !s.inside) return contact(p, s);
        setTeam(s.inside ? 'Target went inside. Wait, then scan again.' : 'TARGET MOVED — scan again to update.');
        kit.sfx.bad(); return;
      }
      const dx = next.x - van.x, dy = next.y - van.y, d = Math.hypot(dx, dy), step = 230 * dt;
      van.angle = Math.atan2(dy, dx);
      if (d <= step) { van.x = next.x; van.y = next.y; van.route.shift(); } else { van.x += dx / d * step; van.y += dy / d * step; }
    }
    function contact(p, s) {
      van.stopped = true; van.target = null;
      if (p.isMark) {
        success = { pos: Object.assign({}, s, { moving: false }), at: t };
        bubble = { x: s.x, y: s.y, text: 'You caught me!', until: t + 3 };
        setTeam('Mark stopped. INTERCEPTION SUCCESSFUL!');
        $('#mgd-send').disabled = true; kit.sfx.success();
        kit.after(3000, finish);
      } else {
        wrongPicks++;
        waved.set(p.id, { until: t + 2.6, pos: Object.assign({}, s, { moving: false }) });
        bubble = { x: s.x, y: s.y, text: 'Not our target — sorry!', until: t + 2.6 };
        setTeam('Wrong person. Keep searching!');
        scanned = null; $('#mgd-send').disabled = true; $('#mgd-card').textContent = 'Check the HQ clues again.';
        kit.sfx.tone({ f: 330, f2: 260, t: 0.25, type: 'triangle', v: 0.06 });
      }
    }
    function finish() {
      if (finished) return; finished = true;
      const score = Math.max(40, Math.min(100, 100 - wrongPicks * 15 - Math.max(0, Math.floor((t - 70) / 15)) * 2));
      const markHides = markP.segs.filter(s => s.hide && s.t0 < t).length;
      const stats = { wrongPicks, time: Math.round(t), searched: searched.size };
      if (success) ctx.done({ success: true, outcome: 'caught', score, wrongPicks, markHides, stats });
      else ctx.done({ success: false, outcome: 'escaped', score: Math.min(score, 60), wrongPicks, markHides, stats });
    }

    let scanHeldBtn = false;
    kit.on($('#mgd-scan'), 'pointerdown', e => { e.preventDefault(); scanHeldBtn = true; });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => kit.on($('#mgd-scan'), ev, () => { scanHeldBtn = false; }));
    kit.on($('#mgd-zoom'), 'click', () => { zoom = zoom === 1 ? 2 : 1; });
    kit.on($('#mgd-send'), 'click', send);
    kit.on(window, 'keydown', e => {
      if (e.key === 'Enter') send();
      else if (['e', 'E', '+', '='].includes(e.key)) zoom = 2;
      else if (['q', 'Q', '-'].includes(e.key)) zoom = 1;
    });

    kit.loop(dt => {
      if (finished) return;
      t += dt;
      const k = kit.keys;
      zoomShown += (zoom - zoomShown) * Math.min(1, dt * 10);
      if (Math.abs(zoomShown - zoom) < 0.02) zoomShown = zoom;
      $('#mgd-zoom').textContent = zoom === 1 ? 'ZOOM 2×' : 'ZOOM 1×';
      // drone flight: eased velocity, no physics
      if (rtb > 0) { rtb -= dt; if (rtb <= 0) { drone.x = BASE.x + 150; drone.y = BASE.y - 150; battery = 60; setTeam('Drone relaunched from base.'); } }
      else {
        const sp = zoom === 1 ? 560 : 320;
        const ix = (k.right ? 1 : 0) - (k.left ? 1 : 0), iy = (k.down ? 1 : 0) - (k.up ? 1 : 0);
        drone.vx += (ix * sp - drone.vx) * Math.min(1, dt * 6); drone.vy += (iy * sp - drone.vy) * Math.min(1, dt * 6);
        const half = { x: W / 2 / (zoom === 1 ? 0.5 : 1), y: H / 2 / (zoom === 1 ? 0.5 : 1) };
        drone.x = Math.max(half.x, Math.min(MW - half.x, drone.x + drone.vx * dt)); drone.y = Math.max(half.y, Math.min(MH - half.y, drone.y + drone.vy * dt));
        const onPad = scn.pads.some(p => Math.hypot(p.x - drone.x, p.y - drone.y) < 70);
        battery = onPad ? Math.min(100, battery + 12 * dt) : Math.max(relaxed ? 25 : 0, battery - drain * dt * (zoom === 2 ? 1.15 : 1));
        if (battery <= 0) { rtb = 2; setTeam('BATTERY EMPTY — RETURN TO BASE'); kit.sfx.bad(); }
      }
      searched.add(Math.floor(drone.x / CELL) + ',' + Math.floor(drone.y / CELL));
      zoomNag = Math.max(0, zoomNag - dt);
      scanTick(dt, (k.space || scanHeldBtn) && rtb <= 0);
      updateVan(dt);
      if (!success && t > timeLimit) finish();
      $('#mgd-bat').style.width = battery + '%';
      $('#mgd-bat').className = battery < 25 ? 'low' : '';
      $('#mgd-bat-txt').textContent = Math.round(battery) + '%';
      $('#mgd-time').textContent = timeLimit === Infinity ? 'RELAXED MODE · NO TIME LIMIT' : `TIME ${Math.max(0, Math.ceil(timeLimit - t))}s`;
    }, render);

    function render() {
      const s = viewScale() * (zoomShown / zoom); // smooth while zoom animates
      const sc = zoomShown === 1 ? 0.5 : zoomShown === 2 ? 1 : 0.5 + (zoomShown - 1) * 0.5;
      g.save();
      g.fillStyle = '#5a8a4f'; g.fillRect(0, 0, W, H);
      g.translate(W / 2, H / 2); g.scale(sc, sc); g.translate(-drone.x, -drone.y);
      g.drawImage(ground, 0, 0);
      // people (shirt dots at 1×, readable sprites at 2×)
      const detail = sc > 0.8;
      scn.people.forEach(p => {
        const st = stateOf(p);
        if (st.inside) return;
        if (detail) kit.drawChild(g, p, st.x, st.y, { view: 'top', scale: 1.1, facing: st.angle, showProp: true });
        else { g.fillStyle = p.look.shirt; g.beginPath(); g.arc(st.x, st.y, 11, 0, 7); g.fill(); g.strokeStyle = '#1b2638'; g.lineWidth = 2; g.stroke(); }
        const w = waved.get(p.id);
        if ((w && t < w.until) || (success && p.isMark)) { g.font = '26px sans-serif'; g.textAlign = 'center'; g.fillText('👋', st.x + 22, st.y - 24); }
        if (scanned && scanned.id === p.id) { g.strokeStyle = '#ffbd3f'; g.lineWidth = 3 / sc; g.beginPath(); g.arc(st.x, st.y, 26, 0, 7); g.stroke(); }
      });
      // van
      g.save(); g.translate(van.x, van.y); g.rotate(van.angle);
      g.fillStyle = '#22314a'; g.fillRect(-30, -16, 60, 32); g.fillStyle = '#ffbd3f'; g.fillRect(14, -14, 12, 28); g.fillStyle = '#e9f6ff'; g.fillRect(-20, -10, 26, 20);
      g.restore();
      if (van.stopped && van.target === null && (success || bubble)) {
        [[-26, 26], [26, 26]].forEach(([dx, dy], i) => kit.drawAgent(g, { gender: i ? 'f' : 'm', skin: i ? '#c68863' : '#f6c9a0', hair: i ? 'bob' : 'short', hairColor: '#1d1d1d', suit: '#22314a', tie: '#e0b23a', shades: true }, van.x + dx, van.y + dy, { view: 'top', scale: 1 }));
      }
      g.drawImage(cover, 0, 0);
      if (bubble && t < bubble.until) {
        g.fillStyle = '#fff'; g.strokeStyle = '#1b2638'; g.lineWidth = 3 / sc;
        const bw = 250 / sc, bh = 44 / sc;
        g.beginPath(); g.rect(bubble.x - bw / 2, bubble.y - 60 / sc - bh, bw, bh); g.fill(); g.stroke();
        g.fillStyle = '#1b2638'; g.font = `bold ${18 / sc}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(bubble.text, bubble.x, bubble.y - 60 / sc - bh / 2);
      }
      g.restore();
      // camera HUD
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2;
      g.beginPath(); g.arc(W / 2, H / 2, 46, 0, 7); g.stroke();
      [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => { g.beginPath(); g.moveTo(W / 2 + dx * 30, H / 2 + dy * 30); g.lineTo(W / 2 + dx * 60, H / 2 + dy * 60); g.stroke(); });
      if (scanT > 0) { g.strokeStyle = '#3fd28a'; g.lineWidth = 6; g.beginPath(); g.arc(W / 2, H / 2, 52, -Math.PI / 2, -Math.PI / 2 + scanT / 0.8 * Math.PI * 2); g.stroke(); }
      g.fillStyle = 'rgba(5,12,24,.7)'; g.fillRect(12, 12, 230, 28);
      g.fillStyle = '#e9f6ff'; g.font = 'bold 15px "Courier New",monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(`DRONE-1 · ZOOM ${zoom}× · ALT ${zoom === 1 ? 60 : 30}m`, 22, 26);
      if (zoom === 1) { g.fillStyle = 'rgba(5,12,24,.7)'; g.fillRect(12, 46, 300, 24); g.fillStyle = '#ffbd3f'; g.font = 'bold 13px sans-serif'; g.fillText('Zoom in (E / +) to see hair and items.', 20, 58); }
      if (rtb > 0) { g.fillStyle = 'rgba(5,12,24,.75)'; g.fillRect(0, H / 2 - 40, W, 80); g.fillStyle = '#ffbd3f'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('RETURN TO BASE — RELAUNCHING', W / 2, H / 2); }
      if (success && t - success.at > 0.6) { g.fillStyle = 'rgba(5,12,24,.6)'; g.fillRect(0, 90, W, 70); g.fillStyle = '#3fd28a'; g.font = 'bold 38px sans-serif'; g.textAlign = 'center'; g.fillText('INTERCEPTION SUCCESSFUL', W / 2, 126); }
      // mini-map
      const mx = W - MINI_W - 12, my = H - MINI_H - 12, fx = MINI_W / MW, fy = MINI_H / MH;
      g.fillStyle = 'rgba(5,12,24,.85)'; g.fillRect(mx - 4, my - 4, MINI_W + 8, MINI_H + 8);
      g.drawImage(mini, mx, my);
      g.fillStyle = 'rgba(5,12,24,.45)';
      for (let cx = 0; cx < MW / CELL; cx++) for (let cy = 0; cy < MH / CELL; cy++) if (!searched.has(cx + ',' + cy)) g.fillRect(mx + cx * CELL * fx, my + cy * CELL * fy, CELL * fx + 0.5, CELL * fy + 0.5);
      const vw = W / sc, vh = H / sc;
      g.strokeStyle = '#ffbd3f'; g.lineWidth = 1.5; g.strokeRect(mx + (drone.x - vw / 2) * fx, my + (drone.y - vh / 2) * fy, vw * fx, vh * fy);
      g.fillStyle = '#37b7d8'; g.fillRect(mx + van.x * fx - 3, my + van.y * fy - 3, 6, 6);
    }

    if (/[?&]debug\b/.test(location.search)) window.__mg = { mark: () => Object.assign({ visible: seenFromAir(stateOf(markP)) }, stateOf(markP)), drone: () => ({ x: drone.x, y: drone.y }), setDrone: (x, y) => { drone.x = x; drone.y = y; } };
    return { destroy() { if (window.__mg) delete window.__mg; root.remove(); } };
  }

  Minigames.register({
    id: 'drone', kind: 'intercept', title: 'DRONE SURVEILLANCE',
    brief: c => `Fly the drone over the neighbourhood. Use HQ's English clues to find ${c.mark.name}, then send the team van.`,
    mount,
  });
})();
