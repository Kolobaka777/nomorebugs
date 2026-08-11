// Small helpers genuinely shared across more than one route-domain module
// (see routes/*.js) — everything here is used by at least two of them.
// Anything only used within a single domain lives in that domain's own
// router file instead, to keep this from becoming a second dumping ground.
import { db } from '../db/schema.js';

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
export const KNOWN_PERMISSIONS = ['manage_knowledge_base', 'manage_courses', 'manage_checklists', 'manage_guides'];

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
    db.prepare('DELETE FROM custom_courses WHERE id = ?').run(courseId);
  })();
}
