// Suggestions / ideas board, plus the lead's own private folders for
// sorting them. Split out from the old monolithic app.js — see PROGRESS.md.
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware, requireRole } from '../auth.js';
import { parseDbDate, awardAchievement, ACHIEVEMENT_IDS } from '../routeHelpers.js';
import { notifyUser } from '../telegram.js';

const router = express.Router();

// ============== SUGGESTIONS / IDEAS BOARD ==============
// The real author (user_id) is always stored — is_anonymous only controls
// what OTHER testers see (below); leads/admins always get the real name
// plus the flag itself, so they know who to credit without accidentally
// outing an anonymous poster to the rest of the team.
// 'question' reuses this same board rather than a separate Q&A feature —
// it gets an answer/answered_at/answered_by instead of a folder/status
// triage flow. The board is shared (not a private inbox), so an answered
// question doubles as a lightweight public FAQ: anyone browsing sees it
// already answered instead of asking the same thing again.
const SUGGESTION_TYPES = ['idea', 'suggestion', 'complaint', 'question'];
const SUGGESTION_TYPE_LABELS = { idea: 'идея', suggestion: 'предложение', complaint: 'жалоба', question: 'вопрос' };
const SUGGESTION_STATUSES = ['new', 'reviewed', 'implemented', 'declined'];
const MAX_SUGGESTION_LENGTH = 2000;
// How long an author can still edit/delete their own post — after this,
// only a lead can touch it (via status/delete, still not edit its text).
const SUGGESTION_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

router.get('/api/suggestions', authMiddleware, (req, res) => {
  try {
    const isLead = req.user.role === 'lead' || req.user.role === 'admin';
    // Unlike most lists in this app (seeded content, org-sized rosters),
    // this is a genuine open-ended user-generated feed — it only grows, so
    // it's the one that actually needed real pagination instead of "return
    // everything".
    const PAGE_SIZE = 30;
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const rows = db.prepare(`
      SELECT s.id, s.type, s.text, s.status, s.created_at, s.is_anonymous,
        s.answer, s.answered_at, a.name as answered_by_name,
        ${isLead ? 's.user_id' : '(CASE WHEN s.is_anonymous THEN NULL ELSE s.user_id END)'} as user_id,
        ${isLead ? 'u.name' : '(CASE WHEN s.is_anonymous THEN NULL ELSE u.name END)'} as author_name,
        (SELECT COUNT(*) FROM suggestion_likes WHERE suggestion_id = s.id) as likeCount,
        EXISTS(SELECT 1 FROM suggestion_likes WHERE suggestion_id = s.id AND user_id = ?) as likedByMe
        ${isLead ? ', s.folder_id, f.name as folder_name' : ''}
      FROM suggestions s JOIN users u ON u.id = s.user_id
      LEFT JOIN users a ON a.id = s.answered_by
      ${isLead ? 'LEFT JOIN suggestion_folders f ON f.id = s.folder_id' : ''}
      WHERE s.deleted_at IS NULL
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, PAGE_SIZE + 1, offset);

    const hasMore = rows.length > PAGE_SIZE;
    res.json({
      rows: rows.slice(0, PAGE_SIZE).map(r => ({ ...r, is_anonymous: !!r.is_anonymous, likedByMe: !!r.likedByMe })),
      hasMore,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/suggestions', authMiddleware, (req, res) => {
  try {
    const { type, text, is_anonymous } = req.body;
    if (!SUGGESTION_TYPES.includes(type)) return res.status(400).json({ error: 'Некорректный тип' });
    if (!text?.trim()) return res.status(400).json({ error: 'Напиши текст предложения' });
    if (text.trim().length > MAX_SUGGESTION_LENGTH) {
      return res.status(400).json({ error: `Слишком длинный текст (макс ${MAX_SUGGESTION_LENGTH})` });
    }

    const id = db.prepare(
      'INSERT INTO suggestions (user_id, type, text, is_anonymous) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, type, text.trim(), is_anonymous ? 1 : 0).lastInsertRowid;

    // Fan-out — notifyUser is single-target only, so a small loop over every
    // lead/admin is the natural place for this; no telegram.js change needed.
    const leads = db.prepare("SELECT * FROM users WHERE role IN ('lead','admin') AND archived_at IS NULL").all();
    const preview = text.trim().slice(0, 200);
    const subject = type === 'question' ? 'Новый вопрос от команды' : 'Новая идея от команды';
    const label = SUGGESTION_TYPE_LABELS[type] || type;
    for (const lead of leads) {
      notifyUser(lead, subject, `Поступило новое сообщение (${label}): "${preview}"`);
    }

    res.status(201).json({ id });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Author-only, and only inside the 24h window — after that the post is
// frozen except for lead triage (status/delete).
router.put('/api/suggestions/:id', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM suggestions WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Можно редактировать только свои предложения' });
    if (Date.now() - parseDbDate(row.created_at).getTime() > SUGGESTION_EDIT_WINDOW_MS) {
      return res.status(403).json({ error: 'Редактирование доступно только в течение 24 часов после публикации' });
    }

    const { type, text, is_anonymous } = req.body;
    if (!SUGGESTION_TYPES.includes(type)) return res.status(400).json({ error: 'Некорректный тип' });
    if (!text?.trim()) return res.status(400).json({ error: 'Напиши текст предложения' });
    if (text.trim().length > MAX_SUGGESTION_LENGTH) {
      return res.status(400).json({ error: `Слишком длинный текст (макс ${MAX_SUGGESTION_LENGTH})` });
    }

    db.prepare('UPDATE suggestions SET type = ?, text = ?, is_anonymous = ? WHERE id = ?')
      .run(type, text.trim(), is_anonymous ? 1 : 0, row.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/suggestions/:id/like', authMiddleware, (req, res) => {
  try {
    const inserted = db.prepare('INSERT OR IGNORE INTO suggestion_likes (suggestion_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.id);
    // «Голос команды» — 10+ likes across everything this author has ever
    // posted (any type, not just this one suggestion).
    if (inserted.changes > 0) {
      const author = db.prepare('SELECT user_id FROM suggestions WHERE id = ?').get(req.params.id);
      if (author) {
        const totalLikes = db.prepare(`
          SELECT COUNT(*) as c FROM suggestion_likes sl
          JOIN suggestions s ON s.id = sl.suggestion_id
          WHERE s.user_id = ?
        `).get(author.user_id).c;
        if (totalLikes >= 10) awardAchievement(author.user_id, ACHIEVEMENT_IDS.GOLOS_KOMANDY);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/suggestions/:id/like', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM suggestion_likes WHERE suggestion_id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead answers a question — the answer stays attached to the suggestion
// row itself (no separate replies table/thread), and the asker gets a
// Telegram ping the same way a lead gets pinged on a new question, just
// mirrored the other direction. Editing an existing answer re-notifies —
// simplest correct behavior, and answers are expected to be rare edits.
router.patch('/api/suggestions/:id/answer', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM suggestions WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    if (row.type !== 'question') return res.status(400).json({ error: 'Отвечать можно только на вопросы' });
    const { answer } = req.body;
    if (!answer?.trim()) return res.status(400).json({ error: 'Напиши текст ответа' });
    if (answer.trim().length > MAX_SUGGESTION_LENGTH) {
      return res.status(400).json({ error: `Слишком длинный текст (макс ${MAX_SUGGESTION_LENGTH})` });
    }
    db.prepare('UPDATE suggestions SET answer = ?, answered_at = CURRENT_TIMESTAMP, answered_by = ? WHERE id = ?')
      .run(answer.trim(), req.user.id, row.id);

    // «Голос команды» (alternate trigger) — 5 of this asker's questions
    // have now been answered by a lead.
    const answeredCount = db.prepare(
      "SELECT COUNT(*) as c FROM suggestions WHERE user_id = ? AND type = 'question' AND answer IS NOT NULL AND deleted_at IS NULL"
    ).get(row.user_id).c;
    if (answeredCount >= 5) awardAchievement(row.user_id, ACHIEVEMENT_IDS.GOLOS_KOMANDY);

    const asker = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
    if (asker) {
      notifyUser(asker, 'Ответ на твой вопрос', `Тимлид ответил на твой вопрос: "${answer.trim().slice(0, 200)}"`);
    }
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/api/suggestions/:id/status', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const { status } = req.body;
    if (!SUGGESTION_STATUSES.includes(status)) return res.status(400).json({ error: 'Некорректный статус' });
    db.prepare('UPDATE suggestions SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead/admin can always delete (triage); the author can also delete their
// own post, but only inside the same 24h window PUT uses.
router.delete('/api/suggestions/:id', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM suggestions WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    const isLead = req.user.role === 'lead' || req.user.role === 'admin';
    const isOwnWithinWindow = row.user_id === req.user.id
      && (Date.now() - parseDbDate(row.created_at).getTime() <= SUGGESTION_EDIT_WINDOW_MS);
    if (!isLead && !isOwnWithinWindow) return res.status(403).json({ error: 'Нет доступа' });

    db.prepare('UPDATE suggestions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== SUGGESTION FOLDERS (lead-only, private) ==============
// Purely the lead's own sorting — never exposed to testers. Deleting a
// folder just un-files whatever was in it rather than deleting those
// suggestions.

router.get('/api/lead/suggestion-folders', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM suggestion_folders ORDER BY name').all());
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/lead/suggestion-folders', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Укажите название папки' });
    const id = db.prepare('INSERT INTO suggestion_folders (name, created_by) VALUES (?, ?)').run(name, req.user.id).lastInsertRowid;
    res.status(201).json({ id, name });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/lead/suggestion-folders/:id', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    db.transaction(() => {
      db.prepare('UPDATE suggestions SET folder_id = NULL WHERE folder_id = ?').run(req.params.id);
      db.prepare('DELETE FROM suggestion_folders WHERE id = ?').run(req.params.id);
    })();
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/api/suggestions/:id/folder', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const { folder_id } = req.body;
    db.prepare('UPDATE suggestions SET folder_id = ? WHERE id = ?').run(folder_id || null, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
