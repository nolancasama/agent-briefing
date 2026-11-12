/* Scoped minigame runtime. Construct with new Kit(host); destroy on every exit. */
'use strict';
const Kit = (() => {
  const KEY_MAP = {
    ArrowLeft: ['left'], KeyA: ['left'], ArrowRight: ['right'], KeyD: ['right'],
    ArrowUp: ['up'], KeyW: ['up'], ArrowDown: ['down'], KeyS: ['down'],
    Space: ['action', 'space'], KeyE: ['action', 'e', 'zoomIn'], KeyQ: ['q', 'zoomOut'],
    Equal: ['plus', 'zoomIn'], NumpadAdd: ['plus', 'zoomIn'], Minus: ['minus', 'zoomOut'], NumpadSubtract: ['minus', 'zoomOut'],
  };
  class Runtime {
    constructor(host) {
      this.host = host;
      this.keys = Object.fromEntries(['left', 'right', 'up', 'down', 'action', 'space', 'e', 'q', 'plus', 'minus', 'zoomIn', 'zoomOut'].map(k => [k, false]));
      this.paused = false;
      this.dead = false;
      this.listeners = [];
      this.nodes = [];
      this.timers = new Set();
      this.pressed = new Map();
      this.accumulator = 0;
      this.lastTime = null;
      this.stepNumber = 0;
      this.sfx = {};
      const sounds = { blip: 'blip', good: 'chime', bad: 'stamp', tick: 'click', alarm: null, success: 'fanfare', whoosh: 'swoosh', tone: 'tone', noise: 'noise' };
      Object.entries(sounds).forEach(([name, method]) => {
        this.sfx[name] = (...args) => {
          if (this.dead || this.paused) return;
          if (method) Sfx[method](...args);
          else Sfx.tone({ f: 330, f2: 220, t: 0.2, type: 'triangle', v: 0.1 });
        };
      });
      this.on(window, 'keydown', e => {
        if (!KEY_MAP[e.code] || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        if (this.paused) return;
        e.preventDefault();
        if (!this.paused) { this.pressed.set(e.code, KEY_MAP[e.code]); this.syncKeys(); }
      });
      this.on(window, 'keyup', e => { this.pressed.delete(e.code); this.syncKeys(); });
      this.on(window, 'blur', () => this.pause());
      this.on(document, 'visibilitychange', () => { if (document.hidden) this.pause(); });
      this.tick = now => {
        if (this.dead) return;
        const elapsed = this.lastTime === null ? 0 : Math.min(0.25, (now - this.lastTime) / 1000);
        this.lastTime = now;
        if (!this.paused) {
          this.accumulator += elapsed;
          while (this.accumulator >= 1 / 60 && !this.dead && !this.paused) {
            this.accumulator -= 1 / 60;
            this.stepNumber++;
            for (const timer of this.timers) {
              if (timer.created === this.stepNumber) continue;
              timer.left -= 1000 / 60;
              if (timer.left <= 0.001) {
                if (timer.repeat) timer.left += timer.ms;
                else this.timers.delete(timer);
                timer.fn();
                if (this.dead || this.paused) break;
              }
            }
            if (!this.dead && !this.paused && this.update) this.update(1 / 60);
          }
          if (!this.dead && !this.paused && this.render) this.render();
        }
        if (!this.dead) this.raf = requestAnimationFrame(this.tick);
      };
      this.raf = requestAnimationFrame(this.tick);
      if (document.hidden) this.pause();
    }
    on(target, type, fn, opts) {
      if (this.dead) return () => {};
      const listener = e => {
        if (this.dead) return;
        if (this.paused && /^(click|pointer|mouse|touch|key)/.test(type) &&
            !(this.overlay && this.overlay.contains(e.target))) return;
        fn(e);
      };
      target.addEventListener(type, listener, opts);
      const off = () => target.removeEventListener(type, listener, opts);
      this.listeners.push(off);
      return off;
    }
    syncKeys() {
      Object.keys(this.keys).forEach(k => { this.keys[k] = false; });
      if (!this.paused) this.pressed.forEach(names => names.forEach(k => { this.keys[k] = true; }));
    }
    pause() {
      if (this.dead || this.paused) return;
      this.paused = true;
      this.pressed.clear(); this.syncKeys();
      this.accumulator = 0;
      const overlay = document.createElement('div');
      overlay.className = 'mg-pause';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', 'Game paused');
      overlay.innerHTML = '<div class="panel"><h2>PAUSED</h2><button class="btn primary" type="button">RESUME</button></div>';
      this.host.appendChild(overlay);
      this.nodes.push(overlay);
      this.overlay = overlay;
      this.on(overlay.querySelector('button'), 'click', () => this.resume());
      overlay.querySelector('button').focus();
    }
    resume() {
      if (this.dead || document.hidden) return;
      this.paused = false;
      this.lastTime = null;
      this.accumulator = 0;
      if (this.overlay) this.overlay.remove();
      this.overlay = null;
      this.host.focus({ preventScroll: true });
    }
    loop(update, render) { this.update = update; this.render = render; }
    timer(ms, fn, repeat) {
      const timer = { ms: Math.max(1, ms), left: Math.max(1, ms), fn, repeat, created: this.stepNumber };
      if (!this.dead) this.timers.add(timer);
      return { cancel: () => this.timers.delete(timer) };
    }
    after(ms, fn) { return this.timer(ms, fn, false); }
    every(ms, fn) { return this.timer(ms, fn, true); }
    canvas(host, w, h) {
      if (this.surface) throw new Error('Only one canvas per minigame is supported.');
      const canvas = document.createElement('canvas');
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.className = 'mg-canvas';
      canvas.setAttribute('aria-label', 'Operation play area');
      const g = canvas.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      host.appendChild(canvas); this.nodes.push(canvas);
      const resize = () => {
        const ratio = Math.min((host.clientWidth || w) / w, (host.clientHeight || h) / h);
        canvas.style.width = Math.floor(w * ratio) + 'px';
        canvas.style.height = Math.floor(h * ratio) + 'px';
      };
      this.on(window, 'resize', resize); resize();
      this.surface = { canvas, g };
      return this.surface;
    }
    touchPad(host, buttons) {
      const pad = document.createElement('div'); pad.className = 'mg-touch-pad';
      // Accept key strings, {key,label} arrays, or a key→label object.
      const items = Array.isArray(buttons) ? buttons : Object.entries(buttons).map(([key, label]) => ({ key, label }));
      items.forEach(item => {
        const spec = typeof item === 'string' ? { key: item, label: item.toUpperCase() } : item;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'btn secondary'; button.textContent = spec.label || spec.key.toUpperCase();
        button.setAttribute('aria-label', button.textContent);
        const source = button;
        const release = () => { this.pressed.delete(source); this.syncKeys(); button.classList.remove('held'); };
        this.on(button, 'pointerdown', e => {
          e.preventDefault(); if (this.paused) return;
          button.setPointerCapture(e.pointerId);
          this.pressed.set(source, [spec.key]); this.syncKeys(); button.classList.add('held');
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => this.on(button, type, release));
        this.on(button, 'keydown', e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.pressed.set(source, [spec.key]); this.syncKeys(); } });
        this.on(button, 'keyup', release);
        pad.appendChild(button);
      });
      host.appendChild(pad); this.nodes.push(pad);
      return pad;
    }
    drawChild(g, person, x, y, options = {}) { drawPerson(g, person.look || person, person.prop, x, y, options, false); }
    drawAgent(g, av, x, y, options = {}) { drawPerson(g, av, null, x, y, options, true); }
    destroy() {
      if (this.dead) return;
      this.dead = true;
      cancelAnimationFrame(this.raf);
      this.listeners.splice(0).forEach(off => off());
      this.timers.clear(); this.pressed.clear(); this.syncKeys();
      this.nodes.splice(0).forEach(node => node.remove());
      this.update = this.render = null;
    }
  }
  const INK = '#18283d';
  function oval(g, x, y, rx, ry, color) {
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.stroke();
  }
  function poly(g, points, color) {
    g.beginPath(); g.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
    g.closePath(); g.fillStyle = color; g.fill(); g.stroke();
  }
  function limb(g, x, y, xx, yy, color, width) {
    g.lineCap = 'round'; g.lineWidth = width + 2; g.strokeStyle = INK;
    g.beginPath(); g.moveTo(x, y); g.lineTo(xx, yy); g.stroke();
    g.lineWidth = width; g.strokeStyle = color; g.stroke(); g.lineWidth = 1.2; g.strokeStyle = INK;
  }
  function hair(g, look, top) {
    const color = look.hairColor || '#3c2a20', style = look.hair || 'short';
    if (top) {
      if (style === 'spiky') poly(g, [-11,1, -15,-5, -10,-6, -12,-12, -5,-10, -2,-16, 2,-11, 9,-14, 8,-8, 14,-5, 9,0], color);
      else if (style === 'curly') {
        oval(g, 0,-5,10,8,color);
        for (let i=0; i<5; i++) oval(g, -10+i*5,-7-(i%2)*4,4.5,4.5,color);
      } else oval(g, -2, style === 'long' ? -7 : -4, style === 'bob' ? 12 : 10, style === 'long' ? 15 : style === 'bob' ? 11 : 8, color);
      return;
    }
    if (style === 'spiky') poly(g, [-13,-54, -16,-65, -9,-63, -7,-70, -2,-64, 4,-69, 8,-62, 14,-64, 12,-52], color);
    else if (style === 'curly') {
      for (let i = 0; i < 5; i++) oval(g, -10 + i * 5, -60 - (i % 2) * 2, 5, 5, color);
    } else poly(g, [-12,-54, -12,-60, -6,-65, 6,-64, 12,-59, 12,-52, 5,-57, -2,-55, -7,-58], color);
  }
  function drawPerson(g, look, prop, x, y, o, agent) {
    const view = o.view || 'front', pose = o.pose || 'idle', skin = look.skin || '#f6c9a0';
    const shirt = agent ? look.suit || '#22314a' : look.shirt || '#37b7d8';
    const moving = pose === 'run' || pose === 'walk';
    const swing = moving ? Math.sin((o.frame || 0) * Math.PI / 3) : pose === 'dance' ? Math.sin((o.frame || 0) * 0.5) : 0;
    g.save(); g.translate(x, y); g.scale(o.scale || 1, o.scale || 1);
    g.strokeStyle = INK; g.lineWidth = 1.2; g.lineJoin = 'round';
    if (view === 'top') {
      g.rotate(o.facing === 'left' ? -Math.PI / 2 : o.facing === 'right' ? Math.PI / 2 : typeof o.facing === 'number' ? o.facing : 0);
      if (agent && look.outfit === 'coat') poly(g, [-9,5, 9,5, 12,22, 1,19, -1,19, -12,22], shirt);
      if (agent && look.outfit === 'skirt') poly(g, [-7,5, 7,5, 12,18, -12,18], shirt);
      oval(g, 0, 6, agent && look.gender === 'f' ? 12 : 14, 9, shirt);
      if (agent) poly(g, [-3,7, 3,7, 1,14, -1,14], look.tie || '#ffbd3f');
      oval(g, 0, -3, 11, 11, skin); hair(g, look, true);
      if (look.glasses || look.shades) limb(g, -8, 4, 8, 4, look.shades ? INK : '#6d8495', 3);
      if (o.showProp !== false && prop) { g.font = '20px sans-serif'; g.textAlign = 'center'; g.fillText(prop.emoji, 22, 10); }
      g.restore(); return;
    }
    const side = view === 'side';
    if (side && (o.facing === 'left' || o.facing === -1)) g.scale(-1, 1);
    if (pose === 'jump') g.translate(0, -8);
    if (pose === 'duck' || pose === 'hide') { g.translate(0, 0); g.scale(1, 0.7); }
    if (pose === 'dance') g.rotate(swing * 0.12);
    oval(g, 0, 1, 16, 3, 'rgba(0,0,0,.16)');
    if (pose === 'ride') {
      oval(g, -18, -2, 11, 11, '#a8bbca'); oval(g, 20, -2, 11, 11, '#a8bbca');
      poly(g, [-18,-2, -5,-21, 7,-2], '#37b7d8'); limb(g, 7,-2,20,-2,'#37b7d8',2);
    }
    const stride = swing * (pose === 'run' ? 10 : 6);
    const pants = agent ? shirt : '#263f5a';
    limb(g, -5,-22, -6-stride,-5, pants, 8); limb(g, 5,-22, 6+stride,-5, pants, 8);
    oval(g, -6-stride,-3, 6,3, INK); oval(g, 7+stride,-3, 6,3, INK);
    if (agent && (look.outfit === 'coat' || look.outfit === 'skirt')) {
      poly(g, [-10,-37, 10,-37, look.outfit === 'coat' ? 16 : 14,-12, -14,-12], shirt);
    }
    const waist = agent && look.gender === 'f' ? 7 : 10;
    poly(g, [-10,-43, 10,-43, waist,-23, -waist,-23], shirt);
    poly(g, [-8,-41, -4,-41, -5,-25, -9,-25], agent ? '#ffffff18' : '#ffffff35');
    if (agent) {
      poly(g, [-6,-43, 6,-43, 0,-30], '#f4f5f0');
      poly(g, [-2,-42, 2,-42, 3,-32, 0,-29, -3,-32], look.tie || '#ffbd3f');
      limb(g, -8,-24,8,-24,INK,2);
    }
    const wave = pose === 'wave' || pose === 'sing';
    const spread = pose === 'swim' || pose === 'dance';
    limb(g, -10,-40, spread ? -24 : -13 + swing * 7, spread ? -39 : -24, shirt, 7);
    oval(g, spread ? -24 : -13 + swing * 7, spread ? -39 : -23, 3.5,4, skin);
    const armX = wave ? 19 : spread ? 24 : 13 - swing * 7;
    const armY = wave ? -57 : spread ? -39 : -23;
    limb(g, 10,-40,armX,armY,shirt,7); oval(g, armX,armY,3.5,4,skin);
    if (pose === 'sing') { limb(g, 18,-55,10,-51,INK,3); oval(g,9,-51,3,4,'#a8bbca'); }
    // A broad, shaded head and expressive face remain legible at game scale.
    if (look.hair === 'long' || look.hair === 'bob') {
      const bottom = look.hair === 'long' ? -24 : -37;
      poly(g, [-12,-57, -14,bottom, 14,bottom, 13,-57, 6,-64, -6,-64], look.hairColor || '#3c2a20');
    }
    if (!side) { oval(g, -12,-50,3,3.5,skin); oval(g, 12,-50,3,3.5,skin); }
    oval(g, 0,-51,12,13,skin); if (side) oval(g, 11,-50,2.5,3,skin);
    if (side) oval(g,12,-49,3,2.5,skin);
    hair(g,look,false);
    g.strokeStyle = INK;
    if (look.glasses || look.shades) {
      oval(g,side ? 5 : -5,-51,4.5,3.5,look.shades ? INK : '#d6f5ff');
      if (!side) oval(g,5,-51,4.5,3.5,look.shades ? INK : '#d6f5ff');
      limb(g,-2,-51,2,-51,INK,1);
    } else {
      oval(g,side ? 5 : -4,-51,1.3,1.8,INK);
      if (!side) oval(g,4,-51,1.3,1.8,INK);
      if (agent && look.gender === 'f') { limb(g,-6,-53,-4,-53,INK,1); limb(g,4,-53,6,-53,INK,1); }
    }
    g.beginPath();
    g.moveTo(side ? 3 : -4, -45); g.quadraticCurveTo(side ? 7 : 0, pose === 'yuck' ? -49 : -40, side ? 10 : 4,-45); g.stroke();
    if (pose === 'sing') oval(g,1,-44,2,3,INK);
    if (o.showProp !== false && prop) {
      g.fillStyle = '#fff8e8'; g.font = pose === 'read' ? '22px sans-serif' : '20px sans-serif'; g.textAlign = 'center';
      g.fillText(prop.emoji, pose === 'read' || pose === 'hold' ? 0 : 19, pose === 'read' ? -25 : -16);
    }
    g.restore();
  }
  Runtime.create = host => new Runtime(host);
  Runtime.rng = seed => Missions.rng(seed);
  return Runtime;
})();
