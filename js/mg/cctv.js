/* ============================================================
   INTERCEPT — CCTV Surveillance
   Several cameras look at connected zones of one place. Every
   person walks a seeded itinerary (so the scenario is testable):
   strolling, pausing, visiting shops, slipping behind pillars and
   moving between cameras. HQ's clue sentences describe what the
   mark has (a prop tied to a dossier fact) and wears. The agent
   selects a person and sends the field team, who walk through the
   cameras to the reported spot. A wrong person just waves —
   "Not our target — sorry!" — and the search continues.
   ============================================================ */
(() => {
  'use strict';
  const NODE = typeof module !== 'undefined' && module.exports;
  const D = NODE ? require('../data.js') : DATA;
  const M = NODE ? require('../missions.js') : Missions;

  const ZW = 960, ZH = 480, ROWS = [392, 430, 466], SCALES = [0.95, 1.08, 1.2], PS = 1.6; // PS: on-camera person scale
  const HORIZON = 900; // seconds of itinerary
  const PLACES = {
    station: { name: 'STATION', zones: ['TICKET HALL', 'CONCOURSE', 'PLATFORM GATE', 'SHOPS', 'EXIT HALL', 'BUS DECK'] },
    street:  { name: 'SHOPPING STREET', zones: ['NORTH END', 'BAKERY ROW', 'TOY CORNER', 'CAFE STRIP', 'BOOK LANE', 'SOUTH END'] },
    park:    { name: 'CITY PARK', zones: ['GATE', 'FOUNTAIN', 'PLAYGROUND', 'POND PATH', 'FLOWER GARDEN', 'KIOSKS'] },
    plaza:   { name: 'TOWN PLAZA', zones: ['WEST SIDE', 'STATUE', 'MARKET', 'CLOCK TOWER', 'MUSIC STAGE', 'EAST SIDE'] },
  };
  const OCCLUDERS = { station: ['pillar', 'vending', 'board'], street: ['plant', 'vending', 'sign'], park: ['tree', 'tree', 'hedge'], plaza: ['statue', 'kiosk', 'plant'] };

  /* ---------- pure scenario generation ---------- */
  function generate({ mark, pack, tier = 1, seed = 1, profile }) {
    const random = M.rng(seed);
    const range = (a, b) => a + random() * (b - a);
    const placeIds = Object.keys(PLACES);
    const placeId = placeIds[Math.floor(random() * placeIds.length)];
    const cams = { 1: 4, 2: 5, 3: 6 }[tier];
    profile = profile || (() => {
      const p = M.profile(mark, pack);
      if (tier === 3) p.clues.push(`${p.Pro} has ${p.look.hair === 'bob' ? 'a bob haircut' : p.look.hair + ' hair'}.`);
      return p;
    })();
    const zones = Array.from({ length: cams }, (_, i) => {
      const occluders = [], shops = [];
      const nOcc = 2 + Math.floor(random() * 2);
      for (let k = 0; k < nOcc; k++) occluders.push({ x: Math.round(140 + k * (680 / nOcc) + range(0, 120)), type: OCCLUDERS[placeId][Math.floor(random() * 3)] });
      occluders.forEach(o => { o.w = { pillar: 60, vending: 74, board: 110, plant: 70, sign: 96, tree: 100, hedge: 140, statue: 90, kiosk: 120 }[o.type]; });
      const nShop = placeId === 'park' ? 1 : 2;
      for (let k = 0; k < nShop; k++) shops.push({ x: Math.round(120 + k * 420 + range(0, 200)) });
      return { id: i, name: PLACES[placeId].zones[i], occluders, shops, left: i > 0 ? i - 1 : null, right: i < cams - 1 ? i + 1 : null };
    });
    const crowd = M.makeCrowd(profile, { count: { 1: 8, 2: 12, 3: 16 }[tier], tier, rng: random });
    const hideCount = 1 + Math.floor(random() * Math.min(3, tier + 1));
    const people = crowd.map((person, i) => ({
      ...person, speed: person.isMark ? range(60, 72) : range(42, 70),
      segs: itinerary(random, zones, person.isMark, person.isMark ? hideCount : 0, i % cams),
    }));
    return { placeId, place: PLACES[placeId].name, zones, people, profile, hideCount };
  }

  function itinerary(random, zones, isMark, hides, startZone) {
    const range = (a, b) => a + random() * (b - a);
    const segs = [];
    let t = 0, zone = startZone, x = range(120, 840), row = Math.floor(random() * 3);
    const speed = isMark ? range(62, 74) : range(42, 70);
    const hideAt = Array.from({ length: hides }, (_, i) => 18 + i * 34 + range(0, 18));
    const walk = (x1, facing) => {
      const dur = Math.abs(x1 - x) / speed;
      segs.push({ type: 'walk', zone, x0: x, x1, row, t0: t, t1: t + dur });
      t += dur; x = x1;
    };
    const stay = (type, dur, extra) => { segs.push(Object.assign({ type, zone, x0: x, x1: x, row, t0: t, t1: t + dur }, extra)); t += dur; };
    while (t < HORIZON) {
      if (hideAt.length && t >= hideAt[0]) {
        hideAt.shift();
        const z = zones[zone];
        const spots = z.occluders.map(o => ({ kind: 'occluder', x: o.x + o.w / 2 })).concat(z.shops.map(s => ({ kind: 'shop', x: s.x + 30 })));
        const spot = spots.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[Math.floor(random() * Math.min(2, spots.length))];
        walk(spot.x);
        stay('hidden', range(3, 7), { kind: spot.kind, hide: true });
        continue;
      }
      const r = random();
      const z = zones[zone];
      if (r < 0.16) stay('idle', range(1.5, isMark ? 2.5 : 4.5));
      else if (r < 0.24 && !isMark && z.shops.length) {
        const s = z.shops[Math.floor(random() * z.shops.length)];
        walk(s.x + 30); stay('hidden', range(2, 5), { kind: 'shop' });
      } else if (r < 0.5) {
        const dir = z.left === null ? 1 : z.right === null ? -1 : random() < 0.5 ? -1 : 1;
        walk(dir < 0 ? -40 : ZW + 40);
        zone += dir; x = dir < 0 ? ZW + 40 : -40; row = Math.floor(random() * 3);
      } else walk(range(80, 880));
    }
    return segs;
  }

  function at(person, t) {
    const segs = person.segs;
    t = t % segs[segs.length - 1].t1;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (segs[mid].t1 < t) lo = mid + 1; else hi = mid; }
    const s = segs[lo];
    const k = s.t1 > s.t0 ? Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0))) : 1;
    return {
      zone: s.zone, x: s.x0 + (s.x1 - s.x0) * k, row: s.row,
      visible: s.type !== 'hidden' || s.kind === 'occluder', inside: s.type === 'hidden' && s.kind === 'shop',
      behind: s.type === 'hidden' && s.kind === 'occluder', moving: s.type === 'walk', facing: s.x1 < s.x0 ? 'left' : 'right', seg: s,
    };
  }

  function validate(scn) {
    const errors = [];
    const p = scn.profile;
    errors.push(...M.validateCrowd(p, scn.people));
    scn.zones.forEach((z, i) => {
      if (z.left !== null && scn.zones[z.left].right !== i) errors.push(`zone ${i} link broken`);
      if (z.right !== null && scn.zones[z.right].left !== i) errors.push(`zone ${i} link broken`);
    });
    // every zone reachable from zone 0
    const seen = new Set([0]), queue = [0];
    while (queue.length) { const z = scn.zones[queue.shift()]; [z.left, z.right].forEach(n => { if (n !== null && !seen.has(n)) { seen.add(n); queue.push(n); } }); }
    if (seen.size !== scn.zones.length) errors.push('cameras are not all connected');
    const mark = scn.people.find(x => x.isMark);
    const hides = mark.segs.filter(s => s.hide);
    if (hides.length < 1 || hides.length > 3) errors.push(`mark hides ${hides.length} times`);
    let hidden = 0;
    mark.segs.forEach(s => {
      if (s.type === 'hidden' && s.t0 < 180) hidden += Math.min(s.t1, 180) - s.t0;
      if (s.type === 'hidden' && s.t1 - s.t0 > 8) errors.push('mark stays hidden too long');
      if (s.zone < 0 || s.zone >= scn.zones.length) errors.push('mark leaves the cameras');
    });
    if (hidden / 180 > 0.3) errors.push('mark hidden more than 30% of the time');
    return errors;
  }

  if (NODE) { module.exports = { generate, validate, at, ZW }; return; }

  /* ============================================================
     Browser game
     ============================================================ */
  const W = 960, H = 600, STRIP = 488, TEAM_SPEED = 170;
  const BG = {
    station: { wall: '#b9c4d3', floor: '#d9d4c8', line: '#9aa6b6', accent: '#ffd34d' },
    street:  { wall: '#e8c9a0', floor: '#cfc8bb', line: '#a99f90', accent: '#d94a52' },
    park:    { wall: '#bfe3a8', floor: '#d8c79a', line: '#9db57e', accent: '#4f9a4a' },
    plaza:   { wall: '#dcd3e8', floor: '#e2dccf', line: '#b5ad9e', accent: '#8b6fae' },
  };

  function mount(host, ctx) {
    const { kit, profile } = ctx;
    const scn = generate({ mark: ctx.mark, pack: ctx.pack, tier: ctx.tier, seed: ctx.seed, profile });
    const pal = BG[scn.placeId];
    const timeLimit = ctx.relaxed ? Infinity : { 1: 200, 2: 180, 3: 160 }[ctx.tier];
    let t = 0, cam = 0, selected = null, tag = null, wrongPicks = 0, tags = 0, finished = false, lastProgress = 0;
    let team = { zone: 0, x: 60, moving: false, frame: 0, facing: 'right' }, bubble = null, success = null, hintCam = -1;
    const waved = new Map();

    const root = document.createElement('div');
    root.className = 'mg-cctv';
    root.innerHTML = `
      <div class="mgv-stage" id="mgv-stage"></div>
      <aside class="mgv-panel">
        <div class="mgv-block"><div class="mgv-label">HQ INTEL // FIND THE MARK</div>
          <ul class="mgv-clues">${profile.clues.map(c => `<li>${c}</li>`).join('')}</ul></div>
        <div class="mgv-block"><div class="mgv-label">SELECTED</div><div class="mgv-sel" id="mgv-sel">Click a person on the camera.</div>
          <button type="button" class="btn primary" id="mgv-send" disabled>MARK LOCATED — SEND TEAM</button></div>
        <div class="mgv-block"><div class="mgv-label">FIELD TEAM</div><div class="mgv-team" id="mgv-team">Waiting at CAM 1.</div></div>
        <div class="mgv-time" id="mgv-time"></div>
      </aside>`;
    host.appendChild(root);
    const $ = s => root.querySelector(s);
    const { canvas, g } = kit.canvas($('#mgv-stage'), W, H);

    /* cached zone backgrounds */
    const bgCache = scn.zones.map(z => {
      const c = document.createElement('canvas'); c.width = ZW; c.height = ZH;
      drawZoneBg(c.getContext('2d'), z); return c;
    });
    const thumbs = document.createElement('canvas');
    const TW = Math.floor((W - 8 * (scn.zones.length + 1)) / scn.zones.length), TH = Math.round(TW * ZH / ZW);
    thumbs.width = W; thumbs.height = H - STRIP;

    function drawZoneBg(c, z) {
      c.fillStyle = pal.wall; c.fillRect(0, 0, ZW, 360);
      c.fillStyle = pal.floor; c.fillRect(0, 360, ZW, ZH - 360);
      c.strokeStyle = pal.line; c.lineWidth = 2;
      for (let x = -200; x < ZW + 200; x += 80) { c.beginPath(); c.moveTo(x, 360); c.lineTo(x + (x - ZW / 2) * 0.35, ZH); c.stroke(); }
      for (let y = 380; y < ZH; y += 30) { c.beginPath(); c.moveTo(0, y); c.lineTo(ZW, y); c.stroke(); }
      if (scn.placeId === 'park') {
        c.fillStyle = '#a9dcf5'; c.fillRect(0, 0, ZW, 200);
        c.fillStyle = '#8cc77a'; for (let x = 0; x < ZW; x += 140) { c.beginPath(); c.arc(x + 70, 250, 110, Math.PI, 0); c.fill(); }
      } else {
        c.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 30; x < ZW; x += 190) c.fillRect(x, 60, 120, 90);
        c.fillStyle = pal.accent; c.fillRect(0, 330, ZW, 10);
      }
      z.shops.forEach(s => {
        c.fillStyle = '#2d3b4f'; c.fillRect(s.x, 230, 64, 130);
        c.fillStyle = 'rgba(180,220,255,.45)'; c.fillRect(s.x + 6, 238, 52, 70);
        c.fillStyle = pal.accent; c.fillRect(s.x - 16, 206, 96, 24);
        c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(scn.placeId === 'park' ? 'KIOSK' : 'SHOP', s.x + 32, 218);
      });
      c.fillStyle = 'rgba(5,12,24,.6)'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.fillText(z.name, ZW / 2, 30);
    }
    function drawOccluder(c, o) {
      const base = ZH - 6;
      c.strokeStyle = '#1b2638'; c.lineWidth = 2;
      switch (o.type) {
        case 'pillar': c.fillStyle = '#d7dde6'; c.fillRect(o.x, 120, o.w, base - 120); c.strokeRect(o.x, 120, o.w, base - 120); c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(o.x + o.w - 14, 120, 14, base - 120); break;
        case 'vending': c.fillStyle = '#d94a52'; c.fillRect(o.x, base - 170, o.w, 170); c.strokeRect(o.x, base - 170, o.w, 170); c.fillStyle = '#e9f6ff'; c.fillRect(o.x + 8, base - 158, o.w - 30, 90); break;
        case 'board': case 'sign': c.fillStyle = '#566377'; c.fillRect(o.x + 10, base - 70, 10, 70); c.fillRect(o.x + o.w - 20, base - 70, 10, 70);
          c.fillStyle = o.type === 'board' ? '#1f2b3d' : '#2d6cdf'; c.fillRect(o.x, base - 180, o.w, 112); c.strokeRect(o.x, base - 180, o.w, 112);
          c.fillStyle = o.type === 'board' ? '#ffd34d' : '#fff'; c.font = 'bold 14px "Courier New",monospace'; c.textAlign = 'center';
          c.fillText(o.type === 'board' ? 'DEPARTURES' : 'WELCOME!', o.x + o.w / 2, base - 150); break;
        case 'plant': c.fillStyle = '#7b5a3a'; c.fillRect(o.x + 10, base - 50, o.w - 20, 50); c.fillStyle = '#3f8a44'; c.beginPath(); c.arc(o.x + o.w / 2, base - 100, 52, 0, 7); c.fill(); break;
        case 'tree': c.fillStyle = '#7a5532'; c.fillRect(o.x + o.w / 2 - 10, base - 110, 20, 110); c.fillStyle = '#3f8a44'; c.beginPath(); c.arc(o.x + o.w / 2, base - 150, 66, 0, 7); c.arc(o.x + 10, base - 120, 40, 0, 7); c.arc(o.x + o.w - 10, base - 118, 40, 0, 7); c.fill(); break;
        case 'hedge': c.fillStyle = '#4f9a4a'; c.beginPath(); c.roundRect ? c.roundRect(o.x, base - 120, o.w, 120, 30) : c.rect(o.x, base - 120, o.w, 120); c.fill(); c.stroke(); break;
        case 'statue': c.fillStyle = '#a3a9b3'; c.fillRect(o.x, base - 60, o.w, 60); c.beginPath(); c.arc(o.x + o.w / 2, base - 120, 34, 0, 7); c.fill(); c.fillRect(o.x + 26, base - 110, o.w - 52, 52); break;
        case 'kiosk': c.fillStyle = '#e0a458'; c.fillRect(o.x, base - 150, o.w, 150); c.strokeRect(o.x, base - 150, o.w, 150); c.fillStyle = '#fff'; c.font = 'bold 15px sans-serif'; c.textAlign = 'center'; c.fillText('NEWS', o.x + o.w / 2, base - 120); break;
      }
    }

    /* people & team in a zone */
    function peopleIn(zone) {
      return scn.people.map(p => ({ p, s: at(p, t) })).filter(e => e.s.zone === zone && !e.s.inside && e.s.x > -60 && e.s.x < ZW + 60);
    }
    function freezeState(p) { // people the team is talking to stand still
      if (success && p.isMark) return success.pos;
      const w = waved.get(p.id);
      return w && t < w.until ? w.pos : null;
    }
    function stateOf(p) { return freezeState(p) || at(p, t); }

    function drawZone(c, zone, sx, sy, scale, detail) {
      c.save(); c.translate(sx, sy); c.scale(scale, scale);
      c.beginPath(); c.rect(0, 0, ZW, ZH); c.clip();
      c.drawImage(bgCache[zone], 0, 0);
      const list = scn.people.map(p => ({ p, s: stateOf(p) })).filter(e => e.s.zone === zone && !e.s.inside);
      list.sort((a, b) => a.s.row - b.s.row);
      list.forEach(({ p, s }) => {
        const y = ROWS[s.row];
        if (detail) {
          const waving = (success && p.isMark) || (waved.get(p.id) && t < waved.get(p.id).until);
          kit.drawChild(c, p, s.x, y, { view: 'side', scale: SCALES[s.row] * PS, pose: waving ? 'wave' : s.moving ? 'walk' : 'idle', frame: t * 7, facing: waving ? 'left' : s.facing, showProp: true });
          if (selected === p.id) { c.strokeStyle = '#ffbd3f'; c.lineWidth = 3; c.setLineDash([6, 4]); c.strokeRect(s.x - 22 * PS, y - 88 * PS * SCALES[s.row], 52 * PS, 92 * PS * SCALES[s.row]); c.setLineDash([]); }
          if (tag && tag.id === p.id) { c.fillStyle = '#ffbd3f'; c.font = 'bold 18px sans-serif'; c.textAlign = 'center'; c.fillText('▼', s.x + 4, y - 96 * PS * SCALES[s.row]); }
        } else {
          c.fillStyle = p.look.shirt; c.fillRect(s.x - 10, y - 70, 20, 40);
          c.fillStyle = p.look.skin; c.beginPath(); c.arc(s.x, y - 82, 11, 0, 7); c.fill();
        }
      });
      if (team.zone === zone) {
        [0, -34].forEach((dx, i) => kit.drawAgent(c, { gender: i ? 'f' : 'm', skin: i ? '#c68863' : '#f6c9a0', hair: i ? 'bob' : 'short', hairColor: '#1d1d1d', suit: '#22314a', tie: '#e0b23a', shades: true, outfit: 'suit' },
          team.x + dx, ROWS[2] + 6, { view: 'side', scale: 1.35, pose: team.moving ? 'walk' : 'idle', frame: team.frame, facing: team.facing }));
      }
      scn.zones[zone].occluders.forEach(o => drawOccluder(c, o));
      c.restore();
    }

    function renderThumbs() {
      const tg = thumbs.getContext('2d');
      tg.clearRect(0, 0, thumbs.width, thumbs.height);
      scn.zones.forEach((z, i) => {
        const x = 8 + i * (TW + 8), y = 10;
        drawZone(tg, i, x, y, TW / ZW, false);
        const hint = hintCam === i && Math.floor(t * 3) % 2 === 0;
        tg.lineWidth = i === cam ? 4 : hint ? 4 : 1.5; tg.strokeStyle = i === cam ? '#ffbd3f' : hint ? '#3fd28a' : 'rgba(55,183,216,.6)';
        tg.strokeRect(x, y, TW, TH);
        tg.fillStyle = 'rgba(5,12,24,.75)'; tg.fillRect(x, y, 52, 16);
        tg.fillStyle = '#e9f6ff'; tg.font = 'bold 11px "Courier New",monospace'; tg.textAlign = 'left'; tg.textBaseline = 'middle'; tg.fillText(`CAM ${i + 1}`, x + 4, y + 8);
        if (team.zone === i) { tg.fillStyle = '#ffbd3f'; tg.fillText('TEAM', x + TW - 34, y + 8); }
      });
    }
    let thumbClock = 1;

    function setTeamText(text) { $('#mgv-team').textContent = text; }
    function select(id) {
      selected = id;
      const p = scn.people.find(x => x.id === id);
      $('#mgv-sel').innerHTML = `<span class="mgv-swatch" style="background:${p.look.shirt}"></span><span class="mgv-prop">${p.prop ? p.prop.emoji : ''}</span><span>on CAM ${cam + 1}</span>`;
      $('#mgv-send').disabled = false;
      kit.sfx.blip();
    }
    function send() {
      if (!selected || finished || success) return;
      const p = scn.people.find(x => x.id === selected), s = stateOf(p);
      if (s.zone !== cam) { $('#mgv-sel').textContent = 'That person left this camera. Select again.'; return; }
      tag = { id: p.id, zone: s.zone, x: s.x }; tags++; lastProgress = t;
      team.moving = true;
      setTeamText(`On the way to CAM ${tag.zone + 1}…`);
      kit.sfx.tone({ f: 520, f2: 780, t: 0.18, type: 'triangle', v: 0.06 });
      bubble = null;
    }

    function contact(p) {
      const s = stateOf(p);
      if (p.isMark) {
        success = { pos: Object.assign({}, s, { moving: false }), at: t };
        team.moving = false; tag = null;
        bubble = { zone: s.zone, x: s.x, text: 'You caught me!', until: t + 3 };
        setTeamText('Mark stopped. INTERCEPTION SUCCESSFUL!');
        kit.sfx.success();
        $('#mgv-send').disabled = true;
        kit.after(2800, finish);
      } else {
        wrongPicks++;
        waved.set(p.id, { until: t + 2.6, pos: Object.assign({}, s, { moving: false }) });
        bubble = { zone: s.zone, x: s.x, text: 'Not our target — sorry!', until: t + 2.6 };
        setTeamText('Wrong person. Keep searching!');
        team.moving = false; tag = null; selected = null;
        $('#mgv-sel').textContent = 'Check the HQ clues again.';
        $('#mgv-send').disabled = true;
        kit.sfx.tone({ f: 330, f2: 260, t: 0.25, type: 'triangle', v: 0.06 });
      }
    }

    function updateTeam(dt) {
      team.frame += dt * (team.moving ? 8 : 0);
      if (!tag || !team.moving) return;
      const p = scn.people.find(x => x.id === tag.id), s = stateOf(p);
      // Contact whenever the team is right next to the tagged person.
      if (s.zone === team.zone && !s.inside && Math.abs(s.x - team.x) < 46) { contact(p); return; }
      let goal;
      if (team.zone !== tag.zone) goal = tag.zone > team.zone ? ZW + 30 : -30;
      else goal = tag.x;
      const dir = Math.sign(goal - team.x);
      team.facing = dir < 0 ? 'left' : 'right';
      team.x += dir * Math.min(Math.abs(goal - team.x), TEAM_SPEED * dt);
      if (team.zone !== tag.zone && Math.abs(team.x - goal) < 1) { team.zone += dir; team.x = dir > 0 ? -30 : ZW + 30; setTeamText(`On the way… now at CAM ${team.zone + 1}`); }
      else if (team.zone === tag.zone && Math.abs(team.x - goal) < 2) {
        team.moving = false;
        if (s.zone === tag.zone && s.behind && Math.abs(s.x - team.x) < 140) { contact(p); return; } // found behind a pillar
        setTeamText('TARGET MOVED — UPDATE POSITION');
        $('#mgv-team').classList.add('alert'); kit.after(1500, () => $('#mgv-team').classList.remove('alert'));
        kit.sfx.bad();
      }
    }

    function finish() {
      if (finished) return; finished = true;
      const score = Math.max(40, Math.min(100, 100 - wrongPicks * 15 - Math.max(0, tags - 2) * 4 - Math.max(0, Math.floor((t - 60) / 15)) * 2));
      const markHides = scn.people.find(p => p.isMark).segs.filter(s => s.hide && s.t0 < t).length;
      const stats = { wrongPicks, tags, time: Math.round(t), place: scn.place };
      if (success) ctx.done({ success: true, outcome: 'caught', score, wrongPicks, markHides, stats });
      else ctx.done({ success: false, outcome: 'escaped', score: Math.min(score, 60), wrongPicks, markHides, stats });
    }

    /* input */
    function toWorld(e) {
      const b = canvas.getBoundingClientRect();
      return { x: (e.clientX - b.left) / b.width * W, y: (e.clientY - b.top) / b.height * H };
    }
    kit.on(canvas, 'pointerdown', e => {
      if (finished || success) return;
      const { x, y } = toWorld(e);
      if (y > STRIP) { // thumbnail strip
        const i = Math.floor((x - 4) / (TW + 8));
        if (i >= 0 && i < scn.zones.length) { cam = i; kit.sfx.tone({ f: 900, t: 0.04, type: 'square', v: 0.04 }); }
        return;
      }
      const wx = x * ZW / W, wy = y * ZH / (STRIP - 8);
      let best = null, bestD = 1e9;
      scn.people.forEach(p => {
        const s = stateOf(p);
        if (s.zone !== cam || s.inside) return;
        const sc = SCALES[s.row] * PS, top = ROWS[s.row] - 84 * sc;
        if (wx > s.x - 22 * sc && wx < s.x + 30 * sc && wy > top && wy < ROWS[s.row] + 4) {
          const d = Math.abs(wx - s.x) + (2 - s.row) * 5; // nearer rows win
          if (d < bestD) { bestD = d; best = p; }
        }
      });
      if (best) select(best.id);
    });
    kit.on($('#mgv-send'), 'click', send);
    kit.on(window, 'keydown', e => {
      const n = Number(e.key);
      if (n >= 1 && n <= scn.zones.length) cam = n - 1;
      else if (e.key === 'ArrowRight') cam = (cam + 1) % scn.zones.length;
      else if (e.key === 'ArrowLeft') cam = (cam + scn.zones.length - 1) % scn.zones.length;
      else if (e.key === 'Enter') send();
    });

    kit.loop(dt => {
      if (finished) return;
      t += dt;
      updateTeam(dt);
      thumbClock += dt;
      // Hint: after a while without progress, blink the camera that shows the mark.
      const markPos = at(scn.people.find(p => p.isMark), t);
      hintCam = t - lastProgress > 25 && markPos.visible ? markPos.zone : -1;
      if (!success && t > timeLimit) finish();
      const left = timeLimit - t;
      $('#mgv-time').textContent = timeLimit === Infinity ? 'RELAXED MODE · NO TIME LIMIT' : `TIME ${Math.max(0, Math.ceil(left))}s`;
      $('#mgv-time').classList.toggle('low', left < 20);
    }, () => {
      g.fillStyle = '#050b14'; g.fillRect(0, 0, W, H);
      drawZone(g, cam, 0, 0, W / ZW, true);
      // camera overlay
      g.fillStyle = 'rgba(0,20,30,.06)'; for (let y = 0; y < STRIP - 8; y += 4) g.fillRect(0, y, W, 1);
      g.fillStyle = 'rgba(5,12,24,.7)'; g.fillRect(10, 10, 270, 30);
      g.fillStyle = '#ff5d5d'; g.beginPath(); g.arc(26, 25, 6, 0, 7); g.fill();
      g.fillStyle = '#e9f6ff'; g.font = 'bold 16px "Courier New",monospace'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(`CAM ${cam + 1} · ${scn.zones[cam].name}`, 40, 25);
      const clock = new Date(Date.UTC(2026, 0, 1, 14, 0, Math.floor(t))).toISOString().slice(11, 19);
      g.textAlign = 'right'; g.fillText(clock, W - 16, 25);
      if (bubble && bubble.zone === cam && t < bubble.until) {
        const bx = Math.min(W - 250, Math.max(10, bubble.x * W / ZW - 110));
        g.fillStyle = '#fff'; g.strokeStyle = '#1b2638'; g.lineWidth = 3;
        g.beginPath(); g.roundRect ? g.roundRect(bx, 140, 240, 46, 12) : g.rect(bx, 140, 240, 46); g.fill(); g.stroke();
        g.fillStyle = '#1b2638'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.fillText(bubble.text, bx + 120, 163);
      }
      if (success && t - success.at > 0.6) {
        g.fillStyle = 'rgba(5,12,24,.6)'; g.fillRect(0, 200, W, 80);
        g.fillStyle = '#3fd28a'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText('INTERCEPTION SUCCESSFUL', W / 2, 240);
      }
      if (thumbClock > 0.2) { renderThumbs(); thumbClock = 0; }
      g.drawImage(thumbs, 0, STRIP);
    });

    renderThumbs();
    // Test hook for automated playthroughs; only present with ?debug in the URL.
    if (/[?&]debug\b/.test(location.search)) window.__mg = { mark: () => { const m = scn.people.find(p => p.isMark); return Object.assign({ id: m.id }, stateOf(m)); }, decoy: () => { const d = scn.people.find(p => !p.isMark && stateOf(p).zone === cam && !stateOf(p).inside); return d ? Object.assign({ id: d.id }, stateOf(d)) : null; }, ROWS, ZW, W, ZH, STRIP };
    return { destroy() { if (window.__mg) delete window.__mg; root.remove(); } };
  }

  Minigames.register({
    id: 'cctv', kind: 'intercept', title: 'CCTV SURVEILLANCE',
    brief: c => `${c.mark.name} is somewhere in the crowd. Use the cameras and HQ's English clues to find ${c.profile.pro === 'he' ? 'him' : 'her'}, then send the team.`,
    mount,
  });
})();
