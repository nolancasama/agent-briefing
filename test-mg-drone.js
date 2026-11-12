/* Drone Surveillance: the town is fixed, exactly one person matches every
   clue, the road graph reaches everywhere from base, and the mark hides
   1–3 times, never longer than the limit, always on the paths. */
'use strict';
const assert = require('assert');
const DATA = require('./js/data.js');
const Drone = require('./js/mg/drone.js');

let scenarios = 0;
const layouts = new Set();
for (const mark of DATA.CHARACTERS) {
  for (const pack of DATA.GRAMMAR_PACKS) {
    for (const tier of [1, 2, 3]) {
      for (let seed = 1; seed <= 100; seed++) {
        const scn = Drone.generate({ mark, pack, tier, seed });
        assert.deepEqual(Drone.validate(scn), [], `${mark.id} ${pack.id} t${tier} s${seed}`);
        assert.equal(scn.people.length, { 1: 10, 2: 14, 3: 18 }[tier]);
        layouts.add(scn.blocks.map(b => b.kind).join(','));
        assert.ok(scn.pads.length >= 1);
        scenarios++;
      }
    }
  }
}
assert.equal(layouts.size, 1, 'the town layout never changes');
// Hiding counts as hidden from the air: under cover or inside.
const scn = Drone.generate({ mark: DATA.CHARACTERS[3], pack: DATA.GRAMMAR_PACKS[1], tier: 3, seed: 7 });
const mark = scn.people.find(p => p.isMark), hide = mark.segs.find(s => s.hide);
const st = Drone.at(mark, (hide.t0 + hide.t1) / 2);
assert.ok(st.inside || Drone.covered(scn, st.x, st.y), 'a hiding mark cannot be seen from above');
// The validator rejects a second full match.
const decoy = scn.people.find(p => !p.isMark);
decoy.look = Object.assign({}, mark.look); decoy.prop = Object.assign({}, mark.prop);
assert.ok(Drone.validate(scn).length > 0);
console.log(`Drone OK — ${scenarios} scenarios validated on one fixed town.`);
