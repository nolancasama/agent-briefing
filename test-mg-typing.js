/* English Typing Hack: sequences contain the mark's fact words, have the
   tier's length, never repeat a word and use typeable characters only. */
'use strict';
const assert = require('assert');
const DATA = require('./js/data.js');
const Typing = require('./js/mg/typing.js');

let checked = 0;
for (const mark of DATA.CHARACTERS) {
  for (const pack of DATA.GRAMMAR_PACKS) {
    for (const tier of [1, 2, 3]) {
      for (let seed = 1; seed <= 50; seed++) {
        const p = Typing.generate({ mark, pack, tier, seed });
        assert.deepEqual(Typing.validate(p, mark, pack, tier), [], `${mark.id} ${pack.id} t${tier} s${seed}`);
        assert.equal(p.words.filter(w => w.factKey && w.factKey !== 'name').length, 3, 'three fact words');
        assert.equal(p.revealed.length, 3);
        checked++;
      }
    }
  }
}
// Order varies with the seed.
const orders = new Set();
for (let s = 1; s <= 20; s++) orders.add(Typing.generate({ mark: DATA.CHARACTERS[0], pack: DATA.GRAMMAR_PACKS[0], tier: 1, seed: s }).words.map(w => w.text).join(','));
assert.ok(orders.size > 10, 'word order is randomized');
// The validator catches a missing fact word.
const broken = Typing.generate({ mark: DATA.CHARACTERS[0], pack: DATA.GRAMMAR_PACKS[0], tier: 1, seed: 1 });
broken.words = broken.words.filter(w => w.factKey !== 'likes');
assert.ok(Typing.validate(broken, DATA.CHARACTERS[0], DATA.GRAMMAR_PACKS[0], 1).length > 0);
console.log(`Typing OK — ${checked} word sequences validated.`);
