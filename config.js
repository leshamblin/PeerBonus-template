// Per-course configuration — the ONLY code file that differs between course
// copies. sync.sh never touches it. Fill in the real values when spinning up
// a new course from the template (see README.md).

const COURSE = {
  // Used in the app title, Drive folder names, and generated doc titles —
  // e.g. 'BUS 462 (601) Summer II'
  label: '[COURSE]',

  // Shown under the app title — e.g. 'Business Strategy'
  subtitle: '[COURSE SUBTITLE]',

  // Grading scheme. 'bonus_ratio' (default) = continuous grade from peer $.
  // 'flag_only' = everyone gets 100 (A); students reviewed below
  // flagThreshold of the even split are flagged for the instructor.
  gradingMode:   'bonus_ratio',
  flagThreshold: 0.75,

  // Filled in AFTER the first deployment; used only by createQuickGuides()
  urls: {
    form:        '[WEB_APP_EXEC_URL]',
    sheet:       '[SPREADSHEET_URL]',
    reflections: '[REFLECTIONS_FOLDER_URL]',
    summary:     '[SUMMARY_FOLDER_URL]',
    mainGuide:   '[FULL_INSTRUCTOR_GUIDE_DOC_URL]'
  }
};
