// "Работают сейчас" — team presence/working-hours + leave periods. Split
// out from the old monolithic app.js — see PROGRESS.md.
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware, requireRole } from '../auth.js';
import { LEAVE_TYPES, STATUS_VALUES, computeIsWorkingNow, todayInTimezone, isValidTimezone } from '../presence.js';
import { displayName } from '../routeHelpers.js';

const router = express.Router();

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BIRTHDAY_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function upsertPresence(userId, { work_start, work_end, work_days, timezone, status, birthday }) {
  let days = '1,2,3,4,5';
  if (work_days) {
    const parsed = String(work_days).split(',').map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 7);
    if (parsed.length) days = parsed.join(',');
  }
  // Birthday is set once — normally at registration (see auth.js) — and
  // locked after that; it's "once per person", not an editable working-hours
  // field. If a birthday is already on file, an incoming value here is
  // silently ignored (kept as-is) rather than overwritten; only a
  // currently-null birthday can be set through this path, which mainly
  // covers accounts that existed before this field did.
  const existing = db.prepare('SELECT birthday FROM user_profiles WHERE user_id = ?').get(userId);
  const nextBirthday = existing?.birthday ? existing.birthday : (birthday || null);
  db.prepare(`
    INSERT INTO user_profiles (user_id, work_start, work_end, work_days, timezone, status, birthday)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      work_start = excluded.work_start,
      work_end   = excluded.work_end,
      work_days  = excluded.work_days,
      timezone   = excluded.timezone,
      status     = excluded.status,
      birthday   = excluded.birthday
  `).run(userId, work_start || null, work_end || null, days, timezone || 'Europe/Moscow', status || 'active', nextBirthday);
}

function validatePresenceBody(body) {
  const { work_start, work_end, status, birthday, timezone } = body;
  if (status !== undefined && status !== null && !STATUS_VALUES.includes(status)) {
    return 'Некорректный статус';
  }
  if (work_start !== undefined && work_start !== null && !TIME_RE.test(work_start)) {
    return 'Некорректное время начала (формат ЧЧ:ММ)';
  }
  if (work_end !== undefined && work_end !== null && !TIME_RE.test(work_end)) {
    return 'Некорректное время окончания (формат ЧЧ:ММ)';
  }
  if (birthday !== undefined && birthday !== null && !BIRTHDAY_RE.test(birthday)) {
    return 'Некорректная дата рождения (формат ММ-ДД)';
  }
  // Was unvalidated — an invalid IANA zone reaching the DB used to crash the
  // whole team's presence feed the next time anyone read it (Intl throws on
  // an unrecognized zone), not just the row that set it.
  if (timezone !== undefined && timezone !== null && !isValidTimezone(timezone)) {
    return 'Некорректный часовой пояс';
  }
  return null;
}

// Visible to every authenticated role, not just leads — "who's around right
// now" is useful to a tester too, not just management.
router.get('/api/team/presence', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT u.id, ${displayName('u')} as name, u.avatar_initials,
        p.gender, p.status, p.work_start, p.work_end, p.work_days, p.timezone, p.birthday
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.archived_at IS NULL
      ORDER BY ${displayName('u')}
    `).all();

    // Small table, whole team at most — cheaper and simpler to filter
    // "currently active" leave in JS (per-user timezone) than to express a
    // per-row-timezone-aware date comparison in SQL.
    const leaves = db.prepare('SELECT * FROM leave_periods').all();
    const leavesByUser = {};
    for (const l of leaves) (leavesByUser[l.user_id] = leavesByUser[l.user_id] || []).push(l);

    const result = rows.map((u) => {
      const tz = u.timezone || 'Europe/Moscow';
      const today = todayInTimezone(tz);
      const currentLeave = (leavesByUser[u.id] || []).find(
        (l) => l.start_date <= today && (!l.end_date || l.end_date >= today)
      ) || null;
      return {
        id: u.id,
        name: u.name,
        avatar_initials: u.avatar_initials,
        gender: u.gender || null,
        status: u.status || 'active',
        workStart: u.work_start || null,
        workEnd: u.work_end || null,
        workDays: u.work_days || '1,2,3,4,5',
        timezone: tz,
        birthday: u.birthday || null,
        isWorkingNow: computeIsWorkingNow({ work_start: u.work_start, work_end: u.work_end, work_days: u.work_days, timezone: tz }),
        currentLeave: currentLeave ? { id: currentLeave.id, type: currentLeave.type, end_date: currentLeave.end_date, note: currentLeave.note } : null,
      };
    });
    res.json(result);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/api/me/presence', authMiddleware, (req, res) => {
  try {
    const error = validatePresenceBody(req.body);
    if (error) return res.status(400).json({ error });
    upsertPresence(req.user.id, req.body);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/me/leave', authMiddleware, (req, res) => {
  try {
    const { type, start_date, end_date, note } = req.body;
    if (!LEAVE_TYPES.includes(type)) return res.status(400).json({ error: 'Некорректный тип отсутствия' });
    if (!DATE_RE.test(start_date || '')) return res.status(400).json({ error: 'Некорректная дата начала' });
    if (end_date && !DATE_RE.test(end_date)) return res.status(400).json({ error: 'Некорректная дата окончания' });
    if (end_date && end_date < start_date) return res.status(400).json({ error: 'Дата окончания раньше даты начала' });
    const id = db.prepare(
      'INSERT INTO leave_periods (user_id, type, start_date, end_date, note, created_by) VALUES (?,?,?,?,?,?)'
    ).run(req.user.id, type, start_date, end_date || null, String(note || '').slice(0, 300), req.user.id).lastInsertRowid;
    res.status(201).json({ id });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/me/leave/:id', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM leave_periods WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Нет доступа' });
    db.prepare('DELETE FROM leave_periods WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/api/lead/team/:id/presence', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    const error = validatePresenceBody(req.body);
    if (error) return res.status(400).json({ error });
    upsertPresence(targetId, req.body);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/lead/team/:id/leave', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    const { type, start_date, end_date, note } = req.body;
    if (!LEAVE_TYPES.includes(type)) return res.status(400).json({ error: 'Некорректный тип отсутствия' });
    if (!DATE_RE.test(start_date || '')) return res.status(400).json({ error: 'Некорректная дата начала' });
    if (end_date && !DATE_RE.test(end_date)) return res.status(400).json({ error: 'Некорректная дата окончания' });
    if (end_date && end_date < start_date) return res.status(400).json({ error: 'Дата окончания раньше даты начала' });
    const id = db.prepare(
      'INSERT INTO leave_periods (user_id, type, start_date, end_date, note, created_by) VALUES (?,?,?,?,?,?)'
    ).run(targetId, type, start_date, end_date || null, String(note || '').slice(0, 300), req.user.id).lastInsertRowid;
    res.status(201).json({ id });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/lead/team/:id/leave/:leaveId', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM leave_periods WHERE id = ? AND user_id = ?').get(req.params.leaveId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    db.prepare('DELETE FROM leave_periods WHERE id = ?').run(req.params.leaveId);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
