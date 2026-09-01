'use strict';
const assert = require('assert');
const { configLinkFormula_, CONFIG_LINKS, CONFIG_NOTES } = require('../Code.js');

const EXEC  = 'https://script.google.com/a/macros/ncsu.edu/s/AKfycbxABC123/exec';
const GUIDE = 'https://docs.google.com/document/d/1abcDEF456/edit';

// ── A real URL becomes a clickable HYPERLINK with the given text ────────
assert.strictEqual(
  configLinkFormula_(EXEC, 'go to web form'),
  '=HYPERLINK("' + EXEC + '","go to web form")',
  'a real exec URL becomes a HYPERLINK with its link text');

assert.strictEqual(
  configLinkFormula_(GUIDE, 'go to instructor guide'),
  '=HYPERLINK("' + GUIDE + '","go to instructor guide")',
  'the link text is a parameter, not hardcoded to the web form');

// ── An unfilled config.js placeholder produces nothing ──────────────────
// Writing a link to the literal placeholder would be worse than no link: it
// looks clickable and goes nowhere. Skipping means the row appears by itself
// once the real URL is filled in and pushed.
assert.strictEqual(configLinkFormula_('[WEB_APP_EXEC_URL]', 'x'), null,
  'the exec-url placeholder produces no formula');
assert.strictEqual(configLinkFormula_('[FULL_INSTRUCTOR_GUIDE_DOC_URL]', 'x'), null,
  'the guide placeholder produces no formula');
assert.strictEqual(configLinkFormula_('', 'x'), null, 'empty string produces no formula');
assert.strictEqual(configLinkFormula_(null, 'x'), null, 'null produces no formula');
assert.strictEqual(configLinkFormula_(undefined, 'x'), null, 'undefined produces no formula');
assert.strictEqual(configLinkFormula_('   ', 'x'), null, 'whitespace produces no formula');

// ── Only https ─────────────────────────────────────────────────────────
assert.strictEqual(configLinkFormula_('http://example.com/exec', 'x'), null,
  'plain http is rejected');
assert.strictEqual(configLinkFormula_('javascript:alert(1)', 'x'), null,
  'a javascript: URL is rejected');

// ── Whitespace around the URL is tolerated ─────────────────────────────
assert.strictEqual(
  configLinkFormula_('  ' + EXEC + '  ', 'go to web form'),
  '=HYPERLINK("' + EXEC + '","go to web form")',
  'surrounding whitespace is trimmed');

// ── Quotes cannot break out of the formula, in EITHER argument ──────────
// Sheets escapes a literal " inside a formula string by doubling it.
assert.strictEqual(
  configLinkFormula_('https://example.com/a"b', 'plain'),
  '=HYPERLINK("https://example.com/a""b","plain")',
  'a quote in the URL is doubled');
assert.strictEqual(
  configLinkFormula_(EXEC, 'say "hi"'),
  '=HYPERLINK("' + EXEC + '","say ""hi""")',
  'a quote in the link text is doubled too');

// ── The link table drives decorateConfigSheet_ ──────────────────────────
assert.ok(Array.isArray(CONFIG_LINKS), 'CONFIG_LINKS is a table');
const byKey = {};
CONFIG_LINKS.forEach(l => { byKey[l.key] = l; });

assert.ok(byKey.web_form, 'there is a web_form link row');
assert.strictEqual(byKey.web_form.text, 'go to web form',
  'web_form keeps the agreed wording');

assert.ok(byKey.instructor_guide, 'there is an instructor_guide link row');
assert.strictEqual(byKey.instructor_guide.text, 'go to instructor guide',
  'instructor_guide reads in parallel with web_form');

CONFIG_LINKS.forEach(l => {
  assert.ok(typeof l.key === 'string' && l.key, 'every row has a key');
  assert.ok(typeof l.url === 'function',
    'the URL is read through a function, so COURSE.urls is consulted at call ' +
    'time rather than frozen when this file loaded');
  assert.ok(typeof l.text === 'string' && l.text, 'every row has link text');
  assert.doesNotThrow(() => l.url(),
    'reading the URL must not throw even when COURSE.urls is unset');
});

// ── The flag_threshold explainer is unchanged ──────────────────────────
assert.ok(CONFIG_NOTES && typeof CONFIG_NOTES.flag_threshold === 'string',
  'a note is defined for flag_threshold');
assert.ok(CONFIG_NOTES.flag_threshold.indexOf('flag_only') >= 0,
  'the note says which grading_mode it applies to');
assert.ok(CONFIG_NOTES.flag_threshold.indexOf('bonus_ratio') >= 0,
  'the note says it is ignored in the other mode');

console.log('config links + notes: all assertions passed');
