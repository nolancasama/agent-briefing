/* Photographic Identification: every generated round has exactly one
   matching frame, it shows the true fact, and no decoy looks like it. */
'use strict';
const assert = require('assert');
const DATA = require('./js/data.js');
const Photo = require('./js/mg/photo.js');

let puzzles = 0, contrasts = 0;
for (const mark of DATA.CHARACTERS) {
  for (const pack of DATA.GRAMMAR_PACKS) {
    for (const tier of [1, 2, 3]) {
      for (let seed = 1; seed <= 50; seed++) {
        const puzzle = Photo.generate({ mark, pack, tier, seed });
        assert.deepEqual(Photo.validate(puzzle, mark), [], `${mark.id} ${pack.id} t${tier} s${seed}`);
        assert.equal(puzzle.rounds.length, pack.steps.length - 1);
        assert.deepEqual(puzzle.revealed.sort(), pack.steps.filter(s => s.factLabel !== 'NAME')
          .map(s => s.factLabel === "DOESN'T LIKE" ? 'dislikes' : s.factLabel.toLowerCase()).sort());
        puzzle.rounds.forEach(r => {
          assert.ok(r.options.every(o => o.emoji && o.emoji !== '❓'), 'every frame has a picture');
          if (r.options.some(o => !o.correct && o.value === r.value)) contrasts++;
        });
        puzzles++;
      }
    }
  }
}
// Same seed → same puzzle; different seed → answers move around.
const a = Photo.generate({ mark: DATA.CHARACTERS[0], pack: DATA.GRAMMAR_PACKS[0], tier: 1, seed: 5 });
assert.deepEqual(a, Photo.generate({ mark: DATA.CHARACTERS[0], pack: DATA.GRAMMAR_PACKS[0], tier: 1, seed: 5 }));
const positions = new Set();
for (let s = 1; s <= 40; s++) positions.add(Photo.generate({ mark: DATA.CHARACTERS[0], pack: DATA.GRAMMAR_PACKS[0], tier: 1, seed: s }).rounds[0].answer);
assert.equal(positions.size, 4, 'answer position is randomized');
// Tier 1 never uses the opposite-verb decoy; tier 2+ does for likes/has/wants/dislikes.
assert.ok(contrasts > 0, 'opposite-verb decoys appear from tier 2');
for (let s = 1; s <= 30; s++) {
  Photo.generate({ mark: DATA.CHARACTERS[1], pack: DATA.GRAMMAR_PACKS[1], tier: 1, seed: s }).rounds
    .forEach(r => assert.ok(r.options.every(o => o.correct || o.value !== r.value)));
}
// A broken puzzle is caught.
const broken = Photo.generate({ mark: DATA.CHARACTERS[2], pack: DATA.GRAMMAR_PACKS[0], tier: 2, seed: 3 });
broken.rounds[0].options.forEach(o => { o.correct = true; });
assert.ok(Photo.validate(broken, DATA.CHARACTERS[2]).length > 0, 'validator rejects two matching frames');

console.log(`Photo OK — ${puzzles} puzzles validated, ${contrasts} opposite-verb decoys.`);
