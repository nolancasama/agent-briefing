/* Password Cracking: every vault's answer is the mark's own fact, its tile
   pool can spell it, clues exist for every fact value in both packs, and
   final clues are unique across the bank. */
'use strict';
const assert = require('assert');
const DATA = require('./js/data.js');
const PW = require('./js/mg/password.js');

// Every fact value any pack can ask about resolves to a bank entry.
for (const c of DATA.CHARACTERS) {
  for (const pack of DATA.GRAMMAR_PACKS) {
    pack.steps.filter(s => s.factLabel !== 'NAME').forEach(s => assert.ok(PW.entryFor(s.fact(c)), `no password for ${c.id}: ${s.fact(c)}`));
  }
}
let vaults = 0;
for (const mark of DATA.CHARACTERS) {
  for (const pack of DATA.GRAMMAR_PACKS) {
    for (const tier of [1, 2, 3]) {
      for (let seed = 1; seed <= 50; seed++) {
        const p = PW.generate({ mark, pack, tier, seed });
        assert.deepEqual(PW.validate(p, mark), [], `${mark.id} ${pack.id} t${tier} s${seed}`);
        assert.equal(p.vaults.length, 3);
        p.vaults.forEach(v => assert.equal(v.pool.length, v.answer.length + { 1: 3, 2: 5, 3: 7 }[tier]));
        vaults += p.vaults.length;
      }
    }
  }
}
// Final clues are unique (validator checks the whole bank; assert it directly too).
const finals = PW.BANK.map(e => e.clues[e.clues.length - 1]);
assert.equal(new Set(finals).size, finals.length);
// A pool missing a letter is caught.
const broken = PW.generate({ mark: DATA.CHARACTERS[0], pack: DATA.GRAMMAR_PACKS[1], tier: 1, seed: 2 });
broken.vaults[0].pool = broken.vaults[0].pool.filter(ch => ch !== broken.vaults[0].answer[0]);
assert.ok(PW.validate(broken, DATA.CHARACTERS[0]).length > 0);
console.log(`Password OK — ${vaults} vaults validated, ${PW.BANK.length} bank entries.`);
