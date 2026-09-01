'use strict';
const assert = require('assert');
const { gradebookRoster_ } = require('../Code.js');

// Whitelisted admins with no team are course staff who got swept in by a
// registrar export. They must not appear as zero-scored students.
// Whitelisted admins WITH a team are real participants (a TA on a project
// team) and must survive — dropping them would silently lose a graded person.
const roster = [
  { firstName: 'Amy',  lastName: 'Student', email: 'amy@ncsu.edu',   section: 'Team 1' },
  { firstName: 'Bob',  lastName: 'NoTeam',  email: 'bob@ncsu.edu',   section: '' },
  { firstName: 'Pat',  lastName: 'Prof',    email: 'prof@ncsu.edu',  section: '' },
  { firstName: 'Tam',  lastName: 'TA',      email: 'ta@ncsu.edu',    section: 'Team 2' },
  { firstName: 'Sam',  lastName: 'Space',   email: 'sam@ncsu.edu',   section: '   ' },
];
const admins = ['prof@ncsu.edu', 'ta@ncsu.edu', 'leshamb2@ncsu.edu'];

const kept = gradebookRoster_(roster, admins).map(p => p.email);

// The instructor drops out — this is the whole point.
assert.ok(!kept.includes('prof@ncsu.edu'),
  'whitelisted admin with no team is excluded from the gradebook');

// The TA stays, because she is actually on a team and earns a grade.
assert.ok(kept.includes('ta@ncsu.edu'),
  'whitelisted admin WITH a team is kept — she is a real participant');

// Ordinary students are never touched, teamed or not. A student with no team
// must still show up so the instructor can see they were missed.
assert.ok(kept.includes('amy@ncsu.edu'), 'ordinary student on a team is kept');
assert.ok(kept.includes('bob@ncsu.edu'),
  'ordinary student with no team is kept — instructor needs to see them');
assert.ok(kept.includes('sam@ncsu.edu'),
  'ordinary student with whitespace-only team is kept');

assert.strictEqual(kept.length, 4, 'exactly one row removed');

// ── Admin matching is case- and whitespace-insensitive ──────────────────
const messyRoster = [
  { firstName: 'Pat', lastName: 'Prof', email: '  PROF@NCSU.EDU ', section: '' },
];
assert.deepStrictEqual(gradebookRoster_(messyRoster, ['prof@ncsu.edu']), [],
  'admin match ignores case and surrounding whitespace');

assert.deepStrictEqual(gradebookRoster_(messyRoster, ['  Prof@NCSU.edu  ']), [],
  'whitelist entries are normalised too');

// ── Degenerate inputs ───────────────────────────────────────────────────
assert.strictEqual(gradebookRoster_(roster, []).length, 5,
  'empty whitelist removes nobody');
assert.strictEqual(gradebookRoster_(roster, ['']).length, 5,
  'a blank whitelist entry must not match blank-ish emails');
assert.deepStrictEqual(gradebookRoster_([], admins), [], 'empty roster stays empty');

// ── Purity: the caller's array is not mutated ───────────────────────────
const before = roster.length;
gradebookRoster_(roster, admins);
assert.strictEqual(roster.length, before, 'input roster is not mutated');

console.log('gradebook roster filter: all assertions passed');
