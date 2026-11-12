/* Foot Pursuit: every level is traversable, forks follow the mark's facts
   with the clue lane as the shortcut, and hiding spots come after forks. */
'use strict';
const assert = require('assert');
const DATA = require('./js/data.js');
const Chase = require('./js/mg/chase.js');

assert.ok(Chase.JUMP_REACH > 160, 'jump reach comfortably clears gaps');
let levels = 0, forks = 0, dislikeForks = 0;
for (const mark of DATA.CHARACTERS) {
  for (const pack of DATA.GRAMMAR_PACKS) {
    for (const tier of [1, 2, 3]) {
      for (let seed = 1; seed <= 100; seed++) {
        const level = Chase.generate({ mark, pack, tier, seed });
        assert.deepEqual(Chase.validate(level, mark, pack), [], `${mark.id} ${pack.id} t${tier} s${seed}`);
        assert.equal(level.hides.length, Math.min(3, tier));
        if (tier === 1) assert.equal(level.theme, 'city', 'tier 1 starts in the city');
        forks += level.forks.length;
        dislikeForks += level.forks.filter(f => f.key === 'dislikes').length;
        levels++;
      }
    }
  }
}
assert.ok(dislikeForks > 0, "Level 2 uses doesn't-like forks");
// The validator rejects broken levels.
const mark = DATA.CHARACTERS[0], pack = DATA.GRAMMAR_PACKS[0];
const swapped = Chase.generate({ mark, pack, tier: 1, seed: 4 });
const f = swapped.forks[0]; f.correctLane = f.correctLane === 'upper' ? 'ground' : 'upper';
assert.ok(Chase.validate(swapped, mark, pack).length > 0, 'clue sign on the wrong lane is caught');
const wide = Chase.generate({ mark, pack, tier: 1, seed: 4 });
wide.obstacles.push({ x: 30000, lane: 'ground', type: 'gap', w: 400 });
assert.ok(Chase.validate(wide, mark, pack).some(e => /wider than a jump/.test(e)));
console.log(`Chase OK — ${levels} levels, ${forks} forks (${dislikeForks} doesn't-like) validated.`);
