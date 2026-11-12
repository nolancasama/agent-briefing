'use strict';
const assert = require('assert/strict');
const DATA = require('./js/data.js');
const Missions = require('./js/missions.js');
let crowds = 0;
for (const char of DATA.CHARACTERS) {
  for (const [key, fact] of Object.entries(char.facts)) {
    const visual = DATA.FACT_VISUALS[fact.value];
    assert.ok(visual && typeof visual.emoji === 'string', `${char.id}/${key} has a visual`);
    assert.equal(typeof visual.carry, 'boolean');
    if (['likes','can'].includes(key)) assert.ok(visual.place.emoji && visual.place.word);
  }
  for (const pack of DATA.GRAMMAR_PACKS) {
    const p = Missions.profile(char, pack);
    assert.equal(p.markId, char.id);
    assert.equal(p.name, char.name);
    assert.equal(p.pro, char.gender === 'f' ? 'she' : 'he');
    assert.equal(p.Pro, char.gender === 'f' ? 'She' : 'He');
    assert.deepEqual(p.look, char.look);
    assert.deepEqual(p.packFacts.map(f => f.key), pack.id === 'L1' ? ['personality','likes','can'] : ['has','wants','dislikes']);
    p.packFacts.forEach(f => {
      assert.equal(f.value, char.facts[f.key].value);
      assert.equal(f.sentence, pack.steps.find(s => s.fact(char) === f.value).answer(char));
    });
    assert.equal(p.prop.factKey, pack.id === 'L1' ? 'likes' : 'has');
    assert.ok(DATA.FACT_VISUALS[p.prop.value].carry);
    assert.equal(p.clues[0], p.packFacts.find(f => f.key === p.prop.factKey).sentence);
    assert.equal(p.clues[1], `${p.Pro} has a ${p.appearance.shirtWord} shirt.`);
    for (let tier = 1; tier <= 3; tier++) {
      for (let seed = 0; seed < 200; seed++) {
        const before = JSON.stringify(p);
        const crowd = Missions.makeCrowd(p, { count: 4 + tier * 4, tier, rng: Missions.rng(seed) });
        assert.equal(JSON.stringify(p), before, 'generator preserves profile');
        assert.deepEqual(Missions.validateCrowd(p, crowd), [], `${char.id}/${pack.id}/tier${tier}/seed${seed}`);
        assert.equal(crowd.length, 4 + tier * 4);
        assert.deepEqual(crowd, Missions.makeCrowd(p, { count: 4 + tier * 4, tier, rng: Missions.rng(seed) }));
        const decoys = crowd.filter(c => !c.isMark);
        decoys.forEach(c => assert.ok(c.look.shirt !== p.look.shirt || !c.prop || c.prop.emoji !== p.prop.emoji));
        if (tier >= 2) {
          assert.ok(decoys.some(c => c.look.shirt === p.look.shirt));
          assert.ok(decoys.some(c => c.prop.emoji === p.prop.emoji));
        }
        if (tier === 3) {
          const tier3 = { ...p, clues: [...p.clues, `${p.Pro} has ${p.look.hair} hair.`] };
          assert.deepEqual(Missions.validateCrowd(tier3, crowd), []);
        }
        crowds++;
      }
    }
  }
}
const profile = Missions.profile(DATA.CHARACTERS[0], DATA.GRAMMAR_PACKS[0]);
const broken = Missions.makeCrowd(profile, { rng: Missions.rng(1) });
const decoy = broken.find(p => !p.isMark);
decoy.look = { ...profile.look }; decoy.prop = { ...profile.prop };
assert.ok(Missions.validateCrowd(profile, broken).length, 'duplicate visual match rejected');
decoy.isMark = true;
assert.ok(Missions.validateCrowd(profile, broken).some(e => /one mark/.test(e)));
assert.ok(Missions.validateCrowd(profile, []).length);

const answers = DATA.PASSWORD_BANK.map(e => e.answer);
assert.equal(new Set(answers).size, answers.length, 'password answers never collide');
assert.equal(new Set(DATA.PASSWORD_BANK.map(e => e.factValue)).size, answers.length);
assert.equal(new Set(DATA.PASSWORD_BANK.map(e => e.clues.at(-1))).size, answers.length, 'final clues differ');
const factValues = new Set(DATA.CHARACTERS.flatMap(c => ['has','likes','wants','dislikes'].map(k => c.facts[k].value)));
factValues.forEach(value => assert.ok(DATA.PASSWORD_BANK.some(e => e.factValue === value), value));
assert.ok(DATA.PASSWORD_BANK.filter(e => !factValues.has(e.factValue)).length >= 12);
DATA.PASSWORD_BANK.forEach(e => { assert.match(e.answer, /^[A-Z]+$/); assert.ok(e.clues.length >= 3 && e.clues.every(c => c.endsWith('.'))); });
assert.ok(DATA.INTEL_VOCAB[1].every(w => /^[a-z]{3,5}$/.test(w)));
assert.ok(DATA.INTEL_VOCAB[2].every(w => /^[a-z]{4,7}$/.test(w)));
assert.ok(DATA.INTEL_VOCAB[3].some(w => w.includes(' ')));
assert.equal(DATA.INTERCEPT_BONUS, 30);

const oldSave = { points: 120, avatar: { name: 'NOVA' }, closed: { ben: { L1: true } }, packId: 'L2', muted: true };
const migrated = Missions.migrateSave(oldSave);
assert.equal(oldSave.ops, undefined, 'migration does not mutate the input');
assert.equal(migrated.points, 120); assert.deepEqual(migrated.closed, oldSave.closed); assert.deepEqual(migrated.avatar, oldSave.avatar);
assert.equal(migrated.ops.mode, 'full'); assert.equal(migrated.ops.relaxed, false); assert.equal(migrated.ops.revealSeen, false);
assert.deepEqual(migrated.ops.setup, { intel: 'auto', intercept: 'auto' });
assert.deepEqual(migrated.ops.badges, {}); assert.equal(migrated.ops.completed, 0);
const partial = Missions.migrateSave({ ops: { mode: 'briefing', relaxed: true, setup: { intel: 'typing' }, badges: { INTEL_AGENT: 2, UNKNOWN: 8 }, best: { typing: 80 } } });
assert.equal(partial.ops.mode, 'briefing'); assert.equal(partial.ops.relaxed, true);
assert.deepEqual(partial.ops.badges, { INTEL_AGENT: 2 }); assert.equal(partial.ops.best.typing, 80);
assert.doesNotThrow(() => Missions.migrateSave({ ops: { badges: null, setup: [], lastPlayed: 'bad' }, closed: null }));
assert.deepEqual(Missions.migrateSave(null).ops, Missions.migrateSave({}).ops);
assert.deepEqual([0,1,2,4,5,10].map(completed => Missions.tierFor({ ops: { completed } })), [1,1,2,2,3,3]);
const rotation = Missions.migrateSave({});
const seen = { intel: new Set(), intercept: new Set() };
for (let i = 1; i <= 3; i++) {
  const pair = Missions.pickGames(rotation, {}, Missions.rng(i));
  Object.entries(pair).forEach(([kind, id]) => { seen[kind].add(id); rotation.ops.lastPlayed[id] = i; });
}
assert.equal(seen.intel.size, 3); assert.equal(seen.intercept.size, 3);
assert.ok(Object.values(Missions.pickGames(rotation, {}, () => 0)).every(id => rotation.ops.lastPlayed[id] === 1));
const configured = Missions.migrateSave({ ops: { setup: { intel: 'password', intercept: 'drone' } } });
assert.deepEqual(Missions.pickGames(configured, {}, () => 0), { intel: 'password', intercept: 'drone' });
const params = Object.fromEntries(new URLSearchParams('intel=photo&intercept=cctv&seed=123'));
assert.deepEqual(Missions.pickGames(configured, params, Missions.rng(params.seed)), { intel: 'photo', intercept: 'cctv' });
assert.deepEqual(Missions.pickGames(configured, { intel: 'nonsense', intercept: 'CHASE' }), { intel: 'password', intercept: 'chase' });
assert.deepEqual(Missions.pickGames(configured, { intel: 'auto', intercept: 'auto' }, () => 0), { intel: 'photo', intercept: 'chase' });
assert.deepEqual(Array.from({length: 10}, Missions.rng(123)), Array.from({length: 10}, Missions.rng(123)));
const random = Missions.rng(4); for (let i = 0; i < 1000; i++) { const n = random(); assert.ok(n >= 0 && n < 1); }

for (const [intercept, specific] of Object.entries({ chase: 'PURSUIT_SPECIALIST', cctv: 'SURVEILLANCE_SPECIALIST', drone: 'DRONE_PILOT' })) {
  for (const outcome of ['caught','escaped']) {
    const badges = Missions.badgesFor({ intel: {success: true}, clips: 4, intercept, success: outcome === 'caught', outcome, wrongPicks: 0, markHides: 2 });
    assert.ok(badges.player.includes('INTEL_AGENT')); assert.ok(badges.player.includes('CLEAR_REPORTER'));
    assert.equal(badges.player.includes(specific), outcome === 'caught');
    assert.equal(badges.player.includes('MISSION_COMPLETE'), outcome === 'caught');
    assert.equal(badges.player.includes('SHARP_EYE'), outcome === 'caught');
    assert.ok(badges.mark.includes('UNDERCOVER_AGENT')); assert.ok(badges.mark.includes('STEALTH_TRAINEE'));
    assert.equal(badges.mark.includes('MASTER_OF_DISGUISE'), intercept !== 'chase');
    assert.equal(badges.mark.includes('ESCAPE_SPECIALIST'), outcome === 'escaped');
    [...badges.player, ...badges.mark].forEach(id => assert.ok(Missions.BADGES[id]));
  }
}
const imperfect = Missions.badgesFor({ intelComplete: false, clipsSent: 3, intercept: 'cctv', outcome: 'caught', wrongPicks: 1, markHides: 1 });
assert.ok(!imperfect.player.includes('SHARP_EYE') && !imperfect.player.includes('CLEAR_REPORTER') && !imperfect.player.includes('INTEL_AGENT'));
assert.ok(!imperfect.mark.includes('STEALTH_TRAINEE'));
console.log(`Missions OK — 12 profiles, ${crowds} seeded crowds, data coverage, selection, badges and save migration.`);
