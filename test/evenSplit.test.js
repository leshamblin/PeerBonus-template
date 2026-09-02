'use strict';
const assert = require('assert');
const {
  BONUS_BUDGET,
  evenShare_,
  charityRemainder_,
  validateAllocationTotal_,
  buildFlagOnlyRows_,
} = require('../Code.js');

// Bills come in $10 and up, so a share can only ever be a multiple of $10.
// When the budget will not divide n ways on that grid — 3, 6 and 7 teammates
// out of $1,000 — the old code handed the odd $10 to whoever sorted first,
// which is a real grade difference (ratio 1.02 vs 0.99) decided by surname.
// Every teammate now gets an identical share and the unsplittable remainder
// is donated, so nothing about the split depends on list order.

assert.strictEqual(BONUS_BUDGET, 1000, 'budget is $1,000');

// ── The share table ────────────────────────────────────────────────────
const expected = {
  1: { share: 1000, charity:  0 },
  2: { share:  500, charity:  0 },
  3: { share:  330, charity: 10 },   // the case Patrice reported: was 340/330/330
  4: { share:  250, charity:  0 },
  5: { share:  200, charity:  0 },
  6: { share:  160, charity: 40 },
  7: { share:  140, charity: 20 },
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
  assert.strictEqual(share % 10, 0,
    `n=${n}: a share must be payable in $10 bills`);
  assert.ok(charity >= 0 && charity < n * 10,
    `n=${n}: charity must be the sub-bill remainder, got ${charity}`);
}

// A team of one teammate takes the whole budget; nonsense sizes take nothing.
assert.strictEqual(evenShare_(BONUS_BUDGET, 0), 0, 'no teammates -> no share');
assert.strictEqual(charityRemainder_(BONUS_BUDGET, 0), 0, 'no teammates -> no charity');

// ── The server-side total rule ──────────────────────────────────────────
// A submitter may keep back only what cannot be split evenly. Anything more
// is under-allocation dressed up as generosity.
assert.strictEqual(validateAllocationTotal_(1000, 3), null, '$1,000 across 3 is fine');
assert.strictEqual(validateAllocationTotal_(990, 3),  null, '$990 across 3 leaves the $10 remainder');
assert.ok(validateAllocationTotal_(980, 3),  '$980 across 3 keeps back too much');
assert.ok(validateAllocationTotal_(1010, 3), 'over budget is refused');

// Where the split is exact there is no slack at all.
assert.strictEqual(validateAllocationTotal_(1000, 4), null, '$1,000 across 4 is exact');
assert.ok(validateAllocationTotal_(990, 4), 'no charity allowance when 4 divides evenly');

// ── Grading must measure against the share the app actually asks for ───
// A 4-person team has 3 teammates. Split Evenly gives each $330, so $330 has
// to read as a full share; grading it against $1,000/3 = $333.33 would score
// an even split at 99 and make 100 unreachable.
const sorted = [
  { firstName: 'Ann', lastName: 'A', email: 'ann@x.edu', section: 'Quad' },
  { firstName: 'Ben', lastName: 'B', email: 'ben@x.edu', section: 'Quad' },
  { firstName: 'Cy',  lastName: 'C', email: 'cy@x.edu',  section: 'Quad' },
  { firstName: 'Dee', lastName: 'D', email: 'dee@x.edu', section: 'Quad' },
];
const built = buildFlagOnlyRows_(
  sorted,
  { Quad: 4 },
  { 'ann@x.edu': [330, 330, 330] },   // three teammates all split evenly
  new Set(['ann@x.edu']),
  0.75
);
assert.strictEqual(built.rows[0][6], 330, 'equal share on a 4-person team is $330');
assert.strictEqual(built.flags[0], false, 'a full even share is never flagged');

console.log('even split + charity remainder: all assertions passed');
