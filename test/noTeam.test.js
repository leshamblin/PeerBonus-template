'use strict';
const assert = require('assert');
const { resolveRosterView_, hasTeam_ } = require('../Code.js');

// Roster covering every branch of the view resolver.
//   Team 1  — two real students
//   Testdata — the demo team generateTestData() creates
//   blank/whitespace — students the instructor never assigned
const roster = [
  { firstName: 'Amy',  lastName: 'Real',   email: 'amy@ncsu.edu',   section: 'Team 1' },
  { firstName: 'Bob',  lastName: 'Real',   email: 'bob@ncsu.edu',   section: 'Team 1' },
  { firstName: 'Cal',  lastName: 'Demo',   email: 'cal@ncsu.edu',   section: 'Testdata' },
  { firstName: 'Dee',  lastName: 'Demo',   email: 'dee@ncsu.edu',   section: 'Testdata' },
  { firstName: 'Eve',  lastName: 'NoTeam', email: 'eve@ncsu.edu',   section: '' },
  { firstName: 'Fay',  lastName: 'NoTeam', email: 'fay@ncsu.edu',   section: '   ' },
  { firstName: 'Pat',  lastName: 'Prof',   email: 'prof@ncsu.edu',  section: '' },
];

const emails = v => v.rosterData.map(p => p.email).sort();

// ── hasTeam_ ────────────────────────────────────────────────────────────
assert.strictEqual(hasTeam_('Team 1'), true,  'a real team label counts as a team');
assert.strictEqual(hasTeam_(''),       false, 'empty string is no team');
assert.strictEqual(hasTeam_('   '),    false, 'whitespace-only is no team');
assert.strictEqual(hasTeam_(null),     false, 'null is no team');
assert.strictEqual(hasTeam_(undefined), false, 'undefined is no team');

// ── Student on a real team sees exactly their team ──────────────────────
const student = resolveRosterView_(roster, 'amy@ncsu.edu', false);
assert.strictEqual(student.mode, 'team', 'rostered student with a team -> team view');
assert.deepStrictEqual(emails(student), ['amy@ncsu.edu', 'bob@ncsu.edu'],
  'student sees only their own team');

// ── Student with a blank team is NOT grouped with other blanks ──────────
// This is the bug: `p.section === currentUser.section` matched blank to blank,
// so Eve, Fay and Pat became a phantom team and could evaluate each other.
const blank = resolveRosterView_(roster, 'eve@ncsu.edu', false);
assert.strictEqual(blank.mode, 'noTeam', 'rostered student with blank team -> noTeam');
assert.deepStrictEqual(blank.rosterData, [], 'noTeam view exposes no teammates');

const whitespace = resolveRosterView_(roster, 'fay@ncsu.edu', false);
assert.strictEqual(whitespace.mode, 'noTeam', 'whitespace-only team -> noTeam, not a team of one');

// ── Admin who is a genuine rostered student still sees their real team ──
const adminOnTeam = resolveRosterView_(roster, 'amy@ncsu.edu', true);
assert.strictEqual(adminOnTeam.mode, 'team', 'admin with a real team -> their team');
assert.deepStrictEqual(emails(adminOnTeam), ['amy@ncsu.edu', 'bob@ncsu.edu'],
  'admin on a real team sees that team, not the demo team');

// ── Admin NOT on the roster gets the Testdata demo team ─────────────────
const adminOffRoster = resolveRosterView_(roster, 'admin@ncsu.edu', true);
assert.strictEqual(adminOffRoster.mode, 'demo', 'off-roster admin -> demo view');
assert.deepStrictEqual(emails(adminOffRoster), ['cal@ncsu.edu', 'dee@ncsu.edu'],
  'off-roster admin sees the Testdata team');

// ── Admin on the roster with a blank team ALSO gets the demo team ───────
// Registrar rosters routinely list the instructor. That must not drop her
// into a phantom team with unassigned students.
const adminNoTeam = resolveRosterView_(roster, 'prof@ncsu.edu', true);
assert.strictEqual(adminNoTeam.mode, 'demo', 'admin with blank team -> demo view, not noTeam');
assert.deepStrictEqual(emails(adminNoTeam), ['cal@ncsu.edu', 'dee@ncsu.edu'],
  'admin with blank team sees the Testdata team');

// ── Unknown email is denied ─────────────────────────────────────────────
const stranger = resolveRosterView_(roster, 'nobody@ncsu.edu', false);
assert.strictEqual(stranger.mode, 'denied', 'email not on the roster -> denied');
assert.deepStrictEqual(stranger.rosterData, [], 'denied view exposes no roster');

// ── Email matching is case- and whitespace-insensitive ──────────────────
const messy = resolveRosterView_(roster, '  AMY@NCSU.EDU  ', false);
assert.strictEqual(messy.mode, 'team', 'email match ignores case and surrounding spaces');

console.log('no-team roster view: all assertions passed');
