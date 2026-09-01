'use strict';
const assert = require('assert');
const code = require('../Code.js');
const { decorateConfigSheet_, CONFIG_NOTES } = code;

const LINK = 'https://script.google.com/a/macros/ncsu.edu/s/AKfycbxABC/exec';
const GUIDE = 'https://docs.google.com/document/d/1abc/edit';

// Minimal stand-in for a Sheet: rows of [key, value], plus per-cell notes.
// Every API call is counted so "read-only when idle" is measured, not assumed.
function makeSheet(rows) {
  const data = rows.map(r => r.slice());
  const notes = {};
  const calls = { getLastRow: 0, getValues: 0, getNote: 0, setNote: 0, setFormula: 0, appendRow: 0 };
  return {
    calls,
    data,
    notes,
    getLastRow() { calls.getLastRow++; return data.length; },
    appendRow(row) { calls.appendRow++; data.push(row.slice()); },
    getRange(row, col, numRows) {
      return {
        getValues() {
          calls.getValues++;
          return data.slice(row - 1, row - 1 + (numRows || 1)).map(r => [r[col - 1]]);
        },
        setFormula(f) { calls.setFormula++; data[row - 1][col - 1] = f; },
        getNote() { calls.getNote++; return notes[row + ':' + col] || ''; },
        setNote(n) { calls.setNote++; notes[row + ':' + col] = n; }
      };
    }
  };
}

// COURSE lives in config.js, which Node does not load. Code.js reads it through
// courseUrl_, so define it here to drive the link rows.
global.COURSE = { urls: { form: LINK, mainGuide: GUIDE } };

const BASE = [
  ['Key', 'Value'],
  ['app_title', 'x'],
  ['flag_threshold', 0.75]
];

// ── Fresh sheet: both link rows are appended and the note is set ────────
{
  const sheet = makeSheet(BASE);
  const config = { app_title: 'x', flag_threshold: 0.75 };
  decorateConfigSheet_(sheet, config);

  const keys = sheet.data.map(r => r[0]);
  assert.ok(keys.indexOf('web_form') > 0, 'web_form row was added');
  assert.ok(keys.indexOf('instructor_guide') > 0, 'instructor_guide row was added');

  const webRow = sheet.data[keys.indexOf('web_form')];
  assert.strictEqual(webRow[1], '=HYPERLINK("' + LINK + '","go to web form")',
    'the formula landed in the value cell of its OWN row');
  const guideRow = sheet.data[keys.indexOf('instructor_guide')];
  assert.strictEqual(guideRow[1], '=HYPERLINK("' + GUIDE + '","go to instructor guide")',
    'the second link did not overwrite the first');

  const noteRow = keys.indexOf('flag_threshold') + 1;
  assert.strictEqual(sheet.notes[noteRow + ':1'], CONFIG_NOTES.flag_threshold,
    'the note went on the flag_threshold KEY cell');
}

// ── Steady state: nothing left to do means no writes at all ────────────
{
  const sheet = makeSheet(BASE);
  const config = { app_title: 'x', flag_threshold: 0.75 };
  decorateConfigSheet_(sheet, config);          // first pass does the work
  const after = Object.assign({}, sheet.calls);
  decorateConfigSheet_(sheet, config);          // second pass should be inert

  assert.strictEqual(sheet.calls.setFormula, after.setFormula, 'no formula rewritten');
  assert.strictEqual(sheet.calls.setNote, after.setNote, 'no note rewritten');
  assert.strictEqual(sheet.calls.appendRow, after.appendRow, 'no row appended');
  assert.strictEqual(sheet.data.filter(r => r[0] === 'web_form').length, 1,
    'the link row was not duplicated');
}

// ── The stuck state: a key whose value cell is blank must be repaired ───
// If setFormula failed after appendRow, or an instructor cleared the cell by
// hand, the key exists with no value. A presence-only check would skip it
// forever and the link would never come back.
{
  const sheet = makeSheet(BASE.concat([['web_form', '']]));
  const config = { app_title: 'x', flag_threshold: 0.75, web_form: '' };
  decorateConfigSheet_(sheet, config);

  const rows = sheet.data.filter(r => r[0] === 'web_form');
  assert.strictEqual(rows.length, 1, 'the half-written row was repaired, not duplicated');
  assert.strictEqual(rows[0][1], '=HYPERLINK("' + LINK + '","go to web form")',
    'the formula was written into the existing row');
}

// ── An unfilled URL adds nothing and writes nothing ────────────────────
{
  global.COURSE = { urls: { form: '[WEB_APP_EXEC_URL]', mainGuide: '[FULL_INSTRUCTOR_GUIDE_DOC_URL]' } };
  const sheet = makeSheet(BASE);
  const config = { app_title: 'x', flag_threshold: 0.75 };
  decorateConfigSheet_(sheet, config);

  assert.strictEqual(sheet.calls.appendRow, 0, 'no row appended for a placeholder URL');
  assert.strictEqual(sheet.calls.setFormula, 0, 'no formula written for a placeholder URL');
  assert.ok(sheet.data.every(r => r[0] !== 'web_form'), 'no web_form row exists yet');
  global.COURSE = { urls: { form: LINK, mainGuide: GUIDE } };
}

// ── A stale note is refreshed; a current one is left alone ─────────────
{
  const sheet = makeSheet(BASE);
  const config = { app_title: 'x', flag_threshold: 0.75 };
  const row = 3;                       // flag_threshold
  sheet.notes[row + ':1'] = 'an old explanation';
  decorateConfigSheet_(sheet, config);
  assert.strictEqual(sheet.notes[row + ':1'], CONFIG_NOTES.flag_threshold,
    'an out-of-date note is replaced');
}

// ── A throwing sheet must not take getConfig down ──────────────────────
{
  const exploding = makeSheet(BASE);
  exploding.getLastRow = () => { throw new Error('quota'); };
  assert.doesNotThrow(() => decorateConfigSheet_(exploding, {}),
    'decoration is cosmetic and must never propagate an error');
}

console.log('decorateConfigSheet_: all assertions passed');
