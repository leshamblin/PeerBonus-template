// Run createQuickGuides() once from the Apps Script editor to generate the quick guide doc.
// Docs are saved to My Drive root — move them wherever you like afterward.
// Course title and URLs come from config.js (COURSE.urls) — fill those in
// after the first deployment, before running this.

function createQuickGuides() {
  const MAIN_DOC_URL = COURSE.urls.mainGuide;

  const courses = [
    {
      title:          '💵 ' + COURSE.label + ' Peer Evaluation',
      formUrl:        COURSE.urls.form,
      sheetUrl:       COURSE.urls.sheet,
      reflectionsUrl: COURSE.urls.reflections,
      summaryUrl:     COURSE.urls.summary
    }
  ];

  const created = [];

  courses.forEach(c => {
    const doc = DocumentApp.create('Quick Guide — ' + c.title);
    const body = doc.getBody();

    // Title
    body.appendParagraph('Quick Guide: ' + c.title)
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('Instructor Reference')
      .setHeading(DocumentApp.ParagraphHeading.HEADING3);
    body.appendParagraph('');

    // Box 1: Student Form
    addBox_(body, '🔗  Student Form Link', [
      { text: 'Share this link with your students to submit peer evaluations:' },
      { link: c.formUrl, linkText: c.formUrl }
    ]);

    body.appendParagraph('');

    // Box 2: Instructor Resources
    addBox_(body, '📊  Your Instructor Resources', [
      { label: 'Response spreadsheet (grades, data, settings):', link: c.sheetUrl, linkText: 'Open Spreadsheet →' },
      { label: 'Reflections folder (student reflection docs):',  link: c.reflectionsUrl, linkText: 'Open Reflections Folder →' },
      { label: 'Summary docs folder (peer eval summaries):',     link: c.summaryUrl, linkText: 'Open Summary Folder →' }
    ]);

    body.appendParagraph('');

    // Box 3: Grading Formula
    addGradingBox_(body);

    body.appendParagraph('');

    // Box 4: Full Documentation
    addBox_(body, '📖  Full Documentation', [
      { text: 'For setup instructions, troubleshooting, and a full feature walkthrough:' },
      { link: MAIN_DOC_URL, linkText: 'Open Full Instructor Guide →' }
    ]);

    doc.saveAndClose();
    created.push(c.title + ':\n' + doc.getUrl());
  });

  // Write URLs to a sheet so they're easy to find
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let out = ss.getSheetByName('QuickGuideURLs');
  if (!out) out = ss.insertSheet('QuickGuideURLs');
  out.clearContents();
  out.appendRow(['Course', 'Quick Guide URL']);
  created.forEach(entry => {
    const parts = entry.split('\n');
    out.appendRow([parts[0].replace(':', ''), parts[1]]);
  });
  Logger.log('Quick guides created. Check the QuickGuideURLs sheet.');
}

function addGradingBox_(body) {
  const table = body.appendTable([['']]);
  table.setBorderWidth(0);

  const cell = table.getCell(0, 0);
  cell.setBackgroundColor('#E3F2FD');

  if (COURSE.gradingMode === 'flag_only') {
    addGradingBoxFlagOnly_(cell);
    return;
  }

  cell.getChild(0).asParagraph()
    .appendText('🎓  Grading Formula').setBold(true).setFontSize(12);

  cell.appendParagraph('')
    .appendText('Each student\'s grade is based on the average bonus they received from teammates who reviewed them, relative to what an equal split would be.')
    .setFontSize(10).setForegroundColor('#333333').setBold(false).setItalic(false);

  cell.appendParagraph('')
    .appendText('Grade = MIN(100, Bonus Ratio × 100)')
    .setFontSize(11).setForegroundColor('#0D47A1').setBold(true).setItalic(false);

  cell.appendParagraph('')
    .appendText('Bonus Ratio = Avg Bonus Received ÷ Equal Share,  where Equal Share is what one teammate gets from an even split — $1,000 divided by (team size − 1), rounded down to a whole dollar. On a team of four that is $333, not $333.33, and the leftover $1 is donated to charity.')
    .setFontSize(10).setForegroundColor('#333333').setBold(false).setItalic(true);

  cell.appendParagraph('')
    .appendText('Reference (4-person team, Equal Share ≈ $333):').setFontSize(10).setForegroundColor('#333333').setBold(true);

  [
    ['Avg $0 received',   '→ ratio 0.0  →  Grade 0'],
    ['Avg $167 received', '→ ratio 0.5  →  Grade 50'],
    ['Avg $333 received', '→ ratio 1.0  →  Grade 100'],
    ['Avg > $333 received', '→ capped at 100'],
  ].forEach(([label, grade]) => {
    cell.appendParagraph('')
      .appendText('   ' + label + '   ' + grade)
      .setFontSize(10).setForegroundColor('#333333').setBold(false);
  });

  cell.appendParagraph('')
    .appendText('Non-submitters:').setFontSize(10).setForegroundColor('#333333').setBold(true);

  cell.appendParagraph('')
    .appendText('   • Final Grade = 0 if the student did not submit.')
    .setFontSize(10).setForegroundColor('#333333').setBold(false);

  cell.appendParagraph('')
    .appendText('   • If teammates did not submit, they simply don\'t appear in the average — neither helping nor hurting the student\'s grade. No imputation needed.')
    .setFontSize(10).setForegroundColor('#333333').setBold(false);

  cell.appendParagraph('')
    .appendText('Gradebook columns: Team | Last | First | Team Size | Reviews Received | Avg Bonus ($) | Equal Share ($) | Bonus Ratio | Submitted | Grade | Override | Final Grade')
    .setFontSize(10).setForegroundColor('#444444').setItalic(true);

  cell.appendParagraph('')
    .appendText('To generate: open the response spreadsheet → Peer Eval Admin menu → 📊 Generate Gradebook.')
    .setFontSize(10).setForegroundColor('#444444').setItalic(true);

  cell.appendParagraph('')
    .appendText('Override column: leave blank to use the calculated grade, or enter a number to replace it for a specific student.')
    .setFontSize(10).setForegroundColor('#444444').setItalic(true);
}

function addGradingBoxFlagOnly_(cell) {
  const pct = Math.round((COURSE.flagThreshold != null ? COURSE.flagThreshold : 0.75) * 100);

  cell.getChild(0).asParagraph()
    .appendText('🎓  Grading (flag-only)').setBold(true).setFontSize(12);

  cell.appendParagraph('')
    .appendText('Every student receives 100 (an A). The peer evaluation is not used to rank or dock students. Its only job is to flag the rare case where someone was rated poorly by teammates, so you can take a look.')
    .setFontSize(10).setForegroundColor('#333333').setBold(false).setItalic(false);

  cell.appendParagraph('')
    .appendText('Everyone earns 100 (A). A row is flagged only when the student was reviewed AND valued below ' + pct + '% of an even split.')
    .setFontSize(11).setForegroundColor('#0D47A1').setBold(true).setItalic(false);

  cell.appendParagraph('')
    .appendText('Bonus Ratio = Avg Bonus Received ÷ Equal Share,  where Equal Share is what one teammate gets from an even split — $1,000 divided by (team size − 1), rounded down to a whole dollar (on a team of four, $333). Flagged when Bonus Ratio < ' + (pct / 100) + '.')
    .setFontSize(10).setForegroundColor('#333333').setBold(false).setItalic(true);

  cell.appendParagraph('')
    .appendText('What this means:').setFontSize(10).setForegroundColor('#333333').setBold(true);

  [
    ['At or above the even split',        '→ not flagged  →  100 (A)'],
    ['Below ' + pct + '% of even split',  '→ flagged ⚠  →  100 (A), unless you Override'],
    ['Received no reviews',               '→ not flagged  →  100 (A)'],
    ['Did not submit their evaluation',   '→ not flagged  →  100 (A)'],
  ].forEach(([label, grade]) => {
    cell.appendParagraph('')
      .appendText('   ' + label + '   ' + grade)
      .setFontSize(10).setForegroundColor('#333333').setBold(false);
  });

  cell.appendParagraph('')
    .appendText('Not submitting never lowers a grade.').setFontSize(10).setForegroundColor('#333333').setBold(true);

  cell.appendParagraph('')
    .appendText('Gradebook columns: Team | Last | First | Team Size | Reviews Received | Avg Bonus ($) | Equal Share ($) | Bonus Ratio | Submitted | Flag | Grade | Override | Final Grade')
    .setFontSize(10).setForegroundColor('#444444').setItalic(true);

  cell.appendParagraph('')
    .appendText('To generate: open the response spreadsheet → Peer Eval Admin menu → 📊 Generate Gradebook.')
    .setFontSize(10).setForegroundColor('#444444').setItalic(true);

  cell.appendParagraph('')
    .appendText('Override column: leave blank to keep 100 (A), or enter a number to lower a flagged student.')
    .setFontSize(10).setForegroundColor('#444444').setItalic(true);
}

function addBox_(body, heading, items) {
  const table = body.appendTable([['']]);
  table.setBorderWidth(0);

  const cell = table.getCell(0, 0);
  cell.setBackgroundColor('#FFF9C4');

  // Use the cell's auto-created first paragraph for the heading
  cell.getChild(0).asParagraph()
    .appendText(heading).setBold(true).setFontSize(12);

  items.forEach(item => {
    if (item.label) {
      // Label line (italic), then link on next line
      cell.appendParagraph('')
        .appendText(item.label).setItalic(true).setFontSize(10).setForegroundColor('#444444');
      cell.appendParagraph('')
        .appendText('   ' + item.linkText)
        .setLinkUrl(item.link).setForegroundColor('#1155CC').setFontSize(10).setBold(false);
    } else if (item.link) {
      // Standalone link
      cell.appendParagraph('')
        .appendText(item.linkText)
        .setLinkUrl(item.link).setForegroundColor('#1155CC').setFontSize(10);
    } else {
      // Plain text
      cell.appendParagraph('')
        .appendText(item.text).setFontSize(10).setForegroundColor('#333333');
    }
  });
}
