// Lead/admin management of lecture video links and the curated task-type
// list. Split out from the old monolithic app.js — see PROGRESS.md.
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware, requireRole } from '../auth.js';
import { isUniqueConstraintError } from '../routeHelpers.js';

const router = express.Router();

// Video is always a pasted link (YouTube/Drive/VK/Яндекс.Диск) — Railway's
// disk is ephemeral, so a real file upload would just be lost on the next
// deploy. There is no lecture-creation UI in this app (lectures are only
// ever seeded via db/seed.js) — this only lets a lead attach/replace the
// video link on an existing lecture.
const KNOWN_VIDEO_HOSTS = /youtube\.com|youtu\.be|drive\.google\.com|vk\.com|vkvideo\.ru|disk\.yandex\./i;

router.get('/api/admin/lectures', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    res.json(db.prepare('SELECT id, title, skill_area, order_num, video_url FROM lectures ORDER BY order_num').all());
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/api/admin/lectures/:id/video', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const { video_url } = req.body;
    if (video_url && !/^https:\/\//i.test(video_url)) {
      return res.status(400).json({ error: 'Ссылка должна начинаться с https://' });
    }
    const lecture = db.prepare('SELECT id, video_url FROM lectures WHERE id = ?').get(req.params.id);
    if (!lecture) return res.status(404).json({ error: 'Лекция не найдена' });
    db.prepare('UPDATE lectures SET video_url = ? WHERE id = ?').run(video_url || null, lecture.id);

    // News-worthy the first time a lecture becomes watchable — not on every
    // re-save/replace of an already-set link, and not when clearing it.
    if (video_url && !lecture.video_url) {
      db.prepare('INSERT INTO team_events (event_type, user_id, ref_id) VALUES (?, ?, ?)')
        .run('lecture_video_added', req.user.id, lecture.id);
    }

    res.json({
      ok: true,
      warning: video_url && !KNOWN_VIDEO_HOSTS.test(video_url)
        ? 'Ссылка сохранена, но её хост не из привычного списка (YouTube/Google Диск/VK/Яндекс.Диск) — проверь, что она открывается.'
        : null,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/admin/task-types', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    res.json(db.prepare('SELECT id, name FROM task_types ORDER BY name').all());
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/admin/task-types', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Укажите название типа задачи' });
    const result = db.prepare('INSERT INTO task_types (name) VALUES (?)').run(name);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    if (isUniqueConstraintError(err)) return res.status(409).json({ error: 'Такой тип уже существует' });
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/admin/task-types/:id', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM task_types WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
