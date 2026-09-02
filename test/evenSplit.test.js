'use strict';
const assert = require('assert');
const {
  BONUS_BUDGET,
  SMALLEST_BILL,
  evenShare_,
  charityRemainder_,
  validateAllocationTotal_,
  buildFlagOnlyRows_,
} = require('../Code.js');

// Every share is a multiple of the smallest bill. $1,000 does not divide by
// 3 at any precision, so a remainder is unavoidable; it is donated rather
// than handed to whoever sorts first, which used to move final grades by a
// point (ratio 1.02 vs 0.99) on surname order alone. With $1 bills the
// remainder is small enough that nobody has to think about it.

assert.strictEqual(BONUS_BUDGET, 1000, 'budget is $1,000');
assert.strictEqual(SMALLEST_BILL, 1, 'smallest bill is $1 — must match min(DENOMS) in Index.html');

// ── The share table ────────────────────────────────────────────────────
const expected = {
  1: { share: 1000, charity: 0 },
  2: { share:  500, charity: 0 },
  3: { share:  333, charity: 1 },   // the case Patrice reported: was 340/330/330
  4: { share:  250, charity: 0 },
  5: { share:  200, charity: 0 },
  6: { share:  166, charity: 4 },
  7: { share:  142, charity: 6 },
};

Object.keys(expected).forEach(k => {
  const n = Number(k);
  assert.strictEqual(evenShare_(BONUS_BUDGET, n), expected[n].share,
    `n=${n} share`);
  assert.strictEqual(charityRemainder_(BONUS_BUDGET, n), expected[n].charity,
    `n=${n} charity`);
});

// ── Invariants that must hold for any team size ─────────────────────────
for (let n = 1; n <= 40; n++) {
  const share   = evenShare_(BONUS_BUDGET, n);
  const charity = charityRemainder_(BONUS_BUDGET, n);

  assert.strictEqual(share * n + charity, BONUS_BUDGET,
    `n=${n}: shares plus charity must account for every dollar`);
  assert.strictEqual(share % SMALLEST_BILL, 0,
    `n=${n}: a share must be payable in bills`);
  assert.ok(charity >= 0 && charity < n * SMALLEST_BILL,
    `n=${n}: charity must be the sub-bill remainder, got ${charity}`);
}

// A team of one teammate takes the whole budget; nonsense sizes take nothing.
assert.strictEqual(evenShare_(BONUS_BUDGET, 0), 0, 'no teammates -> no share');
assert.strictEqual(charityRemainder_(BONUS_BUDGET, 0), 0, 'no teammates -> no charity');

// ── The server-side total rule ──────────────────────────────────────────
// A submitter may keep back only what cannot be split evenly. Anything more
// is under-allocation dressed up as generosity.
assert.strictEqual(validateAllocationTotal_(1000, 3), null, '$1,000 across 3 is fine');
assert.strictEqual(validateAllocationTotal_(999, 3),  null, '$999 across 3 leaves the $1 remainder');
assert.ok(validateAllocationTotal_(998, 3),  '$998 across 3 keeps back too much');
assert.ok(validateAllocationTotal_(1010, 3), 'over budget is refused');

// A student may still hand-build an uneven distribution totalling $1,000.
assert.strictEqual(validateAllocationTotal_(1000, 3), null, '334/333/333 by hand is accepted');

// Where the split is exact there is no slack at all.
assert.strictEqual(validateAllocationTotal_(1000, 4), null, '$1,000 across 4 is exact');
assert.ok(validateAllocationTotal_(999, 4), 'no charity allowance when 4 divides evenly');

// ── Grading must measure against the share the app actually asks for ───
// A 4-person team has 3 teammates. Split Evenly gives each $333, so $333 has
// to read as a full share; grading it against $1,000/3 = $333.33 would score
// an even split at 99.99 and make a clean 100 unreachable.
const sorted = [
  { firstName: 'Ann', lastName: 'A', email: 'ann@x.edu', section: 'Quad' },
  { firstName: 'Ben', lastName: 'B', email: 'ben@x.edu', section: 'Quad' },
  { firstName: 'Cy',  lastName: 'C', email: 'cy@x.edu',  section: 'Quad' },
  { firstName: 'Dee', lastName: 'D', email: 'dee@x.edu', section: 'Quad' },
];
const built = buildFlagOnlyRows_(
  sorted,
  { Quad: 4 },
  { 'ann@x.edu': [333, 333, 333] },   // three teammates all split evenly
  new Set(['ann@x.edu']),
  0.75
);
assert.strictEqual(built.rows[0][6], 333, 'equal share on a 4-person team is $333');
assert.strictEqual(built.flags[0], false, 'a full even share is never flagged');

console.log('even split + charity remainder: all assertions passed');
