'use strict';
const assert = require('assert');
const {
  configLinkFormula_, configLinkUrl_, CONFIG_LINKS, CONFIG_NOTES
} = require('../Code.js');

const EXEC   = 'https://script.google.com/a/macros/ncsu.edu/s/AKfycbxABC123/exec';
const GUIDE  = 'https://docs.google.com/document/d/1abcDEF456/edit';
const FOLDER = 'https://drive.google.com/drive/folders/1u2Awm2vtcfTwU6caQdXq2j';

// ── A real URL becomes a clickable HYPERLINK with the given text ────────
assert.strictEqual(
  configLinkFormula_(EXEC, 'Go to Web Form'),
  '=HYPERLINK("' + EXEC + '","Go to Web Form")',
  'a real exec URL becomes a HYPERLINK with its link text');

assert.strictEqual(
  configLinkFormula_(GUIDE, 'Go to Documentation'),
  '=HYPERLINK("' + GUIDE + '","Go to Documentation")',
  'the link text is a parameter, not hardcoded to the web form');

// ── An unfilled config.js placeholder produces nothing ──────────────────
// Writing a link to the literal placeholder would be worse than no link: it
// looks clickable and goes nowhere. Skipping means the row appears by itself
// once the real URL is filled in and pushed.
assert.strictEqual(configLinkFormula_('[WEB_APP_EXEC_URL]', 'x'), null,
  'the exec-url placeholder produces no formula');
assert.strictEqual(configLinkFormula_('[FULL_INSTRUCTOR_GUIDE_DOC_URL]', 'x'), null,
  'the guide placeholder produces no formula');
assert.strictEqual(configLinkFormula_('[REFLECTIONS_FOLDER_URL]', 'x'), null,
  'the reflections-folder placeholder produces no formula');
assert.strictEqual(configLinkFormula_('[SUMMARY_FOLDER_URL]', 'x'), null,
  'the summary-folder placeholder produces no formula');
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
  configLinkFormula_('  ' + EXEC + '  ', 'Go to Web Form'),
  '=HYPERLINK("' + EXEC + '","Go to Web Form")',
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

// ── configLinkUrl_ reads the URL back out of a link cell ───────────────
// This is what keeps a linkified row FUNCTIONAL. A =HYPERLINK cell reads back
// through getValues() as its display text, so getConfig recovers the real URL
// from the formula instead — otherwise reflection_folder_id would resolve to
// "Go to Reflections Folder" and the reflection docs would have nowhere to go.
assert.strictEqual(
  configLinkUrl_('=HYPERLINK("' + FOLDER + '","Go to Reflections Folder")'),
  FOLDER, 'the URL is recovered from the formula, not the display text');
assert.strictEqual(
  configLinkUrl_(configLinkFormula_(FOLDER, 'Go to Summary Folder')),
  FOLDER, 'formula and URL helpers round-trip');
assert.strictEqual(
  configLinkUrl_(configLinkFormula_('https://example.com/a"b', 'x')),
  'https://example.com/a"b', 'a doubled quote in the URL is un-escaped on the way back');
assert.strictEqual(
  configLinkUrl_('=hyperlink( "' + EXEC + '" , "typed by hand" )'),
  EXEC, 'a hand-typed formula (lowercase, loose spacing) still yields its URL');

// Anything that is not a link cell yields '' so the caller falls back to the
// plain cell value — a bare folder ID and a raw URL must both keep working.
assert.strictEqual(configLinkUrl_(''), '', 'a plain value cell has no link URL');
assert.strictEqual(configLinkUrl_(FOLDER), '', 'a raw URL is a value, not a formula');
assert.strictEqual(configLinkUrl_('=SUM(A1:A2)'), '', 'an unrelated formula yields nothing');
assert.strictEqual(configLinkUrl_('=HYPERLINK()'), '', 'a malformed HYPERLINK yields nothing');
assert.strictEqual(configLinkUrl_(null), '', 'null yields nothing');
assert.strictEqual(configLinkUrl_(undefined), '', 'undefined yields nothing');

// ── The link table drives decorateConfigSheet_ ──────────────────────────
assert.ok(Array.isArray(CONFIG_LINKS), 'CONFIG_LINKS is a table');
const byKey = {};
CONFIG_LINKS.forEach(l => { byKey[l.key] = l; });

assert.strictEqual(CONFIG_LINKS.length, 4, 'four link rows: form, docs, and the two folders');

assert.ok(byKey.web_form, 'there is a web_form link row');
assert.strictEqual(byKey.web_form.text, 'Go to Web Form',
  'web_form keeps the agreed wording');

assert.ok(byKey.documentation, 'there is a documentation link row');
assert.strictEqual(byKey.documentation.text, 'Go to Documentation',
  'documentation reads in parallel with web_form');

assert.ok(byKey.reflection_folder_id, 'the reflections folder is a link row');
assert.strictEqual(byKey.reflection_folder_id.text, 'Go to Reflections Folder',
  'the reflections folder link is titled, not a raw URL');

assert.ok(byKey.summary_folder_id, 'the summary folder is a link row');
assert.strictEqual(byKey.summary_folder_id.text, 'Go to Summary Folder',
  'the summary folder link is titled, not a raw URL');

// ── Capitalization is consistent across the whole table ────────────────
// The point of this pass: the instructor sees one block of links that read the
// same way, not "go to web form" next to "Go to Summary Folder".
CONFIG_LINKS.forEach(l => {
  assert.ok(/^Go to [A-Z]/.test(l.text),
    '"' + l.text + '" follows the "Go to Xxx" pattern');
  l.text.split(' ').forEach(word => {
    if (word === 'to') return;                    // the one lowercase word
    assert.ok(/^[A-Z]/.test(word),
      'every significant word in "' + l.text + '" is capitalized');
  });
});

CONFIG_LINKS.forEach(l => {
  assert.ok(typeof l.key === 'string' && l.key, 'every row has a key');
  assert.ok(typeof l.url === 'function',
    'the URL is read through a function, so COURSE.urls is consulted at call ' +
    'time rather than frozen when this file loaded');
  assert.ok(typeof l.text === 'string' && l.text, 'every row has link text');
  assert.doesNotThrow(() => l.url(),
    'reading the URL must not throw even when COURSE.urls is unset');
  assert.doesNotThrow(() => l.url({}),
    'reading the URL must not throw for a config with nothing filled in');
});

// ── The flag_threshold explainer is unchanged ──────────────────────────
assert.ok(CONFIG_NOTES && typeof CONFIG_NOTES.flag_threshold === 'string',
  'a note is defined for flag_threshold');
assert.ok(CONFIG_NOTES.flag_threshold.indexOf('flag_only') >= 0,
  'the note says which grading_mode it applies to');
assert.ok(CONFIG_NOTES.flag_threshold.indexOf('bonus_ratio') >= 0,
  'the note says it is ignored in the other mode');

console.log('config links + notes: all assertions passed');
