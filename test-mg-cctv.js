/* CCTV Surveillance: exactly one person matches every clue, cameras are
   connected, and the mark's itinerary hides 1–3 times, never for long. */
'use strict';
const assert = require('assert');
const DATA = require('./js/data.js');
const CCTV = require('./js/mg/cctv.js');

let scenarios = 0;
for (const mark of DATA.CHARACTERS) {
  for (const pack of DATA.GRAMMAR_PACKS) {
    for (const tier of [1, 2, 3]) {
      for (let seed = 1; seed <= 100; seed++) {
        const scn = CCTV.generate({ mark, pack, tier, seed });
        assert.deepEqual(CCTV.validate(scn), [], `${mark.id} ${pack.id} t${tier} s${seed}`);
        assert.equal(scn.zones.length, { 1: 4, 2: 5, 3: 6 }[tier]);
        assert.equal(scn.people.length, { 1: 8, 2: 12, 3: 16 }[tier]);
        // Position lookup stays inside the cameras and is continuous within a walk.
        const m = scn.people.find(p => p.isMark);
        for (let t = 0; t < 180; t += 7.3) { const s = CCTV.at(m, t); assert.ok(s.zone >= 0 && s.zone < scn.zones.length); }
        if (tier === 3) assert.equal(scn.profile.clues.length, 3, 'tier 3 adds a hair clue');
        scenarios++;
      }
    }
  }
}
// The validator rejects a second person matching every clue.
const scn = CCTV.generate({ mark: DATA.CHARACTERS[0], pack: DATA.GRAMMAR_PACKS[0], tier: 2, seed: 9 });
const decoy = scn.people.find(p => !p.isMark), mark = scn.people.find(p => p.isMark);
decoy.look = Object.assign({}, mark.look); decoy.prop = Object.assign({}, mark.prop);
assert.ok(CCTV.validate(scn).length > 0);
console.log(`CCTV OK — ${scenarios} scenarios validated.`);
