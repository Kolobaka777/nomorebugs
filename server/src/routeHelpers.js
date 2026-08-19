// Small helpers genuinely shared across more than one route-domain module
// (see routes/*.js) — everything here is used by at least two of them.
// Anything only used within a single domain lives in that domain's own
// router file instead, to keep this from becoming a second dumping ground.
import { db } from '../db/schema.js';
import { logError } from './sentry.js';

// A UNIQUE-constraint violation reaching the generic catch block in a route
// used to surface as a bare 500 "Server error" — technically correct but
// unhelpful, since the actual cause (e.g. "you already submitted this") is
// a normal, expected condition, not a server fault. Route handlers that
// know they're at risk of hitting a real UNIQUE constraint (not a bug)
// should catch that specific case and call this instead of falling through
// to a plain 500.
export function isUniqueConstraintError(err) {
  return typeof err?.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT');
}

// A person's name as everybody else should see it.
//
// Two names exist. users.name is what the account registered with (or what
// an admin typed when creating it); user_profiles.nickname is what the
// person set on their own profile page and what they actually go by. They
// used to disagree everywhere: someone renamed themselves to "I'm BOSS",
// their profile said so, and the news feed, guide bylines, the team list
// and the ratings all kept crediting "Alex Lead" — a name nobody used any
// more but that every list still showed.
//
// So every query that shows a name to another person builds it from this
// instead of selecting users.name directly. NULLIF covers a nickname that
// exists but is blank; the account name is the fallback, never the winner.
// Derived rather than copied into the rows, so a rename takes effect on the
// next page load everywhere at once — including on rows written years ago.
//
// The one place that deliberately still reads users.name is authentication
// (an account's own identity, e.g. the email a notification is addressed
// to), where the registered name is the point.
export const displayName = (alias = 'u') =>
  `COALESCE(NULLIF((SELECT nickname FROM user_profiles WHERE user_id = ${alias}.id), ''), ${alias}.name)`;

// SQLite's CURRENT_TIMESTAMP returns UTC time as "YYYY-MM-DD HH:MM:SS" with
// no timezone marker. Node parses that non-standard, space-separated string
// as LOCAL (server) time rather than UTC, which silently skews any Date
// arithmetic done directly on a raw DB timestamp on a non-UTC host — e.g.
// a team member's "days inactive" or a tester's own account-age stat.
// Mirrors client/src/utils/date.ts's parseServerDate — keep both in sync.
export function parseDbDate(raw) {
  if (!raw) return new Date(NaN);
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);
  return new Date(hasZone ? raw : `${raw.replace(' ', 'T')}Z`);
}

// A lead can hand a specific tester a narrow, named capability (e.g.
// managing the knowledge base) without a full role change — requireRole
// grants everything that role can do, which is far more than intended for
// "let this one tester edit glossary terms." Deliberately separate from
// requireRole rather than a new role value: a role is a fixed, broad set of
// permissions; a grant is one named capability, optionally time-limited,
// revocable at any time, and never itself grants the ability to grant more
// (only 'lead'/'admin' can call the grant/revoke endpoints in routes/admin.js).
export const KNOWN_PERMISSIONS = ['manage_knowledge_base', 'manage_courses', 'manage_guides'];

export function hasPermission(userId, permission) {
  // expires_at is stored exactly as the client sends it — normally a JS
  // .toISOString() string ("...T...Z"), which sorts lexicographically
  // *after* SQLite's own datetime('now') output ("YYYY-MM-DD HH:MM:SS", no
  // "T"/"Z") for same-day values purely because 'T' (0x54) > ' ' (0x20).
  // Comparing the raw strings made same-day grants look "not yet expired"
  // for the rest of that calendar day even well past their real expiry
  // time. datetime(...) re-parses both sides into the same canonical text
  // format first, so the comparison reflects actual chronological order.
  const row = db.prepare(`
    SELECT 1 FROM granted_permissions
    WHERE user_id = ? AND permission = ? AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
  `).get(userId, permission);
  return !!row;
}

// Like requireRole, 'admin' and 'lead' always pass — a lead doesn't need a
// grant to manage their own team's knowledge base.
export function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user.role === 'lead' || req.user.role === 'admin') return next();
    if (hasPermission(req.user.id, permission)) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
}

// Auto-awarded milestone badges — distinct from the 5 skill-area badges a
// tester crafts themselves from collected cards (see BADGE_META in
// client/src/utils/badges.ts and POST /api/tester/craft-badge), but stored
// in the very same user_badges table (badge_id is just a free-form string),
// so the client's existing Коллекция tab / PublicProfilePage badge-chip
// rendering picks either kind up with no extra plumbing. Each ID below is
// checked from the route that owns the triggering event (see routes/*.js).
export const ACHIEVEMENT_IDS = {
  OTLICHNIK: 'achievement_otlichnik',           // last 5 tests all ≥90%
  AVTOR: 'achievement_avtor',                   // first ever approved proposal (course/guide/bug example/term)
  BIBLIOTEKAR: 'achievement_bibliotekar',       // 5 approved glossary terms
  NASTAVNIK: 'achievement_nastavnik',           // 3 approved guides
  GOLOS_KOMANDY: 'achievement_golos_komandy',   // 10+ likes across own suggestions, or 5 answered questions
  POLUNOCHNY_ZHUK: 'achievement_polunochny_zhuk', // logged in after midnight (server time) on 5 distinct days
  KOLLEKTSIONER: 'achievement_kollektsioner',   // crafted all 5 skill-area badges
};

// Idempotent — UNIQUE(user_id, badge_id) means a repeat award is a harmless
// no-op (INSERT OR IGNORE), so every call site can just call this every time
// its condition re-checks true without tracking "did I already give this"
// itself. Returns whether it was newly awarded (false on a repeat).
export function awardAchievement(userId, badgeId) {
  const result = db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, badgeId);
  if (result.changes > 0) {
    db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)').run(userId, `earned_achievement:${badgeId}`);
  }
  return result.changes > 0;
}

// The one place bug-coin amounts are decided. Coins used to be awarded from
// a single inline ladder in routes/tester.js and nowhere else, so "what does
// this app actually pay you for" was one quiz score and nothing more; the
// Помощь page now documents this table for a lead, and a documented economy
// has to have exactly one definition to document.
//
// Values are calibrated against the shop (SHOP_CATALOG in routes/tester.js:
// 120–350 per item): a quiz is pocket change, finishing a whole course is
// half a cheap item, and authoring something the team actually keeps is the
// only thing that pays for a frame on its own.
//
// The client mirrors this by hand in client/src/utils/coins.ts — same
// arrangement as SHOP_CATALOG/shop.ts, since there's no shared-types
// boundary in this repo. Change one, change the other.
export const COIN_REWARDS = {
  quizExcellent: 25,      // first submission, 90%+
  quizGood: 18,           // first submission, 75–89%
  quizPass: 10,           // first submission, 60–74%
  quizFail: 3,            // first submission, below 60% — a consolation, not a reward
  courseCompleted: 50,    // every lesson of a custom course done, once per course
  proposalCourse: 100,    // own course proposal approved by a lead
  proposalGuide: 60,      // own guide proposal approved
  proposalBugExample: 30, // own bug example approved
  proposalGlossary: 20,   // own glossary term approved
};

// Same upsert the quiz reward has always used. Not idempotent by itself —
// it adds every time it's called, so each call site owns the "has this
// already been paid for" check (a pending→approved transition, a first
// course completion, a first quiz submission).
export function awardCoins(userId, amount) {
  if (!userId || !amount) return;
  db.prepare(`
    INSERT INTO user_profiles (user_id, bug_coins)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET bug_coins = COALESCE(bug_coins, 0) + excluded.bug_coins
  `).run(userId, amount);
}

// Revokes every outstanding refresh token for a user — called on any
// password change (routes/auth.js) so a leaked/compromised session doesn't
// survive it, and on archiving a user (routes/admin.js) so a deactivated
// account's existing sessions stop working immediately rather than lasting
// until their access token's own short TTL expires.
export function revokeAllRefreshTokens(userId) {
  db.prepare('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL').run(userId);
}

// The real, permanent, cascading delete for a custom course — only ever
// called from routes/courses.js's own DELETE (which soft-deletes first) and
// routes/admin.js's trash purge route. A crash mid-cascade would otherwise
// leave orphaned rows (quiz questions with no lesson, etc.), so it's
// wrapped in one transaction.
export function hardDeleteCourse(courseId) {
  db.transaction(() => {
    const mods = db.prepare('SELECT id FROM custom_modules WHERE course_id = ?').all(courseId);
    for (const m of mods) {
      const lessons = db.prepare('SELECT id FROM custom_lessons WHERE module_id = ?').all(m.id);
      for (const l of lessons) {
        db.prepare('DELETE FROM custom_quiz_questions WHERE lesson_id = ?').run(l.id);
        db.prepare('DELETE FROM custom_lesson_progress WHERE lesson_id = ?').run(l.id);
      }
      db.prepare('DELETE FROM custom_lessons WHERE module_id = ?').run(m.id);
    }
    db.prepare('DELETE FROM custom_modules WHERE course_id = ?').run(courseId);
    db.prepare('DELETE FROM custom_course_views WHERE course_id = ?').run(courseId);
    // Was missing — course_deadline_overrides has a FK on course_id, so any
    // course that ever had a per-user deadline extension set (a routine lead
    // action) hit a foreign-key-constraint failure here, rolling back the
    // whole transaction and leaving it permanently un-purgeable from trash.
    db.prepare('DELETE FROM course_deadline_overrides WHERE course_id = ?').run(courseId);
    // Was also missing — course_time_tracking has no FK on course_id (see
    // schema.js), so nothing enforced this cleanup; without it, every course
    // that ever had a tester's time logged against it left permanently
    // orphaned rows behind (no FK violation to surface the bug, just silent
    // orphans accumulating with no course to belong to).
    db.prepare('DELETE FROM course_time_tracking WHERE course_id = ?').run(courseId);
    // Same bug class as course_deadline_overrides above, found in the
    // 2026-08-15 audit — custom_lesson_notes.course_id is also a NOT NULL FK
    // with no ON DELETE clause, so any course a tester ever left a lesson
    // note on hit the same foreign-key-constraint failure here, permanently
    // stuck in trash, unpurgeable without manual DB surgery.
    db.prepare('DELETE FROM custom_lesson_notes WHERE course_id = ?').run(courseId);
    db.prepare('DELETE FROM custom_courses WHERE id = ?').run(courseId);
  })();
}

// The one place an audit-log row gets written. Was 19 hand-rolled INSERTs
// scattered across the route modules, each with its own idea of which
// columns to fill — which is how `course_completed` ended up putting a
// custom_courses id into lecture_id, a column with a foreign key to
// `lectures`, and made finishing a course fail outright.
//
// Deliberately swallows its own errors. A log write is never the point of
// the request that triggers it: a lead losing one audit line is a much
// smaller problem than a tester's course completion 500-ing because the
// bookkeeping behind it failed. The error still reaches Sentry, so a
// silently-broken log is visible to us without being visible to them.
export function logActivity(userId, action, { lectureId = null, courseId = null } = {}) {
  try {
    db.prepare(
      'INSERT INTO activity_log (user_id, action, lecture_id, course_id) VALUES (?, ?, ?, ?)'
    ).run(userId, action, lectureId, courseId);
  } catch (err) {
    logError(err, { context: 'activity log write', action, userId });
  }
}

// Course visibility, shared because more than one domain needs it: the
// courses routes gate lessons and grading on it, and the notes routes gate
// what a note may be attached to — a note against a draft course made that
// draft's title, tag and colour come back in "Моя Нора", which is the same
// leak by a longer route.
//
// A lead reviewing a pending proposal is the carve-out: the review queue
// only works if someone other than the author can open what they proposed.
export function canManageCourse(course, user) {
  if (user.role === 'admin') return true;
  if (course.created_by === user.id) return true;
  if (course.proposal_status === 'pending' && user.role === 'lead') return true;
  return false;
}

export function canSeeCourse(course, user) {
  if (!course || course.deleted_at) return false;
  return Boolean(course.is_published) || canManageCourse(course, user);
}
