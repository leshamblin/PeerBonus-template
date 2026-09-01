'use strict';
const assert = require('assert');
const { buildFlagOnlyRows_ } = require('../Code.js');

// Roster spanning every spec edge case.
// Team A size 3 -> equalShare 500; flag if avg < 375 (0.75 * 500).
// Team B size 1 -> solo, equalShare 0.
// Team C size 2 -> equalShare 1000; member received no reviews.
const sorted = [
  { firstName: 'Ann', lastName: 'Above', email: 'ann@x.edu', section: 'A' },
  { firstName: 'Ben', lastName: 'Below', email: 'ben@x.edu', section: 'A' },
  { firstName: 'Cy',  lastName: 'Cusp',  email: 'cy@x.edu',  section: 'A' },
  { firstName: 'Sol', lastName: 'Solo',  email: 'sol@x.edu', section: 'B' },
  { firstName: 'Dot', lastName: 'Dark',  email: 'dot@x.edu', section: 'C' },
];
const sectionSize = { A: 3, B: 1, C: 2 };
const scoresReceived = {
  'ann@x.edu': [600, 700], // avg 650, ratio 1.30 -> not flagged
  'ben@x.edu': [200, 300], // avg 250, ratio 0.50 -> FLAGGED
  'cy@x.edu':  [375, 375], // avg 375, ratio 0.75 -> NOT flagged (strict <)
  // sol: none. dot: none.
};
const submitters = new Set(['ann@x.edu']); // only Ann submitted

const { rows, flags } = buildFlagOnlyRows_(sorted, sectionSize, scoresReceived, submitters, 0.75);

// Grade (col K, index 10) always 100.
rows.forEach((r, i) => assert.strictEqual(r[10], 100, 'row ' + i + ' grade must be 100'));

// Flag decisions.
assert.strictEqual(flags[0], false, 'Ann above -> not flagged');
assert.strictEqual(flags[1], true,  'Ben below 75% -> flagged');
assert.strictEqual(flags[2], false, 'Cy at exactly 0.75 -> not flagged (strict <)');
assert.strictEqual(flags[3], false, 'Solo team -> not flagged');
assert.strictEqual(flags[4], false, 'No reviews received -> not flagged');

// Non-submitters still 100; flag driven only by reviews received.
assert.strictEqual(rows[1][8], 'No', 'Ben did not submit (col I)');
assert.strictEqual(rows[1][9], '⚠ Below 75% of even split', 'Ben flag text (col J)');
assert.strictEqual(rows[4][9], '', 'Dot no-reviews -> blank flag');
assert.strictEqual(rows[0][8], 'Yes', 'Ann submitted (col I)');

// Diagnostics: Ben F=avg 250 (col F), G=equalShare 500 (col G).
assert.strictEqual(rows[1][5], 250, 'Ben avg bonus');
assert.strictEqual(rows[1][6], 500, 'Ben equal share');

console.log('flag-only row builder: all assertions passed');
