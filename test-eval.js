/* Unit tests for js/evaluate.js — the briefing evaluation logic.
   Pure Node, no browser, no dependencies:
       npm test
   Every case states the target, what the recognizer "heard", and what
   HQ is allowed to conclude from it. */
'use strict';

const E = require('./js/evaluate.js');

let pass = 0;
const failures = [];

function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) pass++;
  else failures.push(`${label}\n    expected: ${expected}\n    actual:   ${actual}`);
}

/* Build an STT result. `null` means the recognizer gave us nothing. */
const heard = (transcript, confidence) =>
  ({ transcript, confidence: confidence == null ? 0.9 : confidence, gotResult: true });
const NO_RESULT = null;
const UNSUPPORTED = { transcript: '', confidence: 0, gotResult: false };

/* ---------- clip verification ---------- */
function verif(target, stt) { return E.evaluateClip(target, stt).verification; }
function qual(target, stt) { return E.evaluateClip(target, stt).quality; }

const KIND = { fact: 'kind', frame: 'He is ______.' };

check('"He is kind." is confirmed', verif(KIND, heard('He is kind.')), 'confirmed');
check('"He is strong." is a mismatch', verif(KIND, heard('He is strong.')), 'mismatch');
check('empty transcript is unverified', verif(KIND, heard('')), 'unverified');
check('no STT result at all is unverified', verif(KIND, NO_RESULT), 'unverified');
check('unsupported recognition is unverified', verif(KIND, UNSUPPORTED), 'unverified');

/* Grammar must not rescue wrong content: the frame "He is" matches
   perfectly here, and the clip must still score at the floor. */
check('wrong fact scores low despite a perfect frame',
  qual(KIND, heard('He is strong.')) < 0.35, true);
check('unverified has no quality number',
  qual(KIND, NO_RESULT), null);

/* ---------- mission aggregation ---------- */
function rankOf(clips) { return E.evaluateMission(clips).rank; }

const good = E.evaluateClip(KIND, heard('He is kind.'));
const wrong = E.evaluateClip(KIND, heard('He is strong.'));
const unver = E.evaluateClip(KIND, NO_RESULT);

check('four confirmed answers can reach S', rankOf([good, good, good, good]), 'S');
check('one wrong fact caps the mission at B', rankOf([good, good, good, wrong]), 'B');
check('three confirmed + one unverified is not S', rankOf([good, good, good, unver]) !== 'S', true);

/* ---------- report ---------- */
check('an all-unverified mission has no rank letter',
  rankOf([unver, unver, unver, unver]), null);
check('an all-unverified mission says so',
  E.evaluateMission([unver, unver, unver, unver]).contentLabel, 'SIGNAL UNVERIFIED');

/* ------------------------------------------------------------------
   MORE CASES GO BELOW — see the work order. Keep the same style:
   one `check(...)` per behaviour, with a label a teacher could read.
   ------------------------------------------------------------------ */

check('"He kind." is confirmed even with imperfect grammar',
  verif(KIND, heard('He kind.')), 'confirmed');
check('"kind" alone is confirmed', verif(KIND, heard('kind')), 'confirmed');
check('"She is kind." is confirmed despite the wrong pronoun',
  verif(KIND, heard('She is kind.')), 'confirmed');
check('the wrong pronoun lowers quality below the correct pronoun',
  qual(KIND, heard('She is kind.')) < qual(KIND, heard('He is kind.')), true);
check('filler speech is unverified', verif(KIND, heard('uh um')), 'unverified');
check('one stray word is unverified', verif(KIND, heard('strong')), 'unverified');

check('a full correct sentence scores above broken grammar',
  qual(KIND, heard('He is kind.')) > qual(KIND, heard('He kind.')), true);
check('broken grammar scores above the fact alone',
  qual(KIND, heard('He kind.')) > qual(KIND, heard('kind')), true);
check('the fact alone scores above a full sentence with the wrong fact',
  qual(KIND, heard('kind')) > qual(KIND, heard('He is strong.')), true);

const DOG = { fact: 'a dog', frame: 'He has ______.' };
const NEW_BALL = { fact: 'a new ball', frame: 'He wants ______.' };
const PIANO = { fact: 'play the piano', frame: 'He can ______.' };
const RUN_FAST = { fact: 'run fast', frame: 'He can ______.' };
const CARROTS = { fact: 'carrots', frame: 'He does not like ______.' };
const DRAWING = { fact: 'drawing', frame: 'She likes ______.' };

check('"He has a dog." confirms the fact "a dog"',
  verif(DOG, heard('He has a dog.')), 'confirmed');
check('"He has dog." confirms the fact "a dog" without the article',
  verif(DOG, heard('He has dog.')), 'confirmed');
check('"dog" alone confirms the fact "a dog" without the article',
  verif(DOG, heard('dog')), 'confirmed');
check('"He has a cat." mismatches the fact "a dog"',
  verif(DOG, heard('He has a cat.')), 'mismatch');
check('"He wants a new ball." confirms the fact "a new ball"',
  verif(NEW_BALL, heard('He wants a new ball.')), 'confirmed');
check('"He wants a ball." is partial for the fact "a new ball"',
  verif(NEW_BALL, heard('He wants a ball.')), 'partial');
check('"He can play piano." confirms the fact "play the piano"',
  verif(PIANO, heard('He can play piano.')), 'confirmed');
check('"He can run." is partial for the fact "run fast"',
  verif(RUN_FAST, heard('He can run.')), 'partial');
check('"carrot" confirms the plural fact "carrots"',
  verif(CARROTS, heard('He does not like carrot.')), 'confirmed');
check('"draw" confirms the fact "drawing"',
  verif(DRAWING, heard('She likes draw.')), 'confirmed');

const partial = E.evaluateClip(NEW_BALL, heard('He wants a ball.'));
const mismatch = E.evaluateClip(DOG, heard('He has a cat.'));

check('two wrong facts give the mission rank C',
  rankOf([good, good, mismatch, mismatch]), 'C');
check('two partial answers cap the mission at A or lower',
  ['C', 'B', 'A'].includes(rankOf([good, good, partial, partial])), true);
check('a majority of unverified answers caps the mission at B',
  ['C', 'B'].includes(rankOf([good, unver, unver, unver])), true);
check('three confirmed answers and one unverified answer report both counts',
  E.contentLabel({ confirmed: 3, partial: 0, mismatch: 0, unverified: 1 }, 4),
  '3 CONFIRMED · 1 UNVERIFIED');
check('an unverified answer is never reported as incorrect',
  E.contentLabel({ confirmed: 3, partial: 0, mismatch: 0, unverified: 1 }, 4).includes('INCORRECT'), false);
check('an empty clip list returns no rank without throwing',
  (() => { try { return rankOf([]) === null; } catch (err) { return false; } })(), true);
check('a mission rank never exceeds S or falls below C',
  ['S', 'A', 'B', 'C'].includes(rankOf([{ verification: 'confirmed', quality: 2 }])), true);
check('a very low mission quality still receives rank C',
  rankOf([{ verification: 'confirmed', quality: -2 }]), 'C');

check('a quality at the S threshold receives rank S', E.letterFor(0.88), 'S');
check('a quality at the A threshold receives rank A', E.letterFor(0.72), 'A');
check('a quality at the B threshold receives rank B', E.letterFor(0.50), 'B');
check('a quality below the B threshold receives rank C', E.letterFor(0.49), 'C');
check('a complete correct sentence looks complete while recording',
  E.looksComplete(KIND, 'He is kind.'), true);
check('a complete frame without the fact does not look complete while recording',
  E.looksComplete(KIND, 'He is very.'), false);
check('an expanded does-not recording auto-completes a doesn\'t-like sentence',
  E.looksComplete({ fact: 'carrots', frame: "He doesn't like ______." }, 'He does not like carrots.'), true);
check('a contracted recording auto-completes a doesn\'t-like sentence',
  E.looksComplete({ fact: 'carrots', frame: "He doesn't like ______." }, "He doesn't like carrots."), true);
check('a clear full-frame answer reports a clear transmission',
  E.transmissionLabel([good]), 'CLEAR TRANSMISSION');
check('a fact-only answer reports a weak transmission',
  E.transmissionLabel([E.evaluateClip(KIND, heard('kind'))]), 'WEAK SIGNAL');
check('no verified answers report an unverified signal',
  E.transmissionLabel([]), 'SIGNAL UNVERIFIED');

/* ---------- report ---------- */
if (failures.length) {
  console.error(`FAILED ${failures.length} of ${pass + failures.length}:\n`);
  failures.forEach(f => console.error('  ✗ ' + f + '\n'));
  process.exit(1);
}
console.log(`eval tests OK — ${pass} checks passed.`);
