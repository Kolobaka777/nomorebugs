// Team-wide "what's new" feed — deliberately separate from activity_log
// (see team_events' schema.js comment). Visible to every role, unlike
// /api/lead/activity which is a private audit trail. Split out from the
// old monolithic app.js — see PROGRESS.md.
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware } from '../auth.js';
import { todayInTimezone, todayMonthDayInTimezone } from '../presence.js';

const router = express.Router();

// Birthdays and leave-starts/ends aren't stored rows — they're computed
// here, live, against each user's own timezone, since there's no cron job
// in this codebase to stamp them at the right moment.
router.get('/api/team/news', authMiddleware, (req, res) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const PAGE_SIZE = 30;

    const stored = db.prepare(`
      SELECT te.id, te.event_type, te.ref_id, te.created_at, u.id as user_id, u.name, u.avatar_initials,
        (SELECT gender FROM user_profiles WHERE user_id = u.id) as gender,
        g.title as guide_title, cc.title as course_title, l.title as lecture_title
      FROM team_events te
      JOIN users u ON u.id = te.user_id
      LEFT JOIN guides g ON te.ref_id = g.id AND te.event_type = 'guide_published'
      LEFT JOIN custom_courses cc ON te.ref_id = cc.id AND te.event_type = 'course_published'
      LEFT JOIN lectures l ON te.ref_id = l.id AND te.event_type = 'lecture_video_added'
      ORDER BY te.created_at DESC
      LIMIT ? OFFSET ?
    `).all(PAGE_SIZE + 1, offset);
    const hasMore = stored.length > PAGE_SIZE;
    const storedPage = stored.slice(0, PAGE_SIZE);

    // Birthdays/leave are computed "as of today", not stored history — only
    // meaningful on the first page; paging further back into stored events
    // has no equivalent "yesterday's birthdays" concept to show.
    const virtual = [];
    if (offset === 0) {
      const activeUsers = db.prepare(`
        SELECT u.id, u.name, u.avatar_initials,
          p.gender, p.birthday, p.timezone
        FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
        WHERE u.archived_at IS NULL
      `).all();

      const nowIso = new Date().toISOString();
      for (const u of activeUsers) {
        if (u.birthday && u.birthday === todayMonthDayInTimezone(u.timezone)) {
          virtual.push({
            id: `birthday-${u.id}`, event_type: 'birthday', created_at: nowIso,
            user_id: u.id, name: u.name, avatar_initials: u.avatar_initials, gender: u.gender || null,
          });
        }
      }

      const leaves = db.prepare(`
        SELECT lp.*, u.name, u.avatar_initials,
          (SELECT gender FROM user_profiles WHERE user_id = u.id) as gender,
          (SELECT timezone FROM user_profiles WHERE user_id = u.id) as timezone
        FROM leave_periods lp JOIN users u ON u.id = lp.user_id
        WHERE u.archived_at IS NULL
      `).all();
      for (const l of leaves) {
        const today = todayInTimezone(l.timezone);
        if (l.start_date === today) {
          virtual.push({
            id: `leave-start-${l.id}`, event_type: 'leave_started', created_at: nowIso,
            user_id: l.user_id, name: l.name, avatar_initials: l.avatar_initials, gender: l.gender || null,
            leave_type: l.type,
          });
        }
        if (l.end_date === today) {
          virtual.push({
            id: `leave-end-${l.id}`, event_type: 'leave_ended', created_at: nowIso,
            user_id: l.user_id, name: l.name, avatar_initials: l.avatar_initials, gender: l.gender || null,
            leave_type: l.type,
          });
        }
      }
    }

    const merged = [...virtual, ...storedPage].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ rows: merged, hasMore });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
