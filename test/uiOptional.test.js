'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// `SpreadsheetApp.getUi()` only exists inside a container UI context — a menu
// click or onOpen. It throws "Cannot call SpreadsheetApp.getUi() from this
// context." everywhere else, including the Apps Script editor's Run button.
//
// The first run of a fresh course copy happens in exactly that broken context:
// the sheet is created by `clasp create` with no code, so the Peer Eval Admin
// menu does not exist until the sheet is reloaded after `clasp push`. The
// editor is the only way to bootstrap, and setupSheet/setupFolders took the UI
// on their first line — throwing before creating a single tab.
//
// So the first-run functions must acquire the UI defensively and report through
// the execution log when there isn't one.

const logged = [];
global.SpreadsheetApp = {
  getUi() { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); }
};
global.Logger = { log: m => logged.push(String(m)) };

const { uiOrNull_, notify_, requireUi_ } = require('../Code.js');

// ── The guard itself ────────────────────────────────────────────────────────
assert.strictEqual(typeof uiOrNull_, 'function', 'uiOrNull_ is exported');
assert.doesNotThrow(() => uiOrNull_(),
  'uiOrNull_ swallows the no-UI-context error instead of propagating it');
assert.strictEqual(uiOrNull_(), null, 'no UI context yields null, not a throw');

// A real UI is passed straight through — the menu path must be unchanged.
const realUi = { alert: () => 'ok', ButtonSet: { OK: 'OK' } };
global.SpreadsheetApp = { getUi: () => realUi };
assert.strictEqual(uiOrNull_(), realUi, 'a working UI context is returned as-is');

// ── Reporting with and without a UI ─────────────────────────────────────────
const alerts = [];
const fakeUi = {
  ButtonSet: { OK: 'OK' },
  alert: (title, msg, buttons) => { alerts.push({ title, msg, buttons }); }
};

notify_(fakeUi, 'Setup complete', 'Created tabs: Config, Roster, Responses.');
assert.strictEqual(alerts.length, 1, 'with a UI, notify_ alerts');
assert.strictEqual(alerts[0].title, 'Setup complete');
assert.ok(alerts[0].msg.includes('Created tabs'), 'the message body reaches the alert');
assert.strictEqual(alerts[0].buttons, fakeUi.ButtonSet.OK, 'alert uses the OK button set');

logged.length = 0;
assert.doesNotThrow(
  () => notify_(null, 'Setup complete', 'Created tabs: Config, Roster, Responses.'),
  'without a UI, notify_ must not throw — this is the editor path');
assert.strictEqual(logged.length, 1, 'without a UI, notify_ logs exactly once');
assert.ok(logged[0].includes('Setup complete'), 'the title survives into the log');
assert.ok(logged[0].includes('Created tabs'), 'the body survives into the log');

// A bare title with no body still works, both ways — most menu handlers alert
// a single string rather than a title/body pair.
alerts.length = 0;
notify_(fakeUi, 'Cache cleared.');
assert.strictEqual(alerts.length, 1, 'one-argument notify_ still alerts');
assert.strictEqual(alerts[0].title, 'Cache cleared.');
assert.strictEqual(alerts[0].msg, undefined, 'no body means a plain one-line alert');

logged.length = 0;
notify_(null, 'Cache cleared.');
assert.strictEqual(logged.length, 1, 'one-argument notify_ logs when there is no UI');
assert.strictEqual(logged[0], 'Cache cleared.', 'no stray blank lines around a bodyless message');

// ── Destructive actions refuse rather than run unconfirmed ──────────────────
// clearTestData asks YES/NO before deleting. With no UI there is nobody to ask,
// so it must decline — silently deleting because the confirm was unavailable
// would be the worst possible reading of "tolerate a missing UI".
global.SpreadsheetApp = {
  getUi() { throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); }
};
logged.length = 0;
assert.strictEqual(requireUi_('Clear Test Data'), null,
  'requireUi_ yields null when there is no UI to confirm with');
assert.strictEqual(logged.length, 1, 'and says why, in the execution log');
assert.ok(/Clear Test Data/.test(logged[0]), 'the log names the action that was refused');

global.SpreadsheetApp = { getUi: () => realUi };
assert.strictEqual(requireUi_('Clear Test Data'), realUi,
  'with a UI, requireUi_ hands back the real thing');

// ── Every menu handler must use the guard ───────────────────────────────────
// A source check, because faking enough of SpreadsheetApp to execute these
// end-to-end would test the fake, not the code. What matters is that none of
// them can take the UI unguarded again.
//
// onOpen is deliberately exempt: it is a simple trigger that only ever fires
// when the spreadsheet is opened, so its UI always exists — and if it somehow
// didn't, there would be no menu to guard.
const src = fs.readFileSync(path.join(__dirname, '..', 'Code.js'), 'utf8');

function bodyOf(name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start !== -1, name + ' exists in Code.js');
  const next = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

// clearTestData guards through requireUi_ and bails out, so it keeps its own
// ui.alert calls after that point — they are unreachable without a UI.
const destructive = bodyOf('clearTestData');
assert.ok(/requireUi_\(/.test(destructive),
  'clearTestData asks for a UI through requireUi_');
assert.ok(/if \(!ui\) return;/.test(destructive),
  'clearTestData returns early when there is no UI — it never deletes unconfirmed');
assert.ok(!/SpreadsheetApp\.getUi\(\)/.test(destructive),
  'clearTestData never calls SpreadsheetApp.getUi() directly');

[
  'setupSheet', 'setupFolders',          // first run, before any menu exists
  'clearCache',                          // routine, and easy to reach for in the editor
  'generateTestData', 'generateSummaryDocs',
  'generateTeamReflectionDocs', 'resetGenerationLog'
].forEach(name => {
  const body = bodyOf(name);
  assert.ok(body.includes('uiOrNull_()'),
    name + ' acquires its UI through uiOrNull_()');
  assert.ok(!/SpreadsheetApp\.getUi\(\)/.test(body),
    name + ' never calls SpreadsheetApp.getUi() directly — it throws in the editor');
  assert.ok(!/\bui\.alert\(/.test(body),
    name + ' reports through notify_, which tolerates a null ui');
});

console.log('uiOptional.test.js — all assertions passed');
