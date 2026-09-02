// ── Allocation rules ───────────────────────────────────────────────────────
// Mirrored in Index.html (computeEvenSplit / updateFooter). Change both.
//
// A reviewer distributes BONUS_BUDGET among their teammates in bills, so
// every share is a multiple of SMALLEST_BILL. $1,000 does not divide by 3 at
// any precision — not in $10 bills, not in $1 bills, not even to the cent
// (333.33 × 3 = 999.99) — so on 3, 6 or 7 teammates a remainder is
// unavoidable. It is donated to charity rather than dumped on one teammate.
// That last part was a real bug: the odd $10 used to go to whoever sorted
// first, which put their bonus ratio at 1.02 and everyone else's at 0.99, so
// surname order moved final grades by a point. Singles were added so the
// remainder is $1 rather than $10 and nobody needs to think about it.
const BONUS_BUDGET   = 1000;
const MAX_PER_PERSON = 1000;

// Must equal min(DENOMS) in Index.html. Pinned by test/evenSplit.test.js so
// the two cannot drift; adding or removing a denomination means changing both.
const SMALLEST_BILL  = 1;

// The identical share each of n teammates receives from an even split.
function evenShare_(budget, n) {
  if (!(n > 0)) return 0;
  return Math.floor(Math.floor(budget / SMALLEST_BILL) / n) * SMALLEST_BILL;
}

// What an even split cannot place, and therefore goes to charity. Always less
// than n × SMALLEST_BILL — one more bill each would have been distributable.
function charityRemainder_(budget, n) {
  if (!(n > 0)) return 0;
  return budget - evenShare_(budget, n) * n;
}

// The submitted total a reviewer with n teammates is allowed to send.
// Returns null when acceptable, or an error string. Kept free of
// SpreadsheetApp so it can be unit-tested under Node.
function validateAllocationTotal_(totalScore, n) {
  const budget  = BONUS_BUDGET;
  const minimum = evenShare_(budget, n) * n;

  if (totalScore > budget) {
    return `Submission rejected: total cannot exceed $${budget.toLocaleString()} (got $${totalScore.toLocaleString()}).`;
  }
  if (totalScore < minimum) {
    const charity = budget - minimum;
    return charity > 0
      ? `Submission rejected: you must distribute at least $${minimum.toLocaleString()} (got $${totalScore.toLocaleString()}). Only the $${charity.toLocaleString()} that cannot be split evenly among ${n} teammates may be left to charity.`
      : `Submission rejected: total must equal $${budget.toLocaleString()} (got $${totalScore.toLocaleString()}). $${budget.toLocaleString()} divides evenly among ${n} teammates, so nothing should be left over.`;
  }
  return null;
}

function gradebookUrl_(ss) {
  const baseUrl = ss.getUrl();
  const gb = ss.getSheetByName('Gradebook');
  if (!gb) return baseUrl;
  return baseUrl.replace(/#.*$/, '') + '#gid=' + gb.getSheetId();
}

/**
 * Decide which slice of the roster a viewer is allowed to see.
 * Returns { mode, rosterData } where mode is one of:
 *   'team'   — their own team
 *   'demo'   — the Testdata team, for admins previewing the student experience
 *   'noTeam' — on the roster but with no team assignment
 *   'denied' — not on the roster at all
 */
function resolveRosterView_(fullRoster, userEmail, isAdmin) {
  const email = String(userEmail || '').trim().toLowerCase();
  const currentUser = fullRoster.find(
    p => String(p.email || '').trim().toLowerCase() === email);

  if (currentUser && hasTeam_(currentUser.section)) {
    return {
      mode: 'team',
      rosterData: fullRoster.filter(p => p.section === currentUser.section)
    };
  }
  if (isAdmin) {
    // Admins off the roster — and admins ON it with no team, since registrar
    // rosters routinely list the instructor — are scoped to the Testdata team
    // so they preview the student experience instead of landing in a phantom
    // team built from everyone whose team cell happens to be blank.
    return {
      mode: 'demo',
      rosterData: fullRoster.filter(p => isTestTeam_(p.section))
    };
  }
  if (currentUser) {
    return { mode: 'noTeam', rosterData: [] };
  }
  return { mode: 'denied', rosterData: [] };
}

function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = getConfig(ss);

  const spreadsheetUrl = gradebookUrl_(ss);
  const userEmail = Session.getActiveUser().getEmail();
  const whitelistString = config.admin_whitelist || '';
  const admins = whitelistString.split(',').map(e => e.trim().toLowerCase());
  const isAdmin = admins.includes(userEmail.trim().toLowerCase());

  const fullRoster = getRoster(ss);
  const view = resolveRosterView_(fullRoster, userEmail, isAdmin);
  const rosterData = view.rosterData;
  const userFound = view.mode !== 'denied';
  const noTeam = view.mode === 'noTeam';

  // Check if already submitted
  let hasSubmitted = false;
  const responseSheet = ss.getSheetByName('Responses');
  if (responseSheet && responseSheet.getLastRow() > 1) {
    const emails = responseSheet.getRange(2, 2, responseSheet.getLastRow() - 1, 1).getValues();
    hasSubmitted = emails.some(row => row[0].toString().toLowerCase().trim() === userEmail.trim().toLowerCase());
  }

  template.config = config;
  template.userEmail = userEmail.trim();
  template.isAdmin = isAdmin;
  template.userFound = userFound;
  template.noTeam = noTeam;
  template.hasSubmitted = hasSubmitted;
  template.spreadsheetUrl = spreadsheetUrl;
  template.rosterData = JSON.stringify(rosterData).replace(/</g, '\\u003c');
  template.execUrl = ScriptApp.getService().getUrl();

  // Diagnostic data — consulted by the Access Denied and No Team screens.
  if (!userFound || noTeam) {
    const requesterEmail = userEmail.trim().toLowerCase();
    const rosterEmails = fullRoster.map(p => p.email.toLowerCase()).filter(e => e);
    // Suggest the closest roster match by simple prefix/substring scoring.
    const localPart = requesterEmail.split('@')[0] || '';
    const domain = requesterEmail.split('@')[1] || '';
    const scored = rosterEmails.map(e => {
      let score = 0;
      if (e === requesterEmail) score = 100;
      else if (e.split('@')[1] === domain && e.startsWith(localPart.charAt(0))) score = 50;
      else if (e.split('@')[1] === domain) score = 25;
      else if (e.split('@')[0] === localPart) score = 30;
      return { email: e, score: score };
    }).sort((a, b) => b.score - a.score);
    template.diagEmail = requesterEmail;
    template.diagAdmins = admins.filter(a => a);
    template.diagRosterCount = rosterEmails.length;
    template.diagClosest = scored.slice(0, 5).map(s => s.email);
  } else {
    template.diagEmail = '';
    template.diagAdmins = [];
    template.diagRosterCount = 0;
    template.diagClosest = [];
  }

  return template.evaluate()
    .setTitle(config.app_title || 'Peer Evaluation')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getConfig(ss) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('config');
  if (cached) return JSON.parse(cached);
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Config');

  const defaults = [
    ['app_title',              '💵 ' + COURSE.label + ': Peer Evaluation'],
    ['app_subtitle',           COURSE.subtitle],
    ['intro_text',             'Please complete both parts of this evaluation before the deadline.'],
    ['admin_whitelist',        ''],
    ['grading_mode',           COURSE.gradingMode || 'bonus_ratio'],
    ['flag_threshold',         (COURSE.flagThreshold != null ? COURSE.flagThreshold : 0.75)]
  ];

  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.appendRow(['Key', 'Value']);
    defaults.forEach(row => sheet.appendRow(row));
  }

  const range = sheet.getDataRange();
  const data = range.getValues();
  // A =HYPERLINK cell reads back through getValues() as its DISPLAY TEXT, so a
  // link row's real URL has to come from the formula. This is not cosmetic:
  // reflection_folder_id and summary_folder_id are links the app follows, and
  // without this the reflection docs would go looking for a Drive folder named
  // "Go to Reflections Folder".
  const formulas = range.getFormulas();
  const config = {};
  const present = {};
  for (let i = 1; i < data.length; i++) {
    const key = data[i][0];
    const value = data[i][1];
    if (key) {
      const k = key.toString().trim();
      const linked = configLinkUrl_(formulas[i] ? formulas[i][1] : '');
      config[k] = linked || value;
      present[k] = true;
    }
  }
  // Append any genuinely-missing default keys, keyed on ROW PRESENCE, not on a
  // falsy value. Checking `!config[key]` treated an intentionally-blank value
  // (admin_whitelist) as missing and appended a fresh empty row on every cache
  // miss; the trailing empty row then overrode the real value on the next read.
  // Presence-check makes it idempotent.
  //
  // The link keys are deliberately absent from `defaults`: decorateConfigSheet_
  // appends them below, which is what keeps them together in one block at the
  // bottom of the sheet. reflection_folder_id used to sit here and landed in
  // the middle.
  defaults.forEach(([key, val]) => {
    if (!present[key]) {
      config[key] = val;
      sheet.appendRow([key, val]);
      present[key] = true;
    }
  });
  decorateConfigSheet_(sheet, config);

  cache.put('config', JSON.stringify(config), 300);
  return config;
}

/** Idempotent Config-sheet decoration: the CONFIG_LINKS block at the bottom of
 *  the sheet and the hover notes. Both are checked against what the cell
 *  already holds, so a cache miss (every 5 min) does not turn into a write.
 *  Never throws — a cosmetic touch must not take the app down.
 *
 *  Not purely cosmetic in one respect: the two folder rows are links the app
 *  follows, so the URL written here is also what getConfig caches. */
function decorateConfigSheet_(sheet, config) {
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    // One read of the key column drives both the links and the notes. Row
    // numbers must come from here rather than from getConfig's earlier read:
    // getConfig appends any missing default keys before calling us, so a count
    // taken before that would point setFormula at the wrong cell.
    const keys = sheet.getRange(1, 1, lastRow, 1).getValues();
    const formulas = sheet.getRange(1, 2, lastRow, 1).getFormulas();
    const rowOf = {};
    for (let i = 1; i < keys.length; i++) {
      const k = String(keys[i][0] || '').trim();
      if (k && !(k in rowOf)) rowOf[k] = i + 1;
    }

    // ── Link rows ──────────────────────────────────────────────────────
    CONFIG_LINKS.forEach(function (link) {
      const url = link.url(config);
      const formula = configLinkFormula_(url, link.text);
      if (!formula) return;   // URL not filled in yet — try again next time

      const row = rowOf[link.key];
      // Keyed on the FORMULA already in the cell, not on row presence and not
      // on the value. Presence alone would skip forever a row whose setFormula
      // failed after appendRow (they are separate calls) or whose cell an
      // instructor cleared by hand. Reading the formula also lets a row that
      // predates a wording change — every live course sheet still says "go to
      // web form" — be corrected in place. An up-to-date sheet still writes
      // nothing.
      const current = (row && formulas[row - 1]) ? String(formulas[row - 1][0] || '').trim() : '';
      if (row && current === formula) {
        config[link.key] = url;
        return;
      }

      if (row) {
        sheet.getRange(row, 2).setFormula(formula);
      } else {
        sheet.appendRow([link.key, '']);
        const added = sheet.getLastRow();
        sheet.getRange(added, 2).setFormula(formula);
        rowOf[link.key] = added;
      }
      // The URL, not link.text — these keys are read by the app, and whatever
      // lands here is what getConfig caches for the next five minutes.
      config[link.key] = url;
    });

    // ── Hover notes on the key cells ───────────────────────────────────
    Object.keys(CONFIG_NOTES).forEach(function (key) {
      const row = rowOf[key];
      if (!row) return;
      const cell = sheet.getRange(row, 1);
      if (cell.getNote() !== CONFIG_NOTES[key]) cell.setNote(CONFIG_NOTES[key]);
    });
  } catch (err) {
    console.error('decorateConfigSheet_ skipped: ' + err);
  }
}

function getRoster(ss) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('roster');
  if (cached) return JSON.parse(cached);
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Roster');
  if (!sheet) {
    sheet = ss.insertSheet('Roster');
    sheet.appendRow(['First Name', 'Last Name', 'Email', 'Team']);
    return [];
  }
  const data = sheet.getDataRange().getValues();
  const roster = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[0] && row[1]) {
      roster.push({
        firstName: row[0],
        lastName:  row[1],
        email:     row[2] ? row[2].toString().trim() : '',
        section:   row[3] ? row[3].toString().trim() : '',
        fullName:  `${row[0]} ${row[1]}`
      });
    }
  }
  cache.put('roster', JSON.stringify(roster), 300);
  return roster;
}

function submitPeerEval(data) {
  try {
    const submitterEmail = Session.getActiveUser().getEmail().trim().toLowerCase();
    const roster = getRoster();
    const config = getConfig();
    const admins = (config.admin_whitelist || '').split(',').map(e => e.trim().toLowerCase());
    const isAdmin = admins.includes(submitterEmail);
    const isInRoster = roster.some(p => p.email.toLowerCase() === submitterEmail);

    if (!isInRoster && !isAdmin) {
      return { success: false, error: 'Submission rejected: you are not listed in the course roster.' };
    }

    const submitterRow = roster.find(p => p.email.toLowerCase() === submitterEmail);

    // A rostered non-admin with no team has no legitimate teammates to review.
    // This is the "instructor has not fixed it yet" case; it says so plainly
    // rather than the generic rejection below.
    if (submitterRow && !isAdmin && !hasTeam_(submitterRow.section)) {
      return { success: false, error: 'Submission rejected: you do not have a team assignment yet. Please contact your instructor.' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Responses');
    if (sheet && sheet.getLastRow() > 1) {
      const emails = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
      if (emails.some(row => row[0].toString().toLowerCase().trim() === submitterEmail)) {
        return { success: false, error: 'You have already submitted a peer evaluation. Please contact your instructor if you need to make a change.' };
      }
    }

    if (!data || !Array.isArray(data.teammates) || data.teammates.length === 0) {
      return { success: false, error: 'Submission rejected: invalid data structure.' };
    }

    // Recipients come from the client and are written straight into Responses,
    // so they must be checked against the roster before anything is recorded.
    const recipientError = validateRecipients_(data.teammates, roster, submitterEmail, isAdmin);
    if (recipientError) return { success: false, error: recipientError };

    // Validate reflections
    const r = data.reflections || {};
    for (let i = 1; i <= 5; i++) {
      if (!r['q'+i] || r['q'+i].trim() === '') {
        return { success: false, error: `Submission rejected: Team Reflection question ${i} is required.` };
      }
    }

    // Validate scores
    let totalScore = 0;
    for (const t of data.teammates) {
      if (typeof t.firstName !== 'string' || t.firstName.trim() === '') {
        return { success: false, error: 'Submission rejected: teammate missing first name.' };
      }
      const score = Number(t.score);
      if (isNaN(score) || score < 0) {
        return { success: false, error: 'Submission rejected: scores must be non-negative numbers.' };
      }
      if (!t.comment || t.comment.trim() === '') {
        return { success: false, error: `Submission rejected: a comment is required for ${t.firstName}.` };
      }
      totalScore += score;
    }

    // Allocation rules live in validateAllocationTotal_ at the top of this
    // file, mirrored in Index.html. A reviewer must distribute everything an
    // even split can place; only the unsplittable remainder goes to charity.
    const totalError = validateAllocationTotal_(totalScore, data.teammates.length);
    if (totalError) {
      return { success: false, error: totalError };
    }
    for (const t of data.teammates) {
      const score = Number(t.score) || 0;
      if (score > MAX_PER_PERSON) {
        return { success: false, error: `Submission rejected: no single teammate may receive more than $${MAX_PER_PERSON.toLocaleString()} (${t.firstName} got $${score.toLocaleString()}).` };
      }
    }

    const MAX_TEXT = 5000;
    for (let i = 1; i <= 5; i++) {
      if ((r['q'+i] || '').length > MAX_TEXT) {
        return { success: false, error: 'Submission rejected: a response exceeds the maximum length.' };
      }
    }

    if (!sheet) {
      sheet = ss.insertSheet('Responses');
      sheet.appendRow([
        'Timestamp', 'Reviewer Email', 'Reviewer First', 'Reviewer Last',
        'Recipient Email', 'Recipient First', 'Recipient Last',
        'Score', 'Comment',
        'Q1 Team Effectiveness', 'Q2 Valuable/Detrimental', 'Q3 Improvement',
        'Q4 Learned from Team', 'Q5 Carry Forward'
      ]);
    }

    const timestamp = new Date();
    const submitter = roster.find(p => p.email.toLowerCase() === submitterEmail) || { firstName: '', lastName: '' };

    // Build all rows up front and write them in one setValues call — one
    // round-trip instead of N appendRow calls.
    const rows = data.teammates.map(t => [
      timestamp,
      submitterEmail,
      submitter.firstName,
      submitter.lastName,
      (t.email || '').toString().trim(),
      t.firstName.trim(),
      t.lastName.trim(),
      Number(t.score),
      t.comment.trim(),
      r.q1.trim(),
      r.q2.trim(),
      r.q3.trim(),
      r.q4.trim(),
      r.q5.trim()
    ]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

    // Commit writes, then schedule the gradebook regen on a one-time trigger
    // so submit returns immediately. The regen runs ~1s later in the background.
    SpreadsheetApp.flush();
    scheduleRegen_();

    return { success: true, gradebookUrl: gradebookUrl_(ss) };

  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function clearCache() {
  CacheService.getScriptCache().removeAll(['config', 'roster']);
  notify_(uiOrNull_(), 'Cache cleared. The next page load will re-read config and roster from the sheet.');
}

function onOpen() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Hide the Set Up Sheet item once all three required tabs exist, so the
  // instructor can't accidentally click it on a populated Sheet.
  const isSetUp = ['Config', 'Roster', 'Responses']
    .every(name => !!ss.getSheetByName(name));

  const menu = SpreadsheetApp.getUi().createMenu('Peer Eval Admin');

  if (!isSetUp) {
    menu.addItem('🚀 Set Up Sheet (first run)', 'setupSheet').addSeparator();
  }

  menu
    .addItem('Generate Summary Docs (smart)', 'generateSummaryDocs')
    .addItem('Regenerate All Summary Docs', 'generateSummaryDocsForced')
    .addSeparator()
    .addItem('Generate Team Reflection Docs', 'generateTeamReflectionDocs')
    .addSeparator()
    .addItem('📊 Generate Gradebook', 'generateGradebook')
    .addSeparator()
    .addItem('🔄 Reset Generation Log', 'resetGenerationLog')
    .addItem('🧪 Generate Test Data', 'generateTestData')
    .addItem('🧹 Clear Test Data', 'clearTestData')
    .addSeparator()
    .addItem('📁 Set Up Output Folders', 'setupFolders')
    .addSeparator()
    .addItem('🗂️ Clear App Cache', 'clearCache')
    .addToUi();
}

// SpreadsheetApp.getUi() exists only in a container UI context — a menu click
// or onOpen. Anywhere else it throws "Cannot call SpreadsheetApp.getUi() from
// this context." That includes the editor's Run button, which is how the
// first-run functions get called on a fresh copy: the sheet is created empty by
// `clasp create`, so the Peer Eval Admin menu doesn't exist until the sheet is
// reloaded after the first push. Take the UI defensively and report through the
// execution log when there isn't one. Same shape as generateGradebook().
function uiOrNull_() {
  try { return SpreadsheetApp.getUi(); } catch (_) { return null; }
}

// Report to whoever is watching: an alert when there's a UI, the execution log
// when there isn't. `message` is optional — most menu handlers alert a single
// string rather than a title/body pair.
function notify_(ui, title, message) {
  if (ui) {
    if (message == null) ui.alert(title);
    else                 ui.alert(title, message, ui.ButtonSet.OK);
  } else {
    Logger.log(message == null ? title : title + '\n\n' + message);
  }
}

// For actions that must not run unconfirmed. No UI means nobody to confirm
// with, so the caller declines instead of proceeding — deleting data because
// the confirmation dialog happened to be unavailable is the one outcome worse
// than throwing.
function requireUi_(actionName) {
  const ui = uiOrNull_();
  if (!ui) {
    Logger.log(actionName + ' needs the sheet menu: it asks for confirmation ' +
               'before deleting anything, and this context has no UI. Nothing was changed.');
  }
  return ui;
}

/**
 * First-run setup: creates Config (with defaults), Roster (empty with headers),
 * and Responses (empty with headers) tabs if they don't already exist. Idempotent —
 * safe to re-run; existing tabs are left alone.
 *
 * Runnable from the Apps Script editor as well as the menu (see uiOrNull_).
 */
function setupSheet() {
  const ui = uiOrNull_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const created = [];
  const existed = [];

  // Config: getConfig() auto-creates with defaults if missing.
  const hadConfig = !!ss.getSheetByName('Config');
  getConfig();
  hadConfig ? existed.push('Config') : created.push('Config');

  // Roster: getRoster() auto-creates with header if missing.
  const hadRoster = !!ss.getSheetByName('Roster');
  getRoster();
  hadRoster ? existed.push('Roster') : created.push('Roster');

  // Responses: not auto-created elsewhere. Create with proper header row.
  let resp = ss.getSheetByName('Responses');
  if (!resp) {
    resp = ss.insertSheet('Responses');
    resp.appendRow([
      'Timestamp', 'Reviewer Email', 'Reviewer Name', 'Section',
      'Recipient Email', 'Recipient Name', 'Recipient Section',
      'Score ($)', 'Comment',
      'Reflection Q1', 'Reflection Q2', 'Reflection Q3', 'Reflection Q4', 'Reflection Q5'
    ]);
    resp.getRange(1, 1, 1, 14)
      .setFontWeight('bold').setBackground('#cc0000').setFontColor('#ffffff');
    resp.setFrozenRows(1);
    created.push('Responses');
  } else {
    existed.push('Responses');
  }

  let msg = '';
  if (created.length) msg += 'Created tabs: ' + created.join(', ') + '.\n\n';
  if (existed.length) msg += 'Already existed (left alone): ' + existed.join(', ') + '.\n\n';
  msg += 'Next steps:\n' +
         '1. Open the Roster tab and paste in your class roster (First Name, Last Name, Email, Team).\n' +
         '2. Optionally edit Config values (app_title, instructions, instructors).\n' +
         '3. Deploy the web app: Deploy → New deployment → Web app.';
  notify_(ui, 'Setup complete', msg);
}

// Config may store a Drive folder as a full URL (the default written by
// setupFolders) or as a bare ID (older courses). Normalize to the bare folder
// ID so DriveApp.getFolderById() works either way.
function folderIdFromConfig_(value) {
  const v = (value || '').toString().trim();
  if (!v) return '';
  let m = v.match(/\/folders\/([a-zA-Z0-9_-]+)/);   // .../drive/folders/<id>
  if (m) return m[1];
  m = v.match(/[?&]id=([a-zA-Z0-9_-]+)/);            // ...open?id=<id>
  if (m) return m[1];
  return v;                                          // already a bare ID
}

/** Put a folder URL in a Config value cell as a titled link when we can, as
 *  the raw URL when we cannot. Set Up Output Folders runs long before config.js
 *  has any URLs in it, so this is what makes the folder links show up without
 *  waiting on a clasp push. The raw-URL fallback keeps the cell usable if the
 *  link text ever goes missing — getConfig reads either shape. */
function writeConfigLinkCell_(sheet, row, key, url) {
  const formula = configLinkFormula_(url, configLinkText_(key));
  if (formula) sheet.getRange(row, 2).setFormula(formula);
  else sheet.getRange(row, 2).setValue(url);
}

// Also runnable from the editor — see uiOrNull_.
function setupFolders() {
  const ui = uiOrNull_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const ssFile = DriveApp.getFileById(ss.getId());
  const parents = ssFile.getParents();
  const parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();

  // Summary docs folder
  const summaryName = COURSE.label + ' Peer Eval Summaries';
  let summaryFolder, summaryCreated = false;
  const existingSummary = parentFolder.getFoldersByName(summaryName);
  if (existingSummary.hasNext()) {
    summaryFolder = existingSummary.next();
  } else {
    summaryFolder = parentFolder.createFolder(summaryName);
    summaryCreated = true;
  }

  // Reflections folder
  const reflectionsName = 'Reflections';
  let reflectionsFolder, reflectionsCreated = false;
  const existingReflections = parentFolder.getFoldersByName(reflectionsName);
  if (existingReflections.hasNext()) {
    reflectionsFolder = existingReflections.next();
  } else {
    reflectionsFolder = parentFolder.createFolder(reflectionsName);
    reflectionsCreated = true;
  }

  // Update folder IDs in Config sheet
  const configSheet = ss.getSheetByName('Config');
  if (configSheet) {
    const data = configSheet.getDataRange().getValues();
    const toUpdate = {
      'reflection_folder_id': 'https://drive.google.com/drive/folders/' + reflectionsFolder.getId(),
      'summary_folder_id':    'https://drive.google.com/drive/folders/' + summaryFolder.getId()
    };
    const found = { 'reflection_folder_id': false, 'summary_folder_id': false };
    for (let i = 1; i < data.length; i++) {
      const key = (data[i][0] || '').toString().trim();
      if (toUpdate[key] !== undefined) {
        writeConfigLinkCell_(configSheet, i + 1, key, toUpdate[key]);
        found[key] = true;
      }
    }
    Object.entries(toUpdate).forEach(([key, val]) => {
      if (!found[key]) {
        configSheet.appendRow([key, '']);
        writeConfigLinkCell_(configSheet, configSheet.getLastRow(), key, val);
      }
    });
  }

  const lines = [
    (summaryCreated ? '✅ Created' : '• Already existed') + ': ' + summaryName,
    (reflectionsCreated ? '✅ Created' : '• Already existed') + ': ' + reflectionsName,
    '\nConfig updated with links to both folders.'
  ];
  notify_(ui, '📁 Folders ready', lines.join('\n'));
}

// Pure, side-effect-free row builder for the flag-only grading mode.
// Kept free of SpreadsheetApp so it can be unit-tested under Node.
function buildFlagOnlyRows_(sorted, sectionSize, scoresReceived, submitters, flagThreshold) {
  const pct = Math.round(flagThreshold * 100);
  const rows = [];
  const flags = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const email = (p.email || '').toLowerCase();
    const section = (p.section || 'Unknown').toString().trim();
    const teamSize = sectionSize[section] || 0;
    const scores = scoresReceived[email] || [];
    const reviewsCount = scores.length;
    const avgBonus = reviewsCount ? scores.reduce((a, b) => a + b, 0) / reviewsCount : 0;
    const equalShare = evenShare_(BONUS_BUDGET, teamSize - 1);
    const bonusRatio = equalShare > 0 ? avgBonus / equalShare : 0;
    const flagged = reviewsCount > 0 && equalShare > 0 && bonusRatio < flagThreshold;
    const submitted = submitters.has(email) ? 'Yes' : 'No';
    rows.push([
      section, p.lastName, p.firstName, teamSize, // A-D
      reviewsCount,                               // E
      Math.round(avgBonus),                       // F
      Math.round(equalShare),                     // G
      '',                                         // H: ratio formula (set in builder)
      submitted,                                  // I
      flagged ? ('⚠ Below ' + pct + '% of even split') : '', // J: Flag
      100,                                        // K: Grade (A)
      '',                                         // L: Override
      ''                                          // M: Final Grade formula (set in builder)
    ]);
    flags.push(flagged);
  }
  return { rows: rows, flags: flags };
}

function generateGradebook(silent) {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (_) { /* no UI in web app context */ }
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const config = getConfig(ss);
  const roster = gradebookRoster_(
    getRoster(),
    (config.admin_whitelist || '').split(','));

  if (roster.length === 0) {
    if (ui && !silent) ui.alert('No roster data found. Please populate the Roster sheet first.');
    return;
  }

  // ── Count team sizes ───────────────────────────────────────────────────────
  const sectionSize = {};
  roster.forEach(p => {
    const sec = (p.section || 'Unknown').toString().trim();
    sectionSize[sec] = (sectionSize[sec] || 0) + 1;
  });

  // ── Read responses ─────────────────────────────────────────────────────────
  const responseSheet = ss.getSheetByName('Responses');
  const submitters    = new Set();
  const scoresReceived = {};  // recipient email -> [scores]

  if (responseSheet && responseSheet.getLastRow() > 1) {
    const data = responseSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const reviewerEmail  = (data[i][1] || '').toString().trim().toLowerCase();
      const recipientEmail = (data[i][4] || '').toString().trim().toLowerCase();
      const score          = Number(data[i][7]);
      if (reviewerEmail)  submitters.add(reviewerEmail);
      if (recipientEmail) {
        if (!scoresReceived[recipientEmail]) scoresReceived[recipientEmail] = [];
        if (!isNaN(score)) scoresReceived[recipientEmail].push(score);
      }
    }
  }

  // ── Build or clear Gradebook sheet ────────────────────────────────────────
  let gb = ss.getSheetByName('Gradebook');
  if (gb) { gb.clear(); } else { gb = ss.insertSheet('Gradebook'); }

  // ── Sort roster (shared by both modes) ────────────────────────────────────
  const sorted = [...roster].sort((a, b) => {
    const ta = isNaN(a.section) ? a.section : Number(a.section);
    const tb = isNaN(b.section) ? b.section : Number(b.section);
    if (ta < tb) return -1; if (ta > tb) return 1;
    return a.lastName.localeCompare(b.lastName);
  });

  // ── Dispatch on grading mode ──────────────────────────────────────────────
  const mode = (config.grading_mode || 'bonus_ratio').toString().trim();
  const flagThreshold = Number(config.flag_threshold) || 0.75;

  if (mode === 'flag_only') {
    buildGradebook_flagOnly_(gb, sorted, sectionSize, scoresReceived, submitters, flagThreshold);
  } else {
    buildGradebook_bonusRatio_(gb, sorted, sectionSize, scoresReceived, submitters);
  }

  // ── Shared tail ───────────────────────────────────────────────────────────
  gb.setFrozenRows(1);
  const n = sorted.length;
  const noteRow = n + 3;
  gb.getRange(noteRow, 1, 1, 4).merge()
    .setValue(`Generated: ${new Date().toLocaleString()}  |  ${n} students  |  ${submitters.size} submitted`)
    .setFontColor('#888888').setFontStyle('italic').setFontSize(9);

  if (!silent) ss.setActiveSheet(gb);
  if (ui && !silent) ui.alert(`Gradebook generated — ${n} students, ${submitters.size} submitted (mode: ${mode}).`);
}

function buildGradebook_bonusRatio_(gb, sorted, sectionSize, scoresReceived, submitters) {
  // ── Headers ────────────────────────────────────────────────────────────────
  // A=Team B=Last C=First D=TeamSize
  // E=ReviewsRcvd F=AvgBonus($) G=EqualShare($) H=BonusRatio
  // I=Submitted J=Grade(formula) K=Override L=FinalGrade(formula)
  const headers = [
    'Team', 'Last Name', 'First Name', 'Team Size',
    'Reviews Received', 'Avg Bonus Received ($)', 'Equal Share ($)', 'Bonus Ratio (F ÷ G)',
    'Submitted', 'Grade',
    'Override', 'Final Grade'
  ];
  gb.appendRow(headers);
  gb.getRange(1, 1, 1, headers.length)
    .setBackground('#cc0000').setFontColor('#ffffff')
    .setFontWeight('bold').setHorizontalAlignment('center');

  // Hover note on Bonus Ratio header — explains how column H is calculated.
  gb.getRange(1, 8).setNote(
    'Bonus Ratio = Avg Bonus Received (col F) ÷ Equal Share (col G)\n\n' +
    '• Equal Share = $1,000 ÷ (team size − 1)\n' +
    '  The per-teammate amount if a reviewer distributed evenly.\n\n' +
    '• Avg Bonus Received = mean of dollars this student got, across the teammates who actually reviewed them.\n\n' +
    'Interpretation:\n' +
    '  Ratio = 1.0  →  teammates valued this student at the equal-share level on average\n' +
    '  Ratio > 1.0  →  above equal share (bonus)\n' +
    '  Ratio < 1.0  →  below equal share\n\n' +
    'The Grade (col J) is then MIN(100, ROUND(Bonus Ratio × 100, 1)).'
  );

  // Note on Final Grade header
  gb.getRange(1, 12).setNote(
    'Final Grade formula: =IF(I="No", 0, IF(K<>"", K, J))\n\n' +
    '1. If the student did NOT submit (Submitted = "No"):\n' +
    '   → Grade is 0.\n\n' +
    '2. If Override (col K) has a value:\n' +
    '   → Use the Override.\n\n' +
    '3. Otherwise:\n' +
    '   → Grade = MIN(100, ROUND(Bonus Ratio × 100, 1)).\n\n' +
    'BONUS RATIO METHOD (no imputation):\n' +
    '• Avg Bonus Received = mean of dollars this student got, across the teammates who actually reviewed them.\n' +
    '• Equal Share = $1,000 ÷ (team size − 1), the per-teammate amount if a reviewer distributed evenly.\n' +
    '• Bonus Ratio = Avg Bonus Received ÷ Equal Share.\n' +
    '  Ratio of 1.0 means teammates valued you at the equal-share level on average.\n' +
    '  > 1.0 = above equal share; < 1.0 = below.\n' +
    '• Non-submitting teammates simply don\'t enter the average — they neither help nor hurt your grade.'
  );

  // ── Build output rows ──────────────────────────────────────────────────────
  // Grade = MIN(100, ROUND(BonusRatio × 100, 1))
  //   where BonusRatio = avgBonusReceived / equalShare
  //         equalShare = the share Split Evenly hands one teammate — see
  //                      evenShare_. NOT $1,000 ÷ (teamSize − 1): on a team of
  //                      four that is $333.33, which no whole number of bills
  //                      can hit, so an even split would score 99.99 and a
  //                      clean 100 would be unreachable.
  //         avgBonusReceived = mean of dollars received from teammates who reviewed
  // Non-submitters get grade 0. Non-submitting teammates simply don't show up in
  // the avg — no imputation needed.
  const outputRows = sorted.map(p => {
    const email    = p.email.toLowerCase();
    const section  = (p.section || 'Unknown').toString().trim();
    const teamSize = sectionSize[section] || 0;
    const scores   = scoresReceived[email] || [];
    const reviewsCount = scores.length;
    const avgBonus = reviewsCount > 0
      ? scores.reduce((a, b) => a + b, 0) / reviewsCount
      : 0;
    const equalShare = evenShare_(BONUS_BUDGET, teamSize - 1);
    const submitted = submitters.has(email) ? 'Yes' : 'No';

    return [section, p.lastName, p.firstName, teamSize,
            reviewsCount,             // E: Reviews Received
            Math.round(avgBonus),     // F: Avg Bonus Received ($)
            Math.round(equalShare),   // G: Equal Share ($)
            '',                       // H: Bonus Ratio — formula below
            submitted,                // I: Submitted
            '',                       // J: Grade — formula below
            '',                       // K: Override
            ''];                      // L: Final Grade — formula below
  });

  if (outputRows.length > 0) {
    gb.getRange(2, 1, outputRows.length, 12).setValues(outputRows);
  }

  // ── Formulas (batch) ───────────────────────────────────────────────────────
  if (outputRows.length > 0) {
    const n = outputRows.length;
    // H: Bonus Ratio = AvgBonus / EqualShare  (guard div-by-zero)
    gb.getRange(2, 8, n, 1).setFormulas(
      Array.from({length: n}, (_, i) => {
        const r = i + 2;
        return [`=IFERROR(F${r}/G${r}, 0)`];
      })
    );
    // J: Grade = MIN(100, ROUND(BonusRatio × 100, 1))
    gb.getRange(2, 10, n, 1).setFormulas(
      Array.from({length: n}, (_, i) => {
        const r = i + 2;
        return [`=ROUND(MIN(100, H${r}*100), 1)`];
      })
    );
    // L: Final Grade — 0 for non-submitters, Override if set, else Grade
    gb.getRange(2, 12, n, 1).setFormulas(
      Array.from({length: n}, (_, i) => {
        const r = i + 2;
        return [`=IF(I${r}="No", 0, IF(K${r}<>"", K${r}, J${r}))`];
      })
    );
  }

  // ── Formatting ─────────────────────────────────────────────────────────────
  const n = outputRows.length;

  gb.setColumnWidth(1, 70);   // Team
  gb.setColumnWidth(2, 130);  // Last Name
  gb.setColumnWidth(3, 120);  // First Name
  gb.setColumnWidth(4, 80);   // Team Size
  gb.setColumnWidth(5, 110);  // Reviews Received
  gb.setColumnWidth(6, 150);  // Avg Bonus Received
  gb.setColumnWidth(7, 110);  // Equal Share
  gb.setColumnWidth(8, 100);  // Bonus Ratio
  gb.setColumnWidth(9, 90);   // Submitted
  gb.setColumnWidth(10, 80);  // Grade
  gb.setColumnWidth(11, 130); // Override
  gb.setColumnWidth(12, 100); // Final Grade

  if (n > 0) {
    // Submitted (I=9): green/red — batch the per-row colors so we hit Sheets
    // 3 times total instead of 4×n times.
    const submittedRange = gb.getRange(2, 9, n, 1);
    submittedRange.setHorizontalAlignment('center').setFontWeight('bold');
    const submittedBgs = outputRows.map(r => [r[8] === 'Yes' ? '#d4edda' : '#f8d7da']);
    const submittedFgs = outputRows.map(r => [r[8] === 'Yes' ? '#155724' : '#721c24']);
    submittedRange.setBackgrounds(submittedBgs);
    submittedRange.setFontColors(submittedFgs);

    // Apply alignment + number formats to the numeric band (D..J) in a single
    // contiguous range, then targeted number formats per column.
    gb.getRange(2, 4, n, 7).setHorizontalAlignment('center');                              // D..J center
    gb.getRange(2, 6, n, 1).setNumberFormat('$#,##0');                                    // F: Avg Bonus
    gb.getRange(2, 7, n, 1).setNumberFormat('$#,##0');                                    // G: Equal Share
    gb.getRange(2, 8, n, 1).setNumberFormat('0.00');                                      // H: Bonus Ratio
    gb.getRange(2, 10, n, 1).setNumberFormat('0.0');                                      // J: Grade
    gb.getRange(2, 11, n, 1).setBackground('#fffbe6');                                    // K: Override yellow
    gb.getRange(2, 12, n, 1).setFontWeight('bold').setHorizontalAlignment('center');      // L: Final Grade

    // Alternating-row backgrounds (A..D) — one batched setBackgrounds instead
    // of n/2 separate setBackground calls.
    const altBgs = outputRows.map((_, i) => {
      const c = (i % 2 === 1) ? '#f8f8f8' : '#ffffff';
      return [c, c, c, c];
    });
    gb.getRange(2, 1, n, 4).setBackgrounds(altBgs);
  }
}

function buildGradebook_flagOnly_(gb, sorted, sectionSize, scoresReceived, submitters, flagThreshold) {
  const pct = Math.round(flagThreshold * 100);

  // ── Headers: A..M ──
  const headers = [
    'Team', 'Last Name', 'First Name', 'Team Size',
    'Reviews Received', 'Avg Bonus Received ($)', 'Equal Share ($)', 'Bonus Ratio (F ÷ G)',
    'Submitted', 'Flag', 'Grade', 'Override', 'Final Grade'
  ];
  gb.appendRow(headers);
  gb.getRange(1, 1, 1, headers.length)
    .setBackground('#cc0000').setFontColor('#ffffff')
    .setFontWeight('bold').setHorizontalAlignment('center');

  gb.getRange(1, 10).setNote(
    'Flag = "⚠ Below ' + pct + '% of even split" when a student was reviewed and\n' +
    'valued below ' + pct + '% of the even split (Bonus Ratio < ' + flagThreshold + ').\n\n' +
    'A flag is a "look here", NOT a penalty. Every student still earns 100 (A).\n' +
    'Non-submitters and students who received no reviews are never flagged.\n' +
    'To lower a flagged student, type a number in Override (col L).'
  );
  gb.getRange(1, 13).setNote(
    'Final Grade = IF(Override<>"", Override, 100).\n\n' +
    'Everyone earns 100 (A). Not submitting a review never lowers the grade.\n' +
    'The only signal is the Flag (col J); acting on it is the instructor\'s call\n' +
    'via Override (col L).'
  );

  // ── Rows (pure builder from Task 1) ──
  const built = buildFlagOnlyRows_(sorted, sectionSize, scoresReceived, submitters, flagThreshold);
  const outputRows = built.rows;
  const flags = built.flags;
  const n = outputRows.length;
  if (n > 0) gb.getRange(2, 1, n, 13).setValues(outputRows);

  // ── Formulas: H (ratio display), M (final grade) ──
  if (n > 0) {
    gb.getRange(2, 8, n, 1).setFormulas(
      Array.from({length: n}, (_, i) => ['=IFERROR(F' + (i + 2) + '/G' + (i + 2) + ', 0)'])
    );
    gb.getRange(2, 13, n, 1).setFormulas(
      Array.from({length: n}, (_, i) => ['=IF(L' + (i + 2) + '<>"", L' + (i + 2) + ', K' + (i + 2) + ')'])
    );
  }

  // ── Column widths ──
  gb.setColumnWidth(1, 70);  gb.setColumnWidth(2, 130); gb.setColumnWidth(3, 120);
  gb.setColumnWidth(4, 80);  gb.setColumnWidth(5, 110); gb.setColumnWidth(6, 150);
  gb.setColumnWidth(7, 110); gb.setColumnWidth(8, 100); gb.setColumnWidth(9, 90);
  gb.setColumnWidth(10, 210); gb.setColumnWidth(11, 70); gb.setColumnWidth(12, 130);
  gb.setColumnWidth(13, 100);

  if (n > 0) {
    // Submitted (I=9): informational green/red.
    const submittedRange = gb.getRange(2, 9, n, 1);
    submittedRange.setHorizontalAlignment('center').setFontWeight('bold');
    submittedRange.setBackgrounds(outputRows.map(r => [r[8] === 'Yes' ? '#d4edda' : '#f8d7da']));
    submittedRange.setFontColors(outputRows.map(r => [r[8] === 'Yes' ? '#155724' : '#721c24']));

    // Flag (J=10): red fill on flagged rows only.
    const flagRange = gb.getRange(2, 10, n, 1);
    flagRange.setFontWeight('bold');
    flagRange.setBackgrounds(flags.map(f => [f ? '#f8d7da' : '#ffffff']));
    flagRange.setFontColors(flags.map(f => [f ? '#721c24' : '#000000']));

    // Numeric band + formats.
    gb.getRange(2, 4, n, 5).setHorizontalAlignment('center'); // D..H
    gb.getRange(2, 6, n, 1).setNumberFormat('$#,##0');        // F
    gb.getRange(2, 7, n, 1).setNumberFormat('$#,##0');        // G
    gb.getRange(2, 8, n, 1).setNumberFormat('0.00');          // H
    gb.getRange(2, 11, n, 1).setHorizontalAlignment('center'); // K Grade
    gb.getRange(2, 12, n, 1).setBackground('#fffbe6');         // L Override
    gb.getRange(2, 13, n, 1).setFontWeight('bold').setHorizontalAlignment('center'); // M Final

    // Alternating row backgrounds A..D.
    const altBgs = outputRows.map((_, i) => {
      const c = (i % 2 === 1) ? '#f8f8f8' : '#ffffff';
      return [c, c, c, c];
    });
    gb.getRange(2, 1, n, 4).setBackgrounds(altBgs);
  }
}

function regenerateGradebookSafe_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return; // someone else is regenerating; their result will reflect ours too
  try {
    generateGradebook(true);
  } catch (e) {
    console.error('Auto-regen gradebook failed: ' + e);
  } finally {
    lock.releaseLock();
  }
}

/** Schedule a deferred Gradebook regen so submitPeerEval / clearTestDataFromWeb
 *  can return immediately. The trigger fires ~1 second after creation, runs
 *  on GAS infrastructure (not blocking the user), and is the only pending one
 *  at any moment because we clean up prior ones first.
 *
 *  Triggers have a hard limit of 20 per script per user, so cleanup is not
 *  optional. If trigger creation fails, fall back to synchronous regen so the
 *  Gradebook still updates rather than going stale. */
function scheduleRegen_() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'regenerateGradebookSafe_') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    ScriptApp.newTrigger('regenerateGradebookSafe_')
      .timeBased()
      .after(1000)
      .create();
  } catch (e) {
    console.error('scheduleRegen_ failed, falling back to sync: ' + e);
    regenerateGradebookSafe_();
  }
}

/** Team labels that count as test data — Responses + Roster rows in these
 *  teams are deleted by clearTestData() and overwritten by generateTestData(). */
const TEST_TEAM_LABELS = ['testdata', 'team testdata', '0', 'team 0'];
function isTestTeam_(label) {
  return TEST_TEAM_LABELS.indexOf(String(label || '').trim().toLowerCase()) >= 0;
}

/** Who a submitter is allowed to review, enforced server-side.
 *  Recipients arrive from the client, so a stale tab — or anyone willing to
 *  craft a request — can otherwise record dollars for people who are not on
 *  the submitter's team, or for themselves. The allowed set comes from
 *  resolveRosterView_, the same rule doGet used to build their form, so the
 *  two can never drift apart.
 *  Returns null when the submission is acceptable, else a message for the
 *  student. The message deliberately names no other roster member. */
function validateRecipients_(teammates, roster, submitterEmail, isAdmin) {
  const REJECT = 'Submission rejected: it lists teammates who are not on your ' +
                 'team. Your page may be out of date — please reload and try ' +
                 'again. If it keeps happening, contact your instructor.';

  if (!Array.isArray(teammates) || teammates.length === 0) {
    return 'Submission rejected: no teammates to review.';
  }

  const me = String(submitterEmail || '').trim().toLowerCase();
  const view = resolveRosterView_(roster, me, isAdmin);
  if (view.mode === 'denied' || view.mode === 'noTeam') return REJECT;

  const allowed = {};
  view.rosterData.forEach(function (p) {
    const e = String(p.email || '').trim().toLowerCase();
    if (e && e !== me) allowed[e] = true;
  });

  const seen = {};
  for (let i = 0; i < teammates.length; i++) {
    const t = teammates[i] || {};
    const e = String(t.email == null ? '' : t.email).trim().toLowerCase();
    if (!e || !allowed[e] || seen[e]) return REJECT;
    seen[e] = true;
  }
  return null;
}

/** Hover notes for Config keys, applied to the key cell (column A).
 *  Instructors read the Config tab without the README in front of them. */
const CONFIG_NOTES = {
  flag_threshold:
    'Only used when grading_mode is "flag_only".\n\n' +
    'Each student\'s average peer bonus is compared to an even split of $1,000 ' +
    'across their teammates (a team of 4 -> $333 each). Anyone who received ' +
    'less than this fraction of an even share is flagged for your review.\n\n' +
    '0.75 flags students below 75% of an even share.\n\n' +
    'Ignored in "bonus_ratio" mode.'
};

/** Read one COURSE.urls entry defensively. Apps Script shares a global scope
 *  across files so COURSE is always there at runtime, but a course copy with a
 *  malformed config.js — or a Node test requiring Code.js on its own — must
 *  degrade to "no link" rather than throw inside getConfig. */
function courseUrl_(name) {
  try {
    if (typeof COURSE === 'undefined' || !COURSE || !COURSE.urls) return '';
    return COURSE.urls[name] || '';
  } catch (err) {
    return '';
  }
}

/** Clickable rows the Config sheet grows once the matching URL exists in
 *  config.js. The URL is read through a function so COURSE.urls is consulted
 *  when the row is written, not when this file loaded. Add a row here to add
 *  a link. */
const CONFIG_LINKS = [
  { key: 'web_form',
    url:  function () { return courseUrl_('form'); },
    text: 'Go to Web Form' },
  { key: 'documentation',
    url:  function () { return courseUrl_('mainGuide'); },
    text: 'Go to Documentation' },
  { key: 'reflection_folder_id',
    url:  function (config) { return folderLinkUrl_(config, 'reflection_folder_id', 'reflections'); },
    text: 'Go to Reflections Folder' },
  { key: 'summary_folder_id',
    url:  function (config) { return folderLinkUrl_(config, 'summary_folder_id', 'summary'); },
    text: 'Go to Summary Folder' }
];

/** Where a folder link should point. The Config sheet wins over config.js: it
 *  holds the folder "Set Up Output Folders" actually created for THIS course,
 *  which is right from the moment that menu item runs — before COURSE.urls has
 *  been filled in, and even when a stale URL was carried forward from another
 *  semester. A bare ID (oldest courses) is expanded so it can still be linked;
 *  anything that is not recognizably a Drive ID falls through to config.js
 *  rather than becoming a link to nowhere. */
function folderLinkUrl_(config, key, courseUrlName) {
  const v = String((config && config[key]) || '').trim();
  if (v.indexOf('https://') === 0) return v;
  const id = folderIdFromConfig_(v);
  if (/^[A-Za-z0-9_-]{20,}$/.test(id)) {
    return 'https://drive.google.com/drive/folders/' + id;
  }
  return courseUrl_(courseUrlName);
}

/** The link text CONFIG_LINKS gives a key, for callers that write a link cell
 *  themselves (setupFolders). '' for a key that is not a link row. */
function configLinkText_(key) {
  for (let i = 0; i < CONFIG_LINKS.length; i++) {
    if (CONFIG_LINKS[i].key === key) return CONFIG_LINKS[i].text;
  }
  return '';
}

/** Build a Config sheet HYPERLINK. Returns null when the URL is still a
 *  config.js placeholder or is otherwise not a real https link — a link that
 *  looks clickable and goes nowhere is worse than no link, so the row simply
 *  appears on its own once the real URL is filled in and pushed. */
function configLinkFormula_(url, text) {
  const u = String(url == null ? '' : url).trim();
  if (u.indexOf('https://') !== 0) return null;
  // A literal " inside a Sheets formula string is escaped by doubling it.
  const esc = function (v) { return String(v).replace(/"/g, '""'); };
  return '=HYPERLINK("' + esc(u) + '","' + esc(text) + '")';
}

/** Recover the URL a Config link cell points at — the inverse of
 *  configLinkFormula_. Returns '' for anything that is not a link cell, so the
 *  caller falls back to the plain value and a raw URL or bare folder ID left
 *  over from an older course keeps working. */
function configLinkUrl_(formula) {
  const f = String(formula == null ? '' : formula).trim();
  const m = f.match(/^=\s*HYPERLINK\s*\(\s*"((?:[^"]|"")*)"/i);
  if (!m) return '';
  // Undo the doubling configLinkFormula_ applied.
  return m[1].replace(/""/g, '"');
}

/** A blank, whitespace-only or missing team cell means "not assigned yet" —
 *  never a team. Grouping blanks together would make unassigned students look
 *  like a real team to each other. */
function hasTeam_(label) {
  return String(label == null ? '' : label).trim() !== '';
}

/** Roster rows that belong in the Gradebook.
 *  Drops whitelisted admins who have no team — course staff swept in by a
 *  registrar export, who would otherwise appear as zero-scored students.
 *  An admin WITH a team (e.g. a TA on a project team) is a real participant
 *  and is kept; silently dropping them would lose a graded person. */
function gradebookRoster_(roster, adminEmails) {
  const admins = (adminEmails || [])
    .map(e => String(e || '').trim().toLowerCase())
    .filter(e => e);
  if (admins.length === 0) return roster.slice();
  return roster.filter(p => {
    const email = String(p.email || '').trim().toLowerCase();
    return !(admins.indexOf(email) >= 0 && !hasTeam_(p.section));
  });
}

/**
 * Wipe and recreate test data. Idempotent — re-running it produces the same
 * end state. Three sample members live in the Roster under team "Testdata"
 * and review each other so the gradebook has something to show even before the
 * admin walks through the form. A whitelisted admin previewing the app is the
 * fourth person, allocating their $1,000 across the three teammates.
 *
 * When the admin walks through and submits, their allocations get averaged
 * into each recipient's bonus and shift the grades accordingly.
 */
function generateTestData() {
  const ui = uiOrNull_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const respSheet = ss.getSheetByName('Responses');
  const rosterSheet = ss.getSheetByName('Roster');
  if (!respSheet || !rosterSheet) {
    notify_(ui, 'Run "🚀 Set Up Sheet" first.');
    return;
  }

  const TEST_TEAM = 'Testdata';

  // ── Wipe existing test rows from both Responses and Roster (bottom-up) ──
  let respDeleted = 0;
  const respData = respSheet.getDataRange().getValues();
  for (let i = respData.length - 1; i >= 1; i--) {
    if (isTestTeam_(respData[i][3])) {
      respSheet.deleteRow(i + 1);
      respDeleted++;
    }
  }
  let rosterDeleted = 0;
  const rosterData = rosterSheet.getDataRange().getValues();
  for (let i = rosterData.length - 1; i >= 1; i--) {
    if (isTestTeam_(rosterData[i][3])) {
      rosterSheet.deleteRow(i + 1);
      rosterDeleted++;
    }
  }

  // ── Test team members (just two — Estrella and Borja) ───────────────────
  const team = [
    { firstName: 'Alice', lastName: 'Estrella',  email: 'alice.test@ncsu.edu', team: TEST_TEAM },
    { firstName: 'Borja', lastName: 'Fernandez', email: 'borja.test@ncsu.edu', team: TEST_TEAM },
    { firstName: 'Chris', lastName: 'Nguyen',    email: 'chris.test@ncsu.edu', team: TEST_TEAM },
  ];
  team.forEach(m => rosterSheet.appendRow([m.firstName, m.lastName, m.email, m.team]));

  // ── Mutual reviews ───────────────────────────────────────────────────────
  // Team size 3: each reviewer splits their $1,000 across the other two.
  // [reviewerIdx, recipientIdx, amount, comment]
  const reviewMatrix = [
    [0, 1, 600,
      "Borja owned the financial model. Every assumption was sourced, and the sensitivities held up under questioning in our internal review."],
    [0, 2, 400,
      "Chris turned our rough competitive notes into a clean, well-cited analysis and caught two errors in the market sizing before we submitted."],
    [1, 0, 500,
      "Alice was the glue: built the timeline, ran every meeting, and rewrote half the deck in the final 48 hours. Truly exceptional ownership."],
    [1, 2, 500,
      "Chris stayed calm under pressure and reworked the recommendation section twice without complaint. The final framing was mostly Chris's."],
    [2, 0, 450,
      "Alice kept the whole team organized and unblocked. Nothing slipped, because Alice was tracking all of it."],
    [2, 1, 550,
      "Borja did the heavy quantitative lifting and patiently walked the rest of us through the model so we could defend it."],
  ];

  // Unique 5-question reflection set for each reviewer.
  const reflections = {
    alice: [
      'We held weekly Zoom sessions and used Notion for shared notes; meeting cadence was the strongest part of our process.',
      'Disagreements were rare and we resolved them by talking through the data rather than escalating.',
      'In hindsight, we should have invested more in primary research before drafting strategy.',
      'I gained confidence reading balance sheets and ESG disclosures from real companies.',
      'Next time I would push for clearer role assignments in week one, not week three.'
    ],
    borja: [
      'Tuesday standups in person, Slack threads between — that combination kept us moving without overcommunicating.',
      'We tend to talk over each other in synchronous calls, so the team that wrote async generally produced the cleaner work.',
      'The competitive-analysis section deserved more time and more external sources than we gave it.',
      'I learned how to compress 80-page annual reports into two-paragraph executive summaries without losing the load-bearing facts.',
      'A pre-mortem at the project midpoint would have caught the coordination gaps we hit in week four.'
    ],
    chris: [
      'We split into a quant track and a narrative track early, then merged weekly; that division of labor was the strongest part of our process.',
      'When we disagreed we defaulted to whoever had the data in front of them, which kept debates short and evidence-based.',
      'Looking back, we underestimated how long the competitive analysis would take and should have started it in week one.',
      'I got a lot more comfortable pressure-testing a financial model and asking what has to be true for a plan to work.',
      'Next time I would set explicit page and source targets for each section up front so scope did not creep.'
    ],
  };
  const reflKey = ['alice', 'borja', 'chris'];

  const now = new Date();
  const newRows = reviewMatrix.map(([rIdx, cIdx, amount, comment]) => {
    const reviewer = team[rIdx];
    const recipient = team[cIdx];
    const r = reflections[reflKey[rIdx]];
    return [
      now,
      reviewer.email,
      reviewer.firstName + ' ' + reviewer.lastName,
      reviewer.team,
      recipient.email,
      recipient.firstName + ' ' + recipient.lastName,
      recipient.team,
      amount,
      comment,
      r[0], r[1], r[2], r[3], r[4]
    ];
  });
  respSheet.getRange(respSheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);

  // Clear cached config/roster so the next read picks up the new test members.
  try {
    const cache = CacheService.getScriptCache();
    cache.remove('config');
    cache.remove('roster');
  } catch (_) { /* cache may not be available in all contexts */ }

  const lines = [
    'Cleared:',
    '   • ' + rosterDeleted + ' existing test roster row' + (rosterDeleted !== 1 ? 's' : ''),
    '   • ' + respDeleted + ' existing test response row' + (respDeleted !== 1 ? 's' : ''),
    '',
    'Recreated:',
    '   • 3 roster members under Team "' + TEST_TEAM + '" (Alice Estrella, Borja Fernandez, Chris Nguyen)',
    '   • 6 review rows (each member reviewed both teammates)',
    '',
    'The three already reviewed each other, so the Gradebook is pre-populated.',
    'A whitelisted admin previewing the app becomes the fourth person and',
    'allocates $1,000 across the three teammates; on submit those allocations',
    'average into each recipient\'s bonus.',
    '',
    'To remove later: run "🧹 Clear Test Data".'
  ];
  notify_(ui, 'Test data refreshed', lines.join('\n'));
}

function clearTestData() {
  const ui = requireUi_('Clear Test Data');
  if (!ui) return;
  const result = ui.alert('Clear Test Data',
    'This will delete:\n  • All Testdata team roster entries\n  • All submissions from test-team members or admin users\n  • Any submission that reviewed a test-team member\n\nThen the Gradebook will be regenerated. Are you sure?',
    ui.ButtonSet.YES_NO);
  if (result !== ui.Button.YES) return;
  const r = clearTestDataCore_();
  ui.alert(r.message);
}

/** Admin-only soft reset. Deletes the calling admin's own submission rows
 *  from Responses and regenerates the Gradebook. Leaves the Team Testdata
 *  roster + their mutual reviews intact so the demo can be repeated without
 *  re-running "Generate Test Data". Returns { success, message?, error? }. */
function clearTestDataFromWeb() {
  try {
    const userEmail = Session.getActiveUser().getEmail().trim().toLowerCase();
    const config = getConfig();
    const admins = (config.admin_whitelist || '').split(',').map(e => e.trim().toLowerCase());
    if (!admins.includes(userEmail)) {
      return { success: false, error: 'Not authorized.' };
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName('Responses');
    let deleted = 0;
    if (sh && sh.getLastRow() > 1) {
      // Read both reviewer (col B) and recipient (col E) email columns so we
      // catch any row touching the admin in either role. Test team's mutual
      // reviews (admin not in either column) are left intact.
      const lastRow = sh.getLastRow();
      const reviewers = sh.getRange(2, 2, lastRow - 1, 1).getValues();
      const recipients = sh.getRange(2, 5, lastRow - 1, 1).getValues();
      for (let i = reviewers.length - 1; i >= 0; i--) {
        const reviewerEmail = String(reviewers[i][0] || '').toLowerCase().trim();
        const recipientEmail = String(recipients[i][0] || '').toLowerCase().trim();
        if (reviewerEmail === userEmail || recipientEmail === userEmail) {
          sh.deleteRow(i + 2);
          deleted++;
        }
      }
    }
    SpreadsheetApp.flush();
    scheduleRegen_();
    return {
      success: true,
      message: 'Removed ' + deleted + ' row' + (deleted !== 1 ? 's' : '') + ' tied to your email. Test Team data left intact.'
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function clearTestDataCore_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const responseSheet = ss.getSheetByName('Responses');
  const rosterSheet = ss.getSheetByName('Roster');

  const config = getConfig();
  const admins = (config.admin_whitelist || '').split(',').map(e => e.trim().toLowerCase()).filter(e => e);
  const roster = getRoster();
  const testTeamEmails = roster
    .filter(p => isTestTeam_(p.section))
    .map(p => p.email.toLowerCase());

  const testReviewerEmails = new Set([...admins, ...testTeamEmails]);
  const testRecipientEmails = new Set(testTeamEmails);

  // ── Wipe matching Responses rows (bottom-up to avoid index shifting) ───
  let respDeleted = 0;
  if (responseSheet && responseSheet.getLastRow() > 1) {
    const data = responseSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      const reviewerEmail = (data[i][1] || '').toString().toLowerCase().trim();
      const recipientEmail = (data[i][4] || '').toString().toLowerCase().trim();
      if (testReviewerEmails.has(reviewerEmail) || testRecipientEmails.has(recipientEmail)) {
        responseSheet.deleteRow(i + 1);
        respDeleted++;
      }
    }
  }

  // ── Wipe Team Testdata members from the Roster (bottom-up) ─────────────
  let rosterDeleted = 0;
  if (rosterSheet && rosterSheet.getLastRow() > 1) {
    const rosterData = rosterSheet.getDataRange().getValues();
    for (let i = rosterData.length - 1; i >= 1; i--) {
      if (isTestTeam_(rosterData[i][3])) {
        rosterSheet.deleteRow(i + 1);
        rosterDeleted++;
      }
    }
  }

  // Drop cached roster so getRoster() reflects the wipe immediately
  CacheService.getScriptCache().remove('roster');

  // ── Regenerate the Gradebook so the demo data disappears from view ─────
  let regenNote = '';
  try {
    generateGradebook(true);
    regenNote = '\nGradebook regenerated.';
  } catch (e) {
    regenNote = '\n(Gradebook regen failed: ' + e + ')';
  }

  return {
    responsesDeleted: respDeleted,
    rosterDeleted: rosterDeleted,
    message: 'Done. Removed ' + respDeleted + ' response row' + (respDeleted !== 1 ? 's' : '') +
             ' and ' + rosterDeleted + ' roster row' + (rosterDeleted !== 1 ? 's' : '') + '.' + regenNote
  };
}

function generateSummaryDocs(forceAll) {
  const ui = uiOrNull_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const responseSheet = ss.getSheetByName('Responses');

  if (!responseSheet || responseSheet.getLastRow() <= 1) {
    notify_(ui, 'No responses found in the Responses sheet.');
    return;
  }

  // Load or create DocGenLog: tracks last-generated time per recipient email
  let logSheet = ss.getSheetByName('DocGenLog');
  if (!logSheet) {
    logSheet = ss.insertSheet('DocGenLog');
    logSheet.appendRow(['Email', 'LastGenerated']);
  }
  const logData = logSheet.getDataRange().getValues();
  const lastGenMap = {}; // email -> Date
  const logRowIndex = {};  // email -> 1-based row number in logSheet
  for (let i = 1; i < logData.length; i++) {
    const e = (logData[i][0] || '').toString().toLowerCase().trim();
    if (e) {
      lastGenMap[e] = logData[i][1] instanceof Date ? logData[i][1] : null;
      logRowIndex[e] = i + 1;
    }
  }

  // Get summary folder from Config, falling back to parent-folder search
  const config = getConfig(ss);
  const summaryFolderId = folderIdFromConfig_(config.summary_folder_id || '');
  let summaryFolder;
  if (summaryFolderId) {
    try {
      summaryFolder = DriveApp.getFolderById(summaryFolderId);
    } catch (e) {
      notify_(ui, 'Could not open the summary folder. Check that "summary_folder_id" in the Config sheet is correct and the folder is shared with this account.\n\nFolder ID: ' + summaryFolderId);
      return;
    }
  } else {
    // Fallback: find or create folder next to the spreadsheet
    const ssFile = DriveApp.getFileById(ss.getId());
    const parents = ssFile.getParents();
    const parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
    const folderName = COURSE.label + ' Peer Eval Summaries';
    const existing = parentFolder.getFoldersByName(folderName);
    summaryFolder = existing.hasNext() ? existing.next() : parentFolder.createFolder(folderName);
  }

  // Seed byRecipient from roster
  const roster = getRoster();
  const byRecipient = {};
  roster.forEach(p => {
    if (p.email) {
      byRecipient[p.email.toLowerCase()] = {
        firstName: p.firstName,
        lastName:  p.lastName,
        reviews:   [],
        latestTimestamp: null
      };
    }
  });

  // Read all responses; track latest timestamp per recipient
  const data = responseSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const recipientEmail = (row[4] || '').toString().trim().toLowerCase();
    const reviewerFirst  = (row[2] || '').toString().trim();
    const reviewerLast   = (row[3] || '').toString().trim();
    const score = Number(row[7]);
    const comment = (row[8] || '').toString().trim();
    const rowTimestamp = row[0] instanceof Date ? row[0] : null;

    if (!recipientEmail) continue;

    if (!byRecipient[recipientEmail]) {
      byRecipient[recipientEmail] = {
        firstName: (row[5] || '').toString().trim(),
        lastName:  (row[6] || '').toString().trim(),
        reviews:   [],
        latestTimestamp: null
      };
    }

    byRecipient[recipientEmail].reviews.push({
      reviewerName: `${reviewerFirst} ${reviewerLast}`.trim(),
      score, comment,
      q1: (row[9]  || '').toString().trim(),
      q2: (row[10] || '').toString().trim(),
      q3: (row[11] || '').toString().trim(),
      q4: (row[12] || '').toString().trim(),
      q5: (row[13] || '').toString().trim()
    });

    if (rowTimestamp && (!byRecipient[recipientEmail].latestTimestamp || rowTimestamp > byRecipient[recipientEmail].latestTimestamp)) {
      byRecipient[recipientEmail].latestTimestamp = rowTimestamp;
    }
  }

  let updated = 0, skipped = 0;
  const now = new Date();

  Object.entries(byRecipient).forEach(([email, student]) => {
    const lastGen = lastGenMap[email] || null;
    const latest  = student.latestTimestamp;

    // Skip if: doc was already generated AND no new responses since then AND not forcing
    const hasDoc = !!lastGen;
    const hasNewData = !latest || !lastGen || latest > lastGen;
    if (!forceAll && hasDoc && !hasNewData) {
      skipped++;
      return;
    }

    const fullName = `${student.firstName} ${student.lastName}`.trim() || email;
    const scores   = student.reviews.map(r => r.score);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    const docTitle = `${fullName} — ${COURSE.label} Peer Evaluation Summary`;
    let doc, docFile;
    const existingFiles = summaryFolder.getFilesByName(docTitle);
    if (existingFiles.hasNext()) {
      docFile = existingFiles.next();
      doc = DocumentApp.openById(docFile.getId());
      doc.getBody().clear();
    } else {
      doc = DocumentApp.create(docTitle);
      docFile = DriveApp.getFileById(doc.getId());
      summaryFolder.addFile(docFile);
      DriveApp.getRootFolder().removeFile(docFile);
    }
    const body = doc.getBody();

    body.appendParagraph(fullName).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(COURSE.label + ' — Peer Evaluation Summary').setHeading(DocumentApp.ParagraphHeading.HEADING2);

    const scorePara = body.appendParagraph(`Combined Score (average): $${avgScore.toLocaleString()}`);
    scorePara.setBold(true);
    scorePara.setFontSize(13);

    body.appendParagraph(
      scores.length > 0
        ? `Based on ${scores.length} peer evaluation${scores.length !== 1 ? 's' : ''}.`
        : 'No peer evaluations have been submitted yet.'
    ).setItalic(true);

    body.appendHorizontalRule();
    body.appendParagraph('Individual Feedback').setHeading(DocumentApp.ParagraphHeading.HEADING2);

    if (student.reviews.length === 0) {
      body.appendParagraph('No reviews submitted for this student.').setItalic(true);
    } else {
      student.reviews.forEach((review, idx) => {
        body.appendParagraph(`Reviewer ${idx + 1}: ${review.reviewerName}`).setBold(true).setForegroundColor('#000000');
        body.appendParagraph(`Score: $${review.score.toLocaleString()}`).setForegroundColor('#000000');
        body.appendParagraph('Comments:').setBold(true).setForegroundColor('#000000');
        body.appendParagraph(review.comment || '(No comment provided)').setBold(false).setForegroundColor('#000000');

        if (idx < student.reviews.length - 1) {
          body.appendParagraph('─────────────────────').setFontSize(8).setForegroundColor('#cccccc');
        }
      });
    }

    doc.saveAndClose();

    // Update DocGenLog
    if (logRowIndex[email]) {
      logSheet.getRange(logRowIndex[email], 2).setValue(now);
    } else {
      logSheet.appendRow([email, now]);
      logRowIndex[email] = logSheet.getLastRow();
    }

    updated++;
  });

  const msg = forceAll
    ? `Done! All ${updated} summary doc${updated !== 1 ? 's' : ''} regenerated.`
    : `Done! ${updated} doc${updated !== 1 ? 's' : ''} updated, ${skipped} unchanged and skipped.`;
  notify_(ui, msg);
}

function generateSummaryDocsForced() {
  generateSummaryDocs(true);
}

function resetGenerationLog() {
  const ui = uiOrNull_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName('DocGenLog');
  if (!logSheet) {
    notify_(ui, 'No DocGenLog sheet found — nothing to reset.');
    return;
  }
  if (logSheet.getLastRow() > 1) {
    logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 2).clearContent();
  }
  notify_(ui, 'Generation log cleared. The next "Generate Summary Docs (smart)" run will regenerate all docs.');
}

function generateTeamReflectionDocs() {
  const config = getConfig();
  const FOLDER_ID = folderIdFromConfig_(config.reflection_folder_id || '');
  const ui = uiOrNull_();

  if (!FOLDER_ID) {
    notify_(ui, 'No folder set. Add a "reflection_folder_id" row to the Config sheet with the Google Drive folder URL (or ID) where docs should be saved.');
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const responseSheet = ss.getSheetByName('Responses');

  if (!responseSheet || responseSheet.getLastRow() <= 1) {
    notify_(ui, 'No responses found in the Responses sheet.');
    return;
  }

  const folder = DriveApp.getFolderById(FOLDER_ID);
  const roster = getRoster();

  // Build maps from roster: email -> section, section -> total member count
  const emailToSection = {};
  const sectionSize = {};
  roster.forEach(p => {
    if (!p.email) return;
    emailToSection[p.email.toLowerCase()] = p.section;
    sectionSize[p.section] = (sectionSize[p.section] || 0) + 1;
  });

  // Read responses; group by reviewer's section, deduplicate per reviewer
  // (each reviewer appears once per teammate they rated — Q1-Q5 are the same on every row)
  const data = responseSheet.getDataRange().getValues();
  const bySection = {}; // section -> { email: { name, q1..q5 } }

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const reviewerEmail = (row[1] || '').toString().trim().toLowerCase();
    if (!reviewerEmail) continue;

    const section = emailToSection[reviewerEmail] || 'Unknown';
    if (!bySection[section]) bySection[section] = {};
    if (bySection[section][reviewerEmail]) continue; // already captured this reviewer

    bySection[section][reviewerEmail] = {
      name: `${(row[2] || '').toString().trim()} ${(row[3] || '').toString().trim()}`.trim(),
      q1: (row[9]  || '').toString().trim(),
      q2: (row[10] || '').toString().trim(),
      q3: (row[11] || '').toString().trim(),
      q4: (row[12] || '').toString().trim(),
      q5: (row[13] || '').toString().trim()
    };
  }

  const QUESTIONS = [
    'How effective was your team overall in making progress on this project?',
    'What did your team members do that was most valuable? Was there anything detrimental to group progress?',
    'Suggest at least one change the team could make to improve its performance on the class project.',
    'Give one specific example of something you learned from the team that you probably would not have learned working alone.',
    'What did you learn about working in a team from this project that you will carry into your next team experience?'
  ];

  let count = 0;
  Object.entries(bySection).forEach(([section, reviewers]) => {
    const docTitle = `Team ${section} — ${COURSE.label} Team Reflection`;
    let doc, docFile;
    const existingFiles = folder.getFilesByName(docTitle);
    if (existingFiles.hasNext()) {
      docFile = existingFiles.next();
      doc = DocumentApp.openById(docFile.getId());
      doc.getBody().clear();
    } else {
      doc = DocumentApp.create(docTitle);
      docFile = DriveApp.getFileById(doc.getId());
      folder.addFile(docFile);
      DriveApp.getRootFolder().removeFile(docFile);
    }

    const body = doc.getBody();
    body.appendParagraph(`Team ${section}`).setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(COURSE.label + ' — Team Reflection').setHeading(DocumentApp.ParagraphHeading.HEADING2);

    const reviewerList = Object.values(reviewers);
    const total = sectionSize[section] || reviewerList.length;
    body.appendParagraph(`${reviewerList.length} of ${total} team member${total !== 1 ? 's' : ''} responded.`).setItalic(true);
    body.appendHorizontalRule();

    reviewerList.forEach((reviewer, idx) => {
      body.appendParagraph(reviewer.name).setBold(true).setFontSize(12).setForegroundColor('#000000');

      const answers = [reviewer.q1, reviewer.q2, reviewer.q3, reviewer.q4, reviewer.q5];
      QUESTIONS.forEach((q, qi) => {
        body.appendParagraph(q).setBold(true).setForegroundColor('#000000');
        body.appendParagraph(answers[qi] || '(No response)').setBold(false).setForegroundColor('#000000');
      });

      if (idx < reviewerList.length - 1) {
        body.appendParagraph('─────────────────────').setFontSize(8).setForegroundColor('#cccccc');
      }
    });

    doc.saveAndClose();
    count++;
  });

  notify_(ui, `Done! ${count} team reflection doc${count !== 1 ? 's' : ''} created.`);
}

// Node-only: expose pure helpers for local unit tests. Harmless under GAS.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BONUS_BUDGET: BONUS_BUDGET,
    SMALLEST_BILL: SMALLEST_BILL,
    uiOrNull_: uiOrNull_,
    notify_: notify_,
    requireUi_: requireUi_,
    evenShare_: evenShare_,
    charityRemainder_: charityRemainder_,
    validateAllocationTotal_: validateAllocationTotal_,
    buildFlagOnlyRows_: buildFlagOnlyRows_,
    folderIdFromConfig_: folderIdFromConfig_,
    hasTeam_: hasTeam_,
    resolveRosterView_: resolveRosterView_,
    validateRecipients_: validateRecipients_,
    gradebookRoster_: gradebookRoster_,
    getConfig: getConfig,
    setupFolders: setupFolders,
    writeConfigLinkCell_: writeConfigLinkCell_,
    configLinkFormula_: configLinkFormula_,
    configLinkUrl_: configLinkUrl_,
    folderLinkUrl_: folderLinkUrl_,
    configLinkText_: configLinkText_,
    CONFIG_LINKS: CONFIG_LINKS,
    decorateConfigSheet_: decorateConfigSheet_,
    CONFIG_NOTES: CONFIG_NOTES
  };
}
