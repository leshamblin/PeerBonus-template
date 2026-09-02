'use strict';
const assert = require('assert');
const code = require('../Code.js');
const { decorateConfigSheet_, CONFIG_LINKS, CONFIG_NOTES } = code;

const LINK    = 'https://script.google.com/a/macros/ncsu.edu/s/AKfycbxABC/exec';
const GUIDE   = 'https://docs.google.com/document/d/1abc/edit';
const REFL    = 'https://drive.google.com/drive/folders/1reflectionsFolderId';
const SUMM    = 'https://drive.google.com/drive/folders/1summaryFolderId';
const LINK_KEYS = CONFIG_LINKS.map(l => l.key);

// Minimal stand-in for a Sheet: rows of [key, value], plus per-cell notes.
// A cell whose contents start with "=" is a formula, exactly as Sheets sees it,
// so getFormulas() can hand the decorator what is really in the value column.
// Every API call is counted so "read-only when idle" is measured, not assumed.
function makeSheet(rows) {
  const data = rows.map(r => r.slice());
  const notes = {};
  const calls = { getLastRow: 0, getValues: 0, getFormulas: 0, getNote: 0, setNote: 0, setFormula: 0, appendRow: 0 };
  return {
    calls,
    data,
    notes,
    getLastRow() { calls.getLastRow++; return data.length; },
    appendRow(row) { calls.appendRow++; data.push(row.slice()); },
    getRange(row, col, numRows) {
      const slice = () => data.slice(row - 1, row - 1 + (numRows || 1));
      return {
        getValues() {
          calls.getValues++;
          return slice().map(r => [r[col - 1]]);
        },
        getFormulas() {
          calls.getFormulas++;
          return slice().map(r => {
            const v = r[col - 1];
            return [typeof v === 'string' && v.charAt(0) === '=' ? v : ''];
          });
        },
        setFormula(f) { calls.setFormula++; data[row - 1][col - 1] = f; },
        getNote() { calls.getNote++; return notes[row + ':' + col] || ''; },
        setNote(n) { calls.setNote++; notes[row + ':' + col] = n; }
      };
    }
  };
}

const keysOf = sheet => sheet.data.map(r => r[0]);
const valueOf = (sheet, key) => {
  const row = sheet.data.filter(r => r[0] === key)[0];
  return row ? row[1] : undefined;
};

// COURSE lives in config.js, which Node does not load. Code.js reads it through
// courseUrl_, so define it here to drive the link rows.
const FULL_URLS = { form: LINK, mainGuide: GUIDE, reflections: REFL, summary: SUMM };
global.COURSE = { urls: Object.assign({}, FULL_URLS) };

const BASE = [
  ['Key', 'Value'],
  ['app_title', 'x'],
  ['flag_threshold', 0.75]
];

// ── Fresh sheet: every link row is appended and the note is set ─────────
{
  const sheet = makeSheet(BASE);
  const config = { app_title: 'x', flag_threshold: 0.75 };
  decorateConfigSheet_(sheet, config);

  const keys = keysOf(sheet);
  LINK_KEYS.forEach(key => {
    assert.ok(keys.indexOf(key) > 0, key + ' row was added');
  });

  assert.strictEqual(valueOf(sheet, 'web_form'),
    '=HYPERLINK("' + LINK + '","Go to Web Form")',
    'the formula landed in the value cell of its OWN row');
  assert.strictEqual(valueOf(sheet, 'documentation'),
    '=HYPERLINK("' + GUIDE + '","Go to Documentation")',
    'the second link did not overwrite the first');
  assert.strictEqual(valueOf(sheet, 'reflection_folder_id'),
    '=HYPERLINK("' + REFL + '","Go to Reflections Folder")',
    'the reflections folder shows titled text, not a raw URL');
  assert.strictEqual(valueOf(sheet, 'summary_folder_id'),
    '=HYPERLINK("' + SUMM + '","Go to Summary Folder")',
    'the summary folder shows titled text, not a raw URL');

  const noteRow = keys.indexOf('flag_threshold') + 1;
  assert.strictEqual(sheet.notes[noteRow + ':1'], CONFIG_NOTES.flag_threshold,
    'the note went on the flag_threshold KEY cell');
}

// ── The links sit together at the BOTTOM, below the plain config keys ───
{
  const sheet = makeSheet(BASE.concat([['grading_mode', 'bonus_ratio']]));
  decorateConfigSheet_(sheet, {});

  const keys = keysOf(sheet);
  const lastPlain = keys.reduce((acc, k, i) =>
    (i > 0 && LINK_KEYS.indexOf(k) < 0 ? i : acc), 0);
  LINK_KEYS.forEach(key => {
    assert.ok(keys.indexOf(key) > lastPlain,
      key + ' sits below every plain config key');
  });
  assert.deepStrictEqual(keys.slice(lastPlain + 1), LINK_KEYS,
    'the link block is contiguous and in table order');
}

// ── A linkified folder row still resolves to its URL, not its label ─────
// This is the whole hazard: getValues() on a =HYPERLINK cell returns the
// display text, so a naive linkification would leave the app looking for a
// Drive folder called "Go to Reflections Folder".
{
  const sheet = makeSheet(BASE);
  const config = {};
  decorateConfigSheet_(sheet, config);

  assert.strictEqual(config.reflection_folder_id, REFL,
    'the config carries the folder URL, not the link text');
  assert.strictEqual(config.summary_folder_id, SUMM,
    'the summary folder likewise');
  assert.strictEqual(code.folderIdFromConfig_(config.reflection_folder_id),
    '1reflectionsFolderId',
    'and it still resolves to a usable folder ID');
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
  LINK_KEYS.forEach(key => {
    assert.strictEqual(sheet.data.filter(r => r[0] === key).length, 1,
      key + ' was not duplicated');
  });
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
  assert.strictEqual(rows[0][1], '=HYPERLINK("' + LINK + '","Go to Web Form")',
    'the formula was written into the existing row');
}

// ── Migration: a raw folder URL already in the sheet becomes a link ─────
// setupFolders used to write the bare URL. Those rows are upgraded in place —
// the row keeps its position, only the cell contents change.
{
  const sheet = makeSheet([
    ['Key', 'Value'],
    ['app_title', 'x'],
    ['reflection_folder_id', REFL],
    ['flag_threshold', 0.75]
  ]);
  const config = { app_title: 'x', reflection_folder_id: REFL, flag_threshold: 0.75 };
  decorateConfigSheet_(sheet, config);

  assert.strictEqual(keysOf(sheet).indexOf('reflection_folder_id'), 2,
    'the existing row was upgraded where it sits, not moved or duplicated');
  assert.strictEqual(valueOf(sheet, 'reflection_folder_id'),
    '=HYPERLINK("' + REFL + '","Go to Reflections Folder")',
    'the raw URL became a titled link');
  assert.strictEqual(config.reflection_folder_id, REFL,
    'and the config still carries the URL');
}

// ── Migration: a bare folder ID (oldest courses) links up too ───────────
{
  const BARE = '1u2Awm2vtcfTwU6caQdXq2j_Ju5ohL1du';
  const sheet = makeSheet(BASE.concat([['summary_folder_id', BARE]]));
  const config = { summary_folder_id: BARE };
  decorateConfigSheet_(sheet, config);

  assert.strictEqual(valueOf(sheet, 'summary_folder_id'),
    '=HYPERLINK("https://drive.google.com/drive/folders/' + BARE + '","Go to Summary Folder")',
    'a bare ID is expanded into a real Drive URL before linking');
  assert.strictEqual(config.summary_folder_id,
    'https://drive.google.com/drive/folders/' + BARE,
    'and the app gets a URL it can resolve');
}

// ── Junk in the cell is not dressed up as a link ────────────────────────
// Expanding anything at all into ".../folders/<whatever>" would produce a link
// that looks clickable and 404s. Only something shaped like a Drive ID is
// expanded; the rest falls back to config.js.
{
  const sheet = makeSheet(BASE.concat([['summary_folder_id', 'TBD']]));
  const config = { summary_folder_id: 'TBD' };
  decorateConfigSheet_(sheet, config);

  assert.strictEqual(valueOf(sheet, 'summary_folder_id'),
    '=HYPERLINK("' + SUMM + '","Go to Summary Folder")',
    'an unusable cell falls back to the config.js URL');
}

// ── ...and with no fallback either, the row is left completely alone ────
{
  global.COURSE = { urls: { form: LINK, mainGuide: GUIDE } };
  const sheet = makeSheet(BASE.concat([['summary_folder_id', 'TBD']]));
  const config = { summary_folder_id: 'TBD' };
  decorateConfigSheet_(sheet, config);

  assert.strictEqual(valueOf(sheet, 'summary_folder_id'), 'TBD',
    'nothing to link to means the instructor\'s own text is not overwritten');
  assert.strictEqual(config.summary_folder_id, 'TBD', 'and the value is untouched');
  global.COURSE = { urls: Object.assign({}, FULL_URLS) };
}

// ── Migration: stale lowercase link text is brought into line ───────────
// Live course sheets carry "go to web form" from before this pass. The
// capitalization fix has to reach them, so a link whose text is out of date is
// rewritten — while an already-correct one stays untouched (steady state above).
{
  const sheet = makeSheet(BASE.concat([
    ['web_form', '=HYPERLINK("' + LINK + '","go to web form")']
  ]));
  const config = {};
  decorateConfigSheet_(sheet, config);

  assert.strictEqual(sheet.data.filter(r => r[0] === 'web_form').length, 1,
    'the stale row was rewritten, not duplicated');
  assert.strictEqual(valueOf(sheet, 'web_form'),
    '=HYPERLINK("' + LINK + '","Go to Web Form")',
    'the old lowercase label was corrected in place');
}

// ── An instructor's own URL wins over config.js ─────────────────────────
// Set Up Output Folders writes the folder the course actually uses. That must
// beat a stale COURSE.urls value copied forward from another semester.
{
  const MINE = 'https://drive.google.com/drive/folders/1theRealOne';
  const sheet = makeSheet(BASE.concat([['reflection_folder_id', MINE]]));
  const config = { reflection_folder_id: MINE };
  decorateConfigSheet_(sheet, config);

  assert.strictEqual(valueOf(sheet, 'reflection_folder_id'),
    '=HYPERLINK("' + MINE + '","Go to Reflections Folder")',
    'the sheet\'s own folder URL is the one linked');
  assert.strictEqual(config.reflection_folder_id, MINE, 'and the one the app uses');
}

// ── An unfilled URL adds nothing and writes nothing ────────────────────
{
  global.COURSE = { urls: {
    form:        '[WEB_APP_EXEC_URL]',
    mainGuide:   '[FULL_INSTRUCTOR_GUIDE_DOC_URL]',
    reflections: '[REFLECTIONS_FOLDER_URL]',
    summary:     '[SUMMARY_FOLDER_URL]'
  } };
  const sheet = makeSheet(BASE);
  const config = { app_title: 'x', flag_threshold: 0.75 };
  decorateConfigSheet_(sheet, config);

  assert.strictEqual(sheet.calls.appendRow, 0, 'no row appended for a placeholder URL');
  assert.strictEqual(sheet.calls.setFormula, 0, 'no formula written for a placeholder URL');
  LINK_KEYS.forEach(key => {
    assert.ok(sheet.data.every(r => r[0] !== key), 'no ' + key + ' row exists yet');
  });
  global.COURSE = { urls: Object.assign({}, FULL_URLS) };
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
