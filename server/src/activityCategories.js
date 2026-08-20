// Groups audit-log actions into the four things a lead actually goes to the
// log to answer: "what did the team learn", "who changed the content",
// "who was given what", "did anything happen to an account".
//
// The grouping lives in SQL patterns rather than a stored column because
// `activity_log.action` is a free-form string with years of existing rows
// in it — a category column would need backfilling by exactly these same
// patterns, and would then drift the first time someone logged an action
// without setting it.
//
// Patterns are SQLite LIKE, anchored by construction (no leading %), and
// must not overlap: activity-categories.test.js enumerates every action
// string the codebase can produce and asserts each one lands in exactly
// one category. That test is the reason `password_reset:%` (an admin
// resetting someone else's password) and `password_reset_self_service`
// (a person recovering their own) are written as two precise patterns
// instead of one convenient `password_reset%`.
export const ACTIVITY_CATEGORIES = {
  learning: [
    'passed_lecture',
    'failed_lecture',
    'course_completed',
    'completed_baseline',
    'quiz_passed:%',
    'quiz_failed:%',
    'checklist_submitted:%',
    'earned_achievement:%',
    'crafted_badge:%',
  ],
  content: [
    'course_created:%',
    'course_published:%',
    'course_unpublished:%',
    'course_deleted:%',
    'guide_created:%',
    'guide_deleted:%',
    'guide_approved:%',
    'bug_example_created:%',
    'bug_example_deleted:%',
    'bug_example_approved:%',
    'glossary_created:%',
    'glossary_deleted:%',
    'glossary_approved:%',
    'news_posted:%',
    'news_deleted:%',
  ],
  admin: [
    'user_archived:%',
    'user_restored:%',
    'admin_role_change:%',
    'permission_granted:%',
    'permission_revoked:%',
    'password_reset:%',
    'bonus_awarded:%',
  ],
  account: [
    'login',
    'login_telegram',
    'login_failed',
    'account_locked',
    'register',
    'register_telegram',
    'password_changed',
    'password_reset_self_service',
    'email_changed',
    'phone_changed',
  ],
};

export const CATEGORY_NAMES = Object.keys(ACTIVITY_CATEGORIES);

// Returns { sql, params } for a WHERE fragment, or null for "no filter".
// Unknown category names return null rather than throwing — a filter is a
// query-string parameter, and a typo in one should show everything, not
// 500 the page.
export function categoryFilter(category) {
  const patterns = ACTIVITY_CATEGORIES[category];
  if (!patterns) return null;
  return {
    sql: `(${patterns.map(() => 'a.action LIKE ?').join(' OR ')})`,
    params: patterns,
  };
}

// The same patterns as a CASE expression, so a row's category is decided
// once, in SQL, next to the filter that uses it. The client colour-codes
// and groups by this value and deliberately does not know the patterns —
// a second copy of them in TypeScript would be correct exactly until
// someone added an action string and updated only one of the two.
//
// Interpolates only pattern literals defined in this file (never anything
// from a request), so the LIKE arguments are inlined rather than bound —
// a CASE arm count that varies with the category map can't be expressed
// with positional parameters shared across the rest of the query.
export function categoryCaseSql(alias = 'a') {
  const arms = Object.entries(ACTIVITY_CATEGORIES).map(([name, patterns]) => {
    const test = patterns.map(p => `${alias}.action LIKE '${p}'`).join(' OR ');
    return `WHEN ${test} THEN '${name}'`;
  });
  return `CASE ${arms.join(' ')} ELSE 'other' END`;
}
