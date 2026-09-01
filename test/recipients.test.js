'use strict';
const assert = require('assert');
const { validateRecipients_ } = require('../Code.js');

// Recipients arrive from the client. Nothing stops a stale tab — or a curious
// student — from posting allocations for people who are not their teammates,
// so the server has to decide who each submitter is allowed to review.
const roster = [
  { firstName: 'Amy', lastName: 'One',  email: 'amy@ncsu.edu',  section: 'Team 1' },
  { firstName: 'Bob', lastName: 'One',  email: 'bob@ncsu.edu',  section: 'Team 1' },
  { firstName: 'Cal', lastName: 'Two',  email: 'cal@ncsu.edu',  section: 'Team 2' },
  { firstName: 'Dee', lastName: 'Demo', email: 'dee@ncsu.edu',  section: 'Testdata' },
  { firstName: 'Eve', lastName: 'Demo', email: 'eve@ncsu.edu',  section: 'Testdata' },
  { firstName: 'Fay', lastName: 'None', email: 'fay@ncsu.edu',  section: '' },
];
const to = emails => emails.map(e => ({ email: e }));

// ── The ordinary case ──────────────────────────────────────────────────
assert.strictEqual(
  validateRecipients_(to(['bob@ncsu.edu']), roster, 'amy@ncsu.edu', false),
  null,
  'a student reviewing their own teammate is accepted');

// ── A teammate from another team is refused ────────────────────────────
// This is the stale-tab case: Amy loaded the form while her Team cell was
// blank, the instructor then fixed it, and her old tab still holds the old
// roster. The blank-team guard no longer fires, so this check is what stops it.
assert.ok(
  validateRecipients_(to(['cal@ncsu.edu']), roster, 'amy@ncsu.edu', false),
  'a recipient on a DIFFERENT team is refused');

assert.ok(
  validateRecipients_(to(['bob@ncsu.edu', 'cal@ncsu.edu']), roster, 'amy@ncsu.edu', false),
  'one bad recipient spoils an otherwise valid submission');

// ── Someone not on the roster at all is refused ────────────────────────
assert.ok(
  validateRecipients_(to(['nobody@ncsu.edu']), roster, 'amy@ncsu.edu', false),
  'a recipient who is not on the roster is refused');

// ── You cannot pay yourself ────────────────────────────────────────────
assert.ok(
  validateRecipients_(to(['amy@ncsu.edu']), roster, 'amy@ncsu.edu', false),
  'the submitter may not be their own recipient');

// ── You cannot list the same teammate twice to double their share ──────
assert.ok(
  validateRecipients_(to(['bob@ncsu.edu', 'bob@ncsu.edu']), roster, 'amy@ncsu.edu', false),
  'duplicate recipients are refused');

// ── Nothing to review is not a valid submission ────────────────────────
assert.ok(validateRecipients_([], roster, 'amy@ncsu.edu', false),
  'an empty recipient list is refused');

// ── A student with no team has no one they may review ──────────────────
assert.ok(
  validateRecipients_(to(['bob@ncsu.edu']), roster, 'fay@ncsu.edu', false),
  'a teamless student may not review anyone');

// ── Admins preview through the Testdata team ───────────────────────────
// An off-roster admin sees the demo team, so that is exactly who they may
// submit for — the same rule doGet uses to build their view.
assert.strictEqual(
  validateRecipients_(to(['dee@ncsu.edu', 'eve@ncsu.edu']), roster, 'admin@ncsu.edu', true),
  null,
  'an off-roster admin may submit for the Testdata team');

assert.ok(
  validateRecipients_(to(['amy@ncsu.edu']), roster, 'admin@ncsu.edu', true),
  'an off-roster admin may NOT submit for a real student');

// ── An admin who is a genuine student is treated as that student ───────
assert.strictEqual(
  validateRecipients_(to(['bob@ncsu.edu']), roster, 'amy@ncsu.edu', true),
  null,
  'an admin on a real team reviews that team, not the demo team');

// ── Email matching tolerates case and whitespace on both sides ─────────
assert.strictEqual(
  validateRecipients_(to(['  BOB@NCSU.EDU ']), roster, '  AMY@NCSU.EDU ', false),
  null,
  'recipient and submitter emails are normalised before comparison');

// ── Junk shapes are refused rather than thrown on ──────────────────────
assert.ok(validateRecipients_(to(['']), roster, 'amy@ncsu.edu', false),
  'a blank recipient email is refused');
assert.ok(validateRecipients_([{}], roster, 'amy@ncsu.edu', false),
  'a recipient object with no email is refused');
assert.ok(validateRecipients_(null, roster, 'amy@ncsu.edu', false),
  'a null recipient list is refused');

// ── The message is for a student to read ───────────────────────────────
const msg = validateRecipients_(to(['cal@ncsu.edu']), roster, 'amy@ncsu.edu', false);
assert.strictEqual(typeof msg, 'string', 'a rejection returns a message');
assert.ok(msg.length > 20, 'the message explains rather than just saying "invalid"');
assert.ok(msg.indexOf('cal@ncsu.edu') < 0,
  'the message does not leak another roster member\'s email back to the client');

console.log('recipient validation: all assertions passed');
