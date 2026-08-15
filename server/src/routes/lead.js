// Lead dashboard: team roster/stats, per-tester notes, before/after skill
// comparisons, lecture stats, and the lead's activity audit log (plus its
// self-scoped equivalent for any authenticated user). Split out from the
// old monolithic app.js — see PROGRESS.md.
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware, requireRole } from '../auth.js';
import { parseDbDate } from '../routeHelpers.js';

const router = express.Router();

// A lead-accessible view of archived testers — /api/admin/users (which
// also lists archived accounts) is admin-only, and a lead needs to see who
// they archived in order to restore them without going through admin.
router.get('/api/lead/archived-testers', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT u.id, u.name, u.avatar_initials, u.archived_at,
        (SELECT gender FROM user_profiles WHERE user_id = u.id) as gender
      FROM users u WHERE u.role = 'tester' AND u.archived_at IS NOT NULL ORDER BY u.archived_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/lead/team', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    // Everything (including the baseline average, folded in as one more
    // correlated subquery) comes from a single query now — this used to
    // additionally run 2 queries per tester in a follow-up loop, which
    // meant a team's page load scaled with team size instead of being
    // constant. avgScore was already being computed here for every member;
    // the old loop's "current" query was duplicating that exact value.
    const teamData = db.prepare(`
      SELECT
        u.id, u.name, u.avatar_initials, u.lead_note,
        (SELECT gender FROM user_profiles WHERE user_id = u.id) as gender,
        (SELECT COUNT(*) FROM test_results WHERE user_id = u.id AND score >= 60) as lecturesCompleted,
        (SELECT AVG(score) FROM test_results WHERE user_id = u.id) as avgScore,
        (SELECT MAX(created_at) FROM activity_log WHERE user_id = u.id) as lastActive,
        (SELECT (html_structure + css_reading + devtools + console_errors + bug_report_quality) / 5.0
         FROM baseline_survey WHERE user_id = u.id) as baselineAvg
      FROM users u
      WHERE u.role = 'tester' AND u.archived_at IS NULL
      ORDER BY u.name
    `).all();

    const now = Date.now();

    // Aggregated review signals (see submit-test's meta comment) — done in
    // JS rather than SQLite JSON functions since `meta` is a free-form
    // JSON-text column with no guarantee the JSON1 extension is compiled
    // into every better-sqlite3 build this runs on.
    const metaRows = db.prepare(
      `SELECT user_id, meta FROM test_results WHERE user_id IN (${teamData.map(() => '?').join(',') || 'NULL'})`
    ).all(...teamData.map(m => m.id));
    const signalsByUser = {};
    for (const row of metaRows) {
      let parsed;
      try { parsed = JSON.parse(row.meta || '{}'); } catch { parsed = {}; }
      const s = signalsByUser[row.user_id] || { fastAnswers: 0, tabSwitches: 0 };
      s.fastAnswers += parsed.fastAnswerCount || 0;
      s.tabSwitches += parsed.tabSwitches || 0;
      signalsByUser[row.user_id] = s;
    }

    const team = teamData.map(({ baselineAvg, ...member }) => {
      const lastActiveMs = member.lastActive ? parseDbDate(member.lastActive).getTime() : 0;
      const daysInactive = member.lastActive
        ? Math.floor((now - lastActiveMs) / (1000 * 60 * 60 * 24))
        : 999;

      // Both sides normalized to a 0-100 scale: baseline is a 1-5 self-rating (x20),
      // current is the average test score (already 0-100).
      const skillGrowth = Math.round((member.avgScore || 0) - (baselineAvg || 0) * 20);

      return {
        ...member,
        lead_note: member.lead_note || '',
        lecturesCompleted: member.lecturesCompleted || 0,
        avgScore: Math.round(member.avgScore || 0),
        skillGrowth,
        daysInactive,
        // Signals "might appreciate a check-in", not a judgment — kept as a
        // neutral flag so the UI layer can decide how (or whether) to surface it.
        needsCheckIn: daysInactive >= 7,
        fastAnswers: signalsByUser[member.id]?.fastAnswers || 0,
        tabSwitches: signalsByUser[member.id]?.tabSwitches || 0,
      };
    });

    res.json(team);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Raised from 2000 (plain text) to the same generous cap guides/courses use
// once this became a rich-text field (JSON-serialized Tiptap doc, not raw
// text) — and changed from silently `.slice()`-truncating to rejecting
// outright, since truncating mid-JSON-string would corrupt the document
// instead of just shortening it.
const MAX_LEAD_NOTE_LENGTH = 200000;

// Private working notes a lead keeps about a tester — never exposed to the
// tester (only /api/lead/team, a lead/admin-only route, ever returns it).
router.patch('/api/lead/team/:id/note', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const note = String(req.body.note ?? '');
    if (note.length > MAX_LEAD_NOTE_LENGTH) return res.status(400).json({ error: 'Заметка слишком длинная' });
    const target = db.prepare('SELECT role FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (target.role !== 'tester') return res.status(400).json({ error: 'Заметки доступны только для тестировщиков' });
    db.prepare('UPDATE users SET lead_note = ? WHERE id = ?').run(note, targetId);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Baseline-survey column name -> the exact lectures.skill_area string it
// corresponds to (see server/db/seed.js) — needed to join a tester's
// self-rated starting point against their actual measured quiz performance
// in that same topic.
const SKILL_AREA_BY_COLUMN = {
  html_structure: 'HTML structure',
  css_reading: 'CSS reading',
  devtools: 'DevTools',
  console_errors: 'Console errors',
  bug_report_quality: 'Bug report quality',
};

router.get('/api/lead/before-after', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const skills = ['html_structure', 'css_reading', 'devtools', 'console_errors', 'bug_report_quality'];
    const skillLabels = ['HTML Structure', 'CSS Reading', 'DevTools', 'Console Errors', 'Bug Report Quality'];

    // One row of 5 averages per table instead of 5 separate single-column
    // queries each rescanning the whole table — same result, 2 queries
    // total instead of 10. Column names come from the fixed `skills` list
    // above, never from request input, so this is safe to interpolate.
    const selectAvgs = skills.map(s => `AVG(${s}) as ${s}`).join(', ');
    const before = db.prepare(`SELECT ${selectAvgs} FROM baseline_survey`).get();
    const after  = db.prepare(`SELECT ${selectAvgs} FROM final_survey`).get();

    const chartData = skills.map((skill, i) => {
      const b = before?.[skill] || 0;
      const a = after?.[skill] || 0;
      return {
        skill: skillLabels[i],
        before: Math.round(b * 10) / 10,
        after:  Math.round(a * 10) / 10,
        delta:  Math.round((a - b) * 10) / 10,
      };
    });

    res.json(chartData);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Per-tester breakdown of the same before/after comparison — the aggregate
// chart above answers "is the team improving", this answers "which tester,
// in which topic" (who's grown, who might need the topic re-explained).
// "after" is the tester's own average quiz score in lectures tagged with
// that skill_area, normalized to the same 1-5 scale as the baseline
// self-rating (÷20) — not final_survey, which has no submission UI a
// tester can actually reach, so it's empty for effectively everyone.
router.get('/api/lead/before-after-by-tester', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const testers = db.prepare(
      `SELECT id, name FROM users WHERE role = 'tester' AND archived_at IS NULL ORDER BY name`
    ).all();

    const baselines = db.prepare('SELECT * FROM baseline_survey').all();
    const baselineByUser = Object.fromEntries(baselines.map(b => [b.user_id, b]));

    const scoreRows = db.prepare(`
      SELECT tr.user_id, l.skill_area, AVG(tr.score) as avg_score
      FROM test_results tr
      JOIN lectures l ON l.id = tr.lecture_id
      GROUP BY tr.user_id, l.skill_area
    `).all();
    const scoresByUser = {};
    for (const row of scoreRows) {
      (scoresByUser[row.user_id] = scoresByUser[row.user_id] || {})[row.skill_area] = row.avg_score;
    }

    const byTester = testers.map(t => {
      const baseline = baselineByUser[t.id];
      const skills = Object.entries(SKILL_AREA_BY_COLUMN).map(([column, skillArea]) => {
        const before = baseline ? baseline[column] : null;
        const rawAfter = scoresByUser[t.id]?.[skillArea];
        const after = rawAfter != null ? Math.round((rawAfter / 20) * 10) / 10 : null;
        return {
          skill: skillArea,
          before: before ?? null,
          after,
          delta: before != null && after != null ? Math.round((after - before) * 10) / 10 : null,
        };
      });
      return { id: t.id, name: t.name, skills };
    });

    res.json(byTester);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Per-lecture pass rate / avg score, so a lead can see which lectures are
// too hard (or too easy) instead of only per-tester aggregates. Built from
// test_results, which only keeps each tester's current attempt per lecture
// (INSERT OR REPLACE) — so this reflects current standing, not full attempt
// history, and "attempts" below really means "testers who have a result".
router.get('/api/lead/lecture-stats', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        l.id, l.title, l.skill_area, l.order_num,
        COUNT(tr.id) as attempts,
        AVG(tr.score) as avg_score,
        SUM(CASE WHEN tr.score >= 60 THEN 1 ELSE 0 END) as passed_count
      FROM lectures l
      LEFT JOIN test_results tr ON tr.lecture_id = l.id
      GROUP BY l.id
      ORDER BY l.order_num
    `).all();

    // "how many of the team actually passed this" — used to be a
    // hardcoded, made-up array on the client (ZhukademiPage's course
    // cards), unrelated to any real data. totalTesters is the same for
    // every row; repeated per-row rather than changing this route's
    // existing bare-array response shape.
    const totalTesters = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'tester' AND archived_at IS NULL").get().c;

    res.json(rows.map(r => ({
      id: r.id,
      title: r.title,
      skill_area: r.skill_area,
      attempts: r.attempts,
      avgScore: r.attempts > 0 ? Math.round(r.avg_score * 10) / 10 : null,
      passRate: r.attempts > 0 ? Math.round((r.passed_count / r.attempts) * 100) : null,
      passedCount: r.passed_count,
      totalTesters,
    })));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/lead/activity', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const userId = req.query.user_id ? parseInt(req.query.user_id, 10) : null;
    // Small, fixed feed (Home page's "recent activity" widget) vs the full,
    // pageable admin log — same query, different LIMIT/offset so one route
    // serves both without duplicating the join.
    const PAGE_SIZE = req.query.offset !== undefined || req.query.user_id ? 50 : 20;

    const where = userId ? 'WHERE a.user_id = ?' : '';
    const params = userId ? [userId] : [];

    const rows = db.prepare(`
      SELECT
        a.id, a.action, a.created_at,
        u.id as user_id, u.name,
        (SELECT gender FROM user_profiles WHERE user_id = u.id) as gender,
        l.title as lecture_title,
        c.title as course_title
      FROM activity_log a
      JOIN users u ON a.user_id = u.id
      -- 'course_completed' reuses the lecture_id column to stash a
      -- custom_courses id instead — a separate id space from lectures (see
      -- POST /api/courses/time-track) — so each join is scoped to the
      -- actions that actually populate it that way; without the a.action
      -- guard here too, a course_completed row could coincidentally join a
      -- same-numbered lecture and show the wrong title alongside the right
      -- course_title.
      LEFT JOIN lectures l ON a.lecture_id = l.id AND a.action != 'course_completed'
      LEFT JOIN custom_courses c ON a.action = 'course_completed' AND a.lecture_id = c.id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, PAGE_SIZE + 1, offset);

    const hasMore = rows.length > PAGE_SIZE;
    res.json({ rows: rows.slice(0, PAGE_SIZE), hasMore });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Self-scoped equivalent of /api/lead/activity above (same shape, same
// query minus the role gate) — that route is lead/admin-only, so a tester
// had no way to see their own activity history anywhere in the app.
router.get('/api/me/activity', authMiddleware, (req, res) => {
  try {
    const PAGE_SIZE = 20;
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const rows = db.prepare(`
      SELECT
        a.id, a.action, a.created_at,
        u.id as user_id, u.name,
        (SELECT gender FROM user_profiles WHERE user_id = u.id) as gender,
        l.title as lecture_title,
        c.title as course_title
      FROM activity_log a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN lectures l ON a.lecture_id = l.id AND a.action != 'course_completed'
      LEFT JOIN custom_courses c ON a.action = 'course_completed' AND a.lecture_id = c.id
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, PAGE_SIZE + 1, offset);

    const hasMore = rows.length > PAGE_SIZE;
    res.json({ rows: rows.slice(0, PAGE_SIZE), hasMore });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
