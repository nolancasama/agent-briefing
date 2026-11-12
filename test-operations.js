/* Flow and once-only reward tests. Kit behavior is exercised in test-kit.js. */
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const DATA = require('./js/data.js');
const Missions = require('./js/missions.js');
const Minigames = require('./js/mg/registry.js');
const elements = new Map();
class Element {
  constructor(id) { this.id = id; this.classList = {add(){},remove(){},contains(){return false;},toggle(){}}; this.dataset = {}; this.style = {}; }
  set innerHTML(html) {
    this.html = html;
    if (this.id === 'app') { elements.clear(); elements.set('app',this); }
    for (const [,id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id,new Element(id));
  }
  get innerHTML() { return this.html; }
  focus() {} remove() { elements.delete(this.id); }
  appendChild(child) { if (!this.children) this.children=[]; this.children.push(child); } setAttribute() {}
}
const app = new Element('app'); elements.set('app',app);
const document = { querySelector: s => s.startsWith('#') ? elements.get(s.slice(1)) || null : null, querySelectorAll: () => [], addEventListener(){}, createElement: () => new Element(), body: new Element(), contains: () => true };
const storage = new Map();
const kits = [];
class FakeKit {
  constructor(host) { this.host=host; this.callbacks=[]; this.dead=false; kits.push(this); }
  on(target,type,fn) { target['on'+type]=fn; }
  after(ms,fn) { this.callbacks.push({ms,fn}); }
  destroy() { this.dead=true; this.callbacks=[]; }
  pause() {}
}
const mounted = [];
for (const id of ['photo','typing','password','chase','cctv','drone']) Minigames.register({
  id,kind:['photo','typing','password'].includes(id)?'intel':'intercept',title:id.toUpperCase(),
  brief: ctx => `${ctx.mark.name}: find the clues.`,
  mount(host,ctx) { const attempt={id,ctx,destroyed:0}; mounted.push(attempt); return {destroy(){attempt.destroyed++;}}; },
});
let micReleases = 0;
const context = vm.createContext({
  DATA,Missions,Minigames,Kit:FakeKit,document,URLSearchParams,
  window:{ location:{search:'?intel=password&intercept=drone&seed=123'}, addEventListener(){} },
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  Recorder:{stopPlayback(){},release(){micReleases++;}},
  Sfx:new Proxy({}, {get:()=>()=>{}}), Icons:new Proxy({}, {get:()=>()=>''}),
  Art:new Proxy({}, {get:()=>()=>'<svg></svg>'}),
  Evaluate:{evaluateMission:()=>({rank:null})},
  setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},requestAnimationFrame:()=>1,
});
// Parse all owned browser scripts, including the E2E driver, without running it.
for (const file of ['js/data.js','js/missions.js','js/mg/kit.js','js/mg/registry.js','js/mg/stub.js','js/game.js','test-e2e.js']) new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
vm.runInContext(fs.readFileSync('js/game.js','utf8')+'\nthis.state = App;',context);
const run=code=>vm.runInContext(code,context);
const click=id=>{ const button=elements.get(id); assert.ok(button,`${id} rendered`); button.onclick(); };
const state=context.state;
run('beginOperation(DATA.CHARACTERS[0])');
assert.equal(state.operation.games.intel,'password'); assert.equal(state.operation.games.intercept,'drone'); assert.equal(state.operation.seed,123);
assert.match(app.innerHTML,/Locate the subject/);
click('btn-assignment'); click('btn-mg-start');
let attempt=mounted.at(-1);
assert.equal(attempt.id,'password'); assert.equal(attempt.ctx.seed,123); assert.equal(attempt.ctx.mark.id,'ben');
assert.equal(typeof attempt.ctx.rng,'function'); assert.equal(attempt.ctx.tier,1);
attempt.ctx.done({success:true,score:90,revealed:['likes','can','invalid'],stats:{}});
assert.equal(attempt.destroyed,1); assert.equal(kits.at(-1).dead,true);
assert.deepEqual(Array.from(state.operation.intel.revealed),['likes','can']);
attempt.ctx.done({success:true,score:100,revealed:[]});
assert.equal(state.operation.intel.score,90,'duplicate completion ignored');
// The recording behavior is unchanged. Supply its completed output at this boundary.
run('App.clips = [0,1,2,3].map(i => ({text: "Report " + i, eval: {}})); App.briefing = {rank:null}; App.save.points = 100;');
const clips=state.clips;
run('showGameIntro("intercept")'); click('btn-mg-start');
attempt=mounted.at(-1); const firstSeed=attempt.ctx.seed;
attempt.ctx.done({success:false,outcome:'escaped',score:20,wrongPicks:1,markHides:2,stats:{}});
assert.ok(elements.has('escape-screen')); assert.equal(attempt.destroyed,1); assert.equal(state.save.ops.escapes,1);
assert.equal(state.save.ops.badges.ESCAPE_SPECIALIST,1); assert.equal(state.save.ops.badges.INTEL_AGENT,1);
assert.equal(state.save.points,100,'escape never awards interception bonus');
click('btn-retry-intercept'); click('btn-mg-start');
attempt=mounted.at(-1);
assert.notEqual(attempt.ctx.seed,firstSeed); assert.equal(state.clips,clips);
attempt.ctx.done({success:true,outcome:'caught',score:95,wrongPicks:0,markHides:2,stats:{}});
assert.equal(attempt.destroyed,1); click('btn-ending');
assert.match(app.innerHTML,/data-reveal="true"/); assert.equal(state.save.ops.revealSeen,false);
click('btn-skip-ending'); assert.ok(elements.has('badge-ceremony')); assert.equal(state.save.ops.revealSeen,true);
assert.equal(state.save.ops.badges.INTEL_AGENT,1,'retry does not duplicate a badge');
assert.equal(state.save.ops.badges.DRONE_PILOT,1);
assert.ok(state.operation.badges.mark.includes('ESCAPE_SPECIALIST'));
for (let i=0; i<15 && elements.has('btn-next-badge'); i++) click('btn-next-badge');
assert.ok(elements.has('operation-report')); assert.equal(state.save.points,150);
assert.equal(state.save.ops.completed,1); assert.equal(state.save.ops.intercepts,1); assert.equal(state.save.ops.byMark.ben,1);
assert.equal(state.save.ops.best.password,90); assert.equal(state.save.ops.best.drone,95);
const once=JSON.stringify(state.save);
run('showScorePanel(document.querySelector("#operation-report"))');
run('finishOperation()');
assert.equal(JSON.stringify(state.save),once,'AAR and finalization are idempotent');
run('beginOperation(DATA.CHARACTERS[1])'); assert.match(app.innerHTML,/New training challenge: find Agent PINK PANDA/);
run('App.operation.intel = {success:true,score:80,revealed:[]}; App.clips = [1,2,3,4]; App.operation.intercept = {success:true,outcome:"caught",score:80,wrongPicks:1,markHides:0}; showEnding();');
assert.match(app.innerHTML,/data-reveal="false"/); assert.match(app.innerHTML,/TRAINING CASE CLOSED/);
// A stale reveal callback cannot enter a ceremony after the player leaves.
const stale=kits.at(-1).callbacks.at(-1).fn;
run('showArchive()'); stale(); assert.equal(app.className,'screen-archive');
run('beginOperation(DATA.CHARACTERS[2]); App.operation.intel = {success:true,score:80,revealed:[]}; App.clips = [1,2,3,4]; App.briefing = {rank:null}; App.save.points += 100; finishOperation();');
assert.equal(state.save.points,270,'ending without an interception issues only the mission bonus');
assert.equal(state.save.ops.completed,2); assert.equal(state.save.ops.intercepts,1);
run('showArchive(); App.save.ops.mode = "briefing";');
assert.equal(state.operation,null,'archive clears full-operation context for briefing-only flow');
assert.ok(micReleases >= 12,'screen exits keep releasing the microphone');
// Exercise the actual stand-ins and verify their conditional registration boundary.
const standIns = vm.createContext({document});
vm.runInContext(fs.readFileSync('js/mg/registry.js','utf8')+'\n'+fs.readFileSync('js/mg/stub.js','utf8')+'\nthis.registry = Minigames;',standIns);
assert.equal(standIns.registry.list().length,6);
const walk=node=>[node,...(node.children || []).flatMap(walk)];
for (const def of standIns.registry.list()) {
  const host=new Element(); let result;
  const p=Missions.profile(DATA.CHARACTERS[0],DATA.GRAMMAR_PACKS[0]);
  const instance=def.mount(host,{profile:p,kit:{on(target,type,fn){target['on'+type]=fn;}},done:r=>{result=r;}});
  const buttons=walk(host).filter(node=>node.dataset.stub);
  if (def.kind === 'intel') {
    buttons[0].onclick(); assert.equal(result.success,true); assert.deepEqual(Array.from(result.revealed),['personality','likes','can']);
    assert.ok(walk(host).some(node=>node.textContent === 'He likes soccer.'));
  } else {
    buttons.find(b=>b.dataset.stub === 'escaped').onclick(); assert.equal(result.success,false); assert.equal(result.outcome,'escaped');
    buttons.find(b=>b.dataset.stub === 'caught').onclick(); assert.equal(result.success,true); assert.equal(result.outcome,'caught');
  }
  instance.destroy();
}
const realPhoto={id:'photo',kind:'intel',title:'REAL PHOTO',brief:()=>'',mount:()=>({destroy(){}})};
standIns.registry.register(realPhoto);
vm.runInContext(fs.readFileSync('js/mg/stub.js','utf8'),standIns);
assert.equal(standIns.registry.get('photo'),realPhoto,'stand-ins preserve existing implementations');
const index=fs.readFileSync('index.html','utf8');
const scripts=[...index.matchAll(/<script src="([^"]+)"/g)].map(match=>match[1]);
assert.deepEqual(scripts,['js/data.js','js/evaluate.js','js/missions.js','assets/manifest.js','js/art.js','js/sfx.js','js/recorder.js','js/icons.js','js/mg/kit.js','js/mg/registry.js',...['photo','typing','password','chase','cctv','drone','stub'].map(id=>`js/mg/${id}.js`),'js/game.js']);
console.log('Operations OK — mount/destroy, once-only results, retry clips/seed, reveal cancellation, badges, report and reward guards.');
