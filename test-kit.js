/* Runtime contract tests with a small DOM/RAF harness; no browser dependency. */
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const Missions = require('./js/missions.js');
const DATA = require('./js/data.js');
class Node {
  constructor(tagName = 'DIV') { this.tagName = tagName; this.listeners = new Map(); this.children = []; this.style = {}; this.clientWidth = 480; this.clientHeight = 270; this.classList = {add(){},remove(){}}; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, values = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn({ target: this, preventDefault(){}, ...values }); }
  appendChild(node) { node.parent = this; this.children.push(node); return node; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  setAttribute() {} focus() {} setPointerCapture() {}
  set innerHTML(html) { this.children = []; if (html.includes('<button')) this.appendChild(new Node('BUTTON')); }
  querySelector() { return this.children[0]; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  getContext() { return g; }
}
const drawing = [];
const g = new Proxy({}, { get: (target, key) => target[key] || ((...args) => drawing.push([key, ...args])), set: (target, key, value) => { target[key] = value; return true; } });
const window = new Node('WINDOW'), document = new Node('DOCUMENT');
document.hidden = false; document.createElement = tag => new Node(tag.toUpperCase()); window.devicePixelRatio = 3;
let rafId = 0, now = 0; const frames = new Map();
const sounds = [];
const context = vm.createContext({ window, document, Missions, Sfx: new Proxy({}, {get: (_, key) => (...args) => sounds.push([key,...args])}), requestAnimationFrame: fn => { frames.set(++rafId, fn); return rafId; }, cancelAnimationFrame: id => frames.delete(id) });
vm.runInContext(fs.readFileSync(require.resolve('./js/mg/kit.js'), 'utf8') + '\nthis.TestKit = Kit;', context);
const advance = n => { for (let i = 0; i < n; i++) { now += 1000 / 60; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); } };
const host = new Node(), kit = new context.TestKit(host);
let updates = 0, renders = 0, timer = 0, repeats = 0;
kit.loop(dt => { assert.equal(dt, 1 / 60); updates++; }, () => renders++);
kit.after(100, () => timer++); const repeating = kit.every(50, () => repeats++);
advance(10); assert.equal(timer, 1); assert.ok(repeats >= 2); assert.ok(updates > 0 && renders > 0);
window.dispatch('keydown', { code: 'KeyA' }); window.dispatch('keydown', { code: 'ArrowLeft' });
window.dispatch('keyup', { code: 'KeyA' }); assert.equal(kit.keys.left, true);
window.dispatch('keyup', { code: 'ArrowLeft' }); assert.equal(kit.keys.left, false);
for (const [code, key] of [['Space','action'],['KeyE','e'],['KeyQ','q'],['Equal','plus'],['Minus','minus']]) {
  window.dispatch('keydown', { code }); assert.equal(kit.keys[key], true); window.dispatch('keyup', { code }); assert.equal(kit.keys[key], false);
}
window.dispatch('keydown', { code: 'KeyW' }); window.dispatch('blur');
assert.equal(kit.paused, true); assert.equal(kit.keys.up, false); assert.ok(host.children.some(c => c.className === 'mg-pause'));
const pausedUpdates = updates, pausedRepeats = repeats;
advance(120); assert.equal(updates, pausedUpdates); assert.equal(repeats, pausedRepeats);
kit.sfx.good(); assert.equal(sounds.length, 0);
kit.resume(); advance(10); assert.ok(updates > pausedUpdates); assert.ok(repeats > pausedRepeats);
let nested = 0;
kit.after(1, () => { nested++; kit.after(1, () => nested++); });
advance(1); assert.equal(nested,1,'nested timers wait for the next logic step');
advance(1); assert.equal(nested,2);
repeating.cancel(); const cancelled = repeats; advance(10); assert.equal(repeats, cancelled);
document.hidden = true; document.dispatch('visibilitychange'); assert.equal(kit.paused, true);
let blocked = 0; kit.on(window,'keydown',() => blocked++);
window.dispatch('keydown',{code:'KeyW'}); assert.equal(blocked,0,'game input is blocked while paused');
kit.resume(); assert.equal(kit.paused, true);
document.hidden = false; kit.resume();
const {canvas} = kit.canvas(host,960,540);
assert.equal(canvas.width,1440); assert.equal(canvas.height,810); assert.equal(canvas.style.width,'480px'); assert.equal(canvas.style.height,'270px');
assert.throws(() => kit.canvas(host,1,1));
const pad = kit.touchPad(host,[{key:'action',label:'SEARCH'},'left']);
pad.children[0].dispatch('pointerdown', {pointerId: 1}); assert.equal(kit.keys.action,true);
pad.children[0].dispatch('pointercancel'); assert.equal(kit.keys.action,false);
for (const char of DATA.CHARACTERS) for (const view of ['front','side','top']) for (const pose of ['run','walk','jump','duck','idle','hide','wave','smile','swim','sing','dance','ride','hold','yuck','read']) {
  kit.drawChild(g,{look:char.look,prop:{emoji:'⚽'}},20,80,{view,pose,frame:2,scale:1,facing:'left'});
}
for (const gender of ['m','f']) for (const outfit of ['suit','coat','skirt']) for (const view of ['side','top']) {
  kit.drawAgent(g,{...DATA.DEFAULT_AVATAR,gender,outfit},20,80,{view,pose:'run',frame:3});
}
assert.ok(drawing.length > 1000);
kit.sfx.good(); assert.equal(sounds[0][0],'chime');
kit.sfx.tone({f:440}); assert.equal(sounds[1][0],'tone');
kit.after(1,() => {throw new Error('destroy leaked a timer');});
kit.destroy(); kit.destroy(); assert.equal(frames.size,0); assert.equal(host.children.length,0);
assert.ok([...window.listeners.values(),...document.listeners.values()].every(set => set.size === 0));
advance(10); kit.sfx.good(); assert.equal(sounds.length,2);
console.log('Kit OK — fixed steps, pause/resume, tracked cleanup, keys, touch, DPR and sprite views/poses.');
