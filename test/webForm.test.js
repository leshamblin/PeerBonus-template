'use strict';
const assert = require('assert');
const { webFormFormula_, CONFIG_NOTES } = require('../Code.js');

const LINK_TEXT = 'go to web form';
const EXEC = 'https://script.google.com/a/macros/ncsu.edu/s/AKfycbxABC123/exec';

// ── A real deployed URL becomes a clickable HYPERLINK ───────────────────
assert.strictEqual(
  webFormFormula_(EXEC),
  '=HYPERLINK("' + EXEC + '","' + LINK_TEXT + '")',
  'a real exec URL becomes a HYPERLINK formula with the agreed link text');

// ── A freshly-cut course has not filled COURSE.urls.form in yet ─────────
// Writing a link to the literal placeholder would be worse than no link:
// it looks clickable and goes nowhere. Skip, so the row appears by itself
// once step 9 of the setup recipe fills the real URL in.
assert.strictEqual(webFormFormula_('[WEB_APP_EXEC_URL]'), null,
  'the config.js placeholder produces no formula');
assert.strictEqual(webFormFormula_(''), null, 'empty string produces no formula');
assert.strictEqual(webFormFormula_(null), null, 'null produces no formula');
assert.strictEqual(webFormFormula_(undefined), null, 'undefined produces no formula');
assert.strictEqual(webFormFormula_('   '), null, 'whitespace produces no formula');

// ── Only https. Apps Script exec URLs always are ────────────────────────
assert.strictEqual(webFormFormula_('http://example.com/exec'), null,
  'plain http is rejected');
assert.strictEqual(webFormFormula_('ftp://example.com'), null,
  'a non-http scheme is rejected');
assert.strictEqual(webFormFormula_('javascript:alert(1)'), null,
  'a javascript: URL is rejected');

// ── Surrounding whitespace is tolerated ─────────────────────────────────
assert.strictEqual(
  webFormFormula_('  ' + EXEC + '  '),
  '=HYPERLINK("' + EXEC + '","' + LINK_TEXT + '")',
  'surrounding whitespace is trimmed before building the formula');

// ── A quote in the URL must not break out of the formula string ─────────
// Sheets escapes a literal " inside a formula string by doubling it.
assert.strictEqual(
  webFormFormula_('https://example.com/a"b'),
  '=HYPERLINK("https://example.com/a""b","' + LINK_TEXT + '")',
  'a double quote in the URL is doubled, not left to terminate the string');

// ── The flag_threshold explainer ────────────────────────────────────────
assert.ok(CONFIG_NOTES && typeof CONFIG_NOTES.flag_threshold === 'string',
  'a note is defined for flag_threshold');
const note = CONFIG_NOTES.flag_threshold;
assert.ok(note.indexOf('flag_only') >= 0,
  'the note says which grading_mode it applies to');
assert.ok(note.indexOf('bonus_ratio') >= 0,
  'the note says it is ignored in the other mode');
assert.ok(note.length > 80 && note.length < 600,
  'the note is substantive but still fits a hover tooltip');

console.log('web form link + config notes: all assertions passed');
