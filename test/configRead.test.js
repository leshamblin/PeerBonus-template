'use strict';
// getConfig's formula-aware read, end to end.
//
// The Config sheet's folder rows are LINKS the app follows, not decoration.
// getValues() on a =HYPERLINK cell returns its display text, so getConfig has
// to pull the URL out of the formula instead. decorateConfig.test.js pins the
// writing half; this pins the reading half, against the real getConfig, with
// just enough of Apps Script faked to run it.
const assert = require('assert');
const code = require('../Code.js');
const { getConfig, folderIdFromConfig_ } = code;

const FOLDER_ID = '1u2Awm2vtcfTwU6caQdXq2j_Ju5ohL1du';
const REFL = 'https://drive.google.com/drive/folders/' + FOLDER_ID;
const EXEC = 'https://script.google.com/a/macros/ncsu.edu/s/AKfycbxABC/exec';

global.COURSE = {
  label: 'BUS 462 (601)',
  subtitle: 'Business Strategy',
  gradingMode: 'bonus_ratio',
  flagThreshold: 0.75,
  urls: { form: EXEC }
};

// A cache that never hits, so every call exercises the real read path.
const stored = {};
global.CacheService = {
  getScriptCache() {
    return { get() { return null; }, put(k, v) { stored[k] = v; } };
  }
};

function makeSpreadsheet(rows) {
  const data = rows.map(r => r.slice());
  const notes = {};
  const cell = (row, col) => ({
    getValues() { return [[data[row - 1][col - 1]]]; },
    setFormula(f) { data[row - 1][col - 1] = f; },
    setValue(v) { data[row - 1][col - 1] = v; },
    getNote() { return notes[row + ':' + col] || ''; },
    setNote(n) { notes[row + ':' + col] = n; }
  });
  const asFormula = v => (typeof v === 'string' && v.charAt(0) === '=' ? v : '');
  // getValues() on a formula cell yields what Sheets DISPLAYS, which for a
  // HYPERLINK is the link text — the whole reason this test exists.
  const displayed = v => {
    const m = asFormula(v).match(/,\s*"((?:[^"]|"")*)"\s*\)\s*$/);
    return m ? m[1].replace(/""/g, '"') : v;
  };
  const sheet = {
    data,
    notes,
    getLastRow() { return data.length; },
    appendRow(row) { data.push(row.slice()); },
    getDataRange() {
      return {
        getValues() { return data.map(r => [r[0], displayed(r[1])]); },
        getFormulas() { return data.map(r => ['', asFormula(r[1])]); }
      };
    },
    getRange(row, col, numRows) {
      if (!numRows || numRows === 1) return cell(row, col);
      const slice = data.slice(row - 1, row - 1 + numRows);
      return {
        getValues() { return slice.map(r => [r[col - 1]]); },
        getFormulas() { return slice.map(r => [asFormula(r[col - 1])]); }
      };
    }
  };
  return { getSheetByName: name => (name === 'Config' ? sheet : null), sheet };
}

// ── A linkified folder row resolves to its folder, not its label ────────
{
  const ss = makeSpreadsheet([
    ['Key', 'Value'],
    ['app_title', 'BUS 462 Peer Evaluation'],
    ['admin_whitelist', 'prof@x.edu'],
    ['reflection_folder_id', '=HYPERLINK("' + REFL + '","Go to Reflections Folder")']
  ]);
  const config = getConfig(ss);

  assert.strictEqual(config.reflection_folder_id, REFL,
    'the URL came from the formula, not the "Go to Reflections Folder" text');
  assert.strictEqual(folderIdFromConfig_(config.reflection_folder_id), FOLDER_ID,
    'and generateTeamReflectionDocs can still find the folder');
  assert.strictEqual(config.app_title, 'BUS 462 Peer Evaluation',
    'ordinary rows are unaffected');
}

// ── A raw URL still works: older course sheets are not broken ───────────
{
  const ss = makeSpreadsheet([
    ['Key', 'Value'],
    ['app_title', 'x'],
    ['summary_folder_id', REFL]
  ]);
  const config = getConfig(ss);
  assert.strictEqual(folderIdFromConfig_(config.summary_folder_id), FOLDER_ID,
    'a pre-link course sheet keeps resolving');
}

// ── A bare ID still works: oldest course sheets are not broken ──────────
{
  const ss = makeSpreadsheet([
    ['Key', 'Value'],
    ['app_title', 'x'],
    ['reflection_folder_id', FOLDER_ID]
  ]);
  const config = getConfig(ss);
  assert.strictEqual(folderIdFromConfig_(config.reflection_folder_id), FOLDER_ID,
    'a bare ID keeps resolving');
}

// ── The link block lands at the bottom of a freshly seeded sheet ────────
{
  const ss = makeSpreadsheet([['Key', 'Value']]);
  getConfig(ss);

  const keys = ss.sheet.data.map(r => r[0]).slice(1);
  assert.deepStrictEqual(keys, [
    'app_title', 'app_subtitle', 'intro_text', 'admin_whitelist',
    'grading_mode', 'flag_threshold',
    'web_form'
  ], 'the six settings come first, then the link block — no folder key stranded mid-sheet');
  assert.strictEqual(ss.sheet.data[ss.sheet.data.length - 1][1],
    '=HYPERLINK("' + EXEC + '","Go to Web Form")',
    'and the one link whose URL is known is written as a titled link');
}

console.log('getConfig formula-aware read: all assertions passed');
