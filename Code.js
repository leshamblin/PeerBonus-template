function gradebookUrl_(ss) {
  const baseUrl = ss.getUrl();
  const gb = ss.getSheetByName('Gradebook');
  if (!gb) return baseUrl;
  return baseUrl.replace(/#.*$/, '') + '#gid=' + gb.getSheetId();
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
  const currentUser = fullRoster.find(p => p.email.toLowerCase() === userEmail.trim().toLowerCase());

  let rosterData = [];
  let userFound = false;

  if (isAdmin && currentUser) {
    userFound = true;
    rosterData = fullRoster.filter(p => p.section === currentUser.section);
  } else if (isAdmin) {
    userFound = true;
    // Admins aren't on the class roster, so scope their view to the Testdata
    // team (for demoing/previewing the student experience) rather than showing
    // the entire class lumped into one team.
    rosterData = fullRoster.filter(p => isTestTeam_(p.section));
  } else if (currentUser) {
    userFound = true;
    rosterData = fullRoster.filter(p => p.section === currentUser.section);
  }

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
  template.hasSubmitted = hasSubmitted;
  template.spreadsheetUrl = spreadsheetUrl;
  template.rosterData = JSON.stringify(rosterData).replace(/</g, '\\u003c');
  template.execUrl = ScriptApp.getService().getUrl();

  // Access-Denied diagnostic data — only consulted when userFound is false.
  if (!userFound) {
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
    ['reflection_folder_id',   ''],
    ['grading_mode',           COURSE.gradingMode || 'bonus_ratio'],
    ['flag_threshold',         (COURSE.flagThreshold != null ? COURSE.flagThreshold : 0.75)]
  ];

  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.appendRow(['Key', 'Value']);
    defaults.forEach(row => sheet.appendRow(row));
  }

  const data = sheet.getDataRange().getValues();
  const config = {};
  const present = {};
  for (let i = 1; i < data.length; i++) {
    const key = data[i][0];
    const value = data[i][1];
    if (key) {
      const k = key.toString().trim();
      config[k] = value;
      present[k] = true;
    }
  }
  // Append any genuinely-missing default keys, keyed on ROW PRESENCE, not on a
  // falsy value. Checking `!config[key]` treated an intentionally-blank value
  // (admin_whitelist, reflection_folder_id) as missing and appended a fresh
  // empty row on every cache miss; the trailing empty row then overrode the
  // real value on the next read. Presence-check makes it idempotent.
  defaults.forEach(([key, val]) => {
    if (!present[key]) {
      config[key] = val;
      sheet.appendRow([key, val]);
      present[key] = true;
    }
  });
  cache.put('config', JSON.stringify(config), 300);
  return config;
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

    // Allocation rules (mirror Index.html):
    //   • total must equal DISTRIBUTABLE = floor(BUDGET/10)*10  ($1,000 with current BUDGET)
    //   • any sub-$10 remainder is charity; ≥ $10 must go to a teammate
    //   • no single teammate may receive more than $1,000
    const BUDGET = 1000;
    const MAX_PER_PERSON = 1000;
    const DISTRIBUTABLE = Math.floor(BUDGET / 10) * 10;
    if (totalScore > BUDGET) {
      return { success: false, error: `Submission rejected: total cannot exceed $${BUDGET.toLocaleString()} (got $${totalScore.toLocaleString()}).` };
    }
    if (totalScore !== DISTRIBUTABLE) {
      return { success: false, error: `Submission rejected: total must equal $${DISTRIBUTABLE.toLocaleString()} (got $${totalScore.toLocaleString()}). Amounts of $10 or more must be assigned to a teammate, not left over.` };
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
  SpreadsheetApp.getUi().alert('Cache cleared. The next page load will re-read config and roster from the sheet.');
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

/**
 * First-run setup: creates Config (with defaults), Roster (empty with headers),
 * and Responses (empty with headers) tabs if they don't already exist. Idempotent —
 * safe to re-run; existing tabs are left alone.
 */
function setupSheet() {
  const ui = SpreadsheetApp.getUi();
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
  ui.alert('Setup complete', msg, ui.ButtonSet.OK);
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

function setupFolders() {
  const ui = SpreadsheetApp.getUi();
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
        configSheet.getRange(i + 1, 2).setValue(toUpdate[key]);
        found[key] = true;
      }
    }
    Object.entries(toUpdate).forEach(([key, val]) => {
      if (!found[key]) configSheet.appendRow([key, val]);
    });
  }

  const lines = [
    '📁 Folders ready!\n',
    (summaryCreated ? '✅ Created' : '• Already existed') + ': ' + summaryName,
    (reflectionsCreated ? '✅ Created' : '• Already existed') + ': ' + reflectionsName,
    '\nConfig updated with Reflections folder ID.'
  ];
  ui.alert(lines.join('\n'));
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
    const equalShare = teamSize > 1 ? 1000 / (teamSize - 1) : 0;
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
  const roster = getRoster();

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
  const config = getConfig(ss);
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
  //         equalShare = $1,000 ÷ (teamSize − 1)
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
    const equalShare = teamSize > 1 ? 1000 / (teamSize - 1) : 0;
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
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const respSheet = ss.getSheetByName('Responses');
  const rosterSheet = ss.getSheetByName('Roster');
  if (!respSheet || !rosterSheet) {
    ui.alert('Run "🚀 Set Up Sheet" first.');
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
  ui.alert('Test data refreshed', lines.join('\n'), ui.ButtonSet.OK);
}

function clearTestData() {
  const ui = SpreadsheetApp.getUi();
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
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const responseSheet = ss.getSheetByName('Responses');

  if (!responseSheet || responseSheet.getLastRow() <= 1) {
    ui.alert('No responses found in the Responses sheet.');
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
      ui.alert('Could not open the summary folder. Check that "summary_folder_id" in the Config sheet is correct and the folder is shared with this account.\n\nFolder ID: ' + summaryFolderId);
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
  ui.alert(msg);
}

function generateSummaryDocsForced() {
  generateSummaryDocs(true);
}

function resetGenerationLog() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName('DocGenLog');
  if (!logSheet) {
    ui.alert('No DocGenLog sheet found — nothing to reset.');
    return;
  }
  if (logSheet.getLastRow() > 1) {
    logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 2).clearContent();
  }
  ui.alert('Generation log cleared. The next "Generate Summary Docs (smart)" run will regenerate all docs.');
}

function generateTeamReflectionDocs() {
  const config = getConfig();
  const FOLDER_ID = folderIdFromConfig_(config.reflection_folder_id || '');
  const ui = SpreadsheetApp.getUi();

  if (!FOLDER_ID) {
    ui.alert('No folder set. Add a "reflection_folder_id" row to the Config sheet with the Google Drive folder URL (or ID) where docs should be saved.');
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const responseSheet = ss.getSheetByName('Responses');

  if (!responseSheet || responseSheet.getLastRow() <= 1) {
    ui.alert('No responses found in the Responses sheet.');
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

  ui.alert(`Done! ${count} team reflection doc${count !== 1 ? 's' : ''} created.`);
}

// Node-only: expose pure helpers for local unit tests. Harmless under GAS.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildFlagOnlyRows_: buildFlagOnlyRows_, folderIdFromConfig_: folderIdFromConfig_ };
}
