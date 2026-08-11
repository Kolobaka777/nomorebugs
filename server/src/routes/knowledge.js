// Knowledge base (Багодельня): bug-example write-ups + glossary terms, and
// guides (lead/admin-editable articles replacing the team's external Notion
// docs). Split out from the old monolithic app.js — see PROGRESS.md.
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware } from '../auth.js';
import { requirePermission, hasPermission } from '../routeHelpers.js';

const router = express.Router();

function hasManageGuides(user) {
  return user.role === 'lead' || user.role === 'admin' || hasPermission(user.id, 'manage_guides');
}

// Unlike profile.js's nickname/status_quote/info_box (which already cap
// length), these free-text fields had no limit beyond the global 3MB JSON
// body cap — plenty of room to paste something huge into a bug example or
// guide and bloat the DB. Internal small-team tool, so this is a sanity
// bound, not abuse-hardening.
const MAX_SHORT_FIELD = 5000; // problem/bad_text/good_text, term/definition
const MAX_TITLE = 200;
const MAX_GUIDE_CONTENT = 50000; // guides are meant to be full articles
const MAX_TAG_FIELD = 50; // tag/tag_color on bug_examples

// ============== KNOWLEDGE BASE (Багодельня) ==============

router.get('/api/bug-examples', authMiddleware, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM bug_examples WHERE deleted_at IS NULL ORDER BY created_at DESC').all());
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/bug-examples', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const { tag, tag_color, problem, bad_text, good_text } = req.body;
    if (!problem?.trim() || !bad_text?.trim() || !good_text?.trim()) {
      return res.status(400).json({ error: 'Заполните проблему, плохой и хороший пример' });
    }
    if (problem.trim().length > MAX_SHORT_FIELD || bad_text.trim().length > MAX_SHORT_FIELD || good_text.trim().length > MAX_SHORT_FIELD) {
      return res.status(400).json({ error: `Слишком длинный текст (макс ${MAX_SHORT_FIELD} символов на поле)` });
    }
    if ((tag || '').trim().length > MAX_TAG_FIELD || (tag_color || '').trim().length > MAX_TAG_FIELD) {
      return res.status(400).json({ error: `Слишком длинный тег (макс ${MAX_TAG_FIELD} символов)` });
    }
    const result = db.prepare(
      'INSERT INTO bug_examples (tag, tag_color, problem, bad_text, good_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run((tag || 'Общее').trim(), tag_color || '#7F77DD', problem.trim(), bad_text.trim(), good_text.trim(), req.user.id);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/bug-examples/:id', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM bug_examples WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Не найдено' });
    const { tag, tag_color, problem, bad_text, good_text } = req.body;
    if (!problem?.trim() || !bad_text?.trim() || !good_text?.trim()) {
      return res.status(400).json({ error: 'Заполните проблему, плохой и хороший пример' });
    }
    if (problem.trim().length > MAX_SHORT_FIELD || bad_text.trim().length > MAX_SHORT_FIELD || good_text.trim().length > MAX_SHORT_FIELD) {
      return res.status(400).json({ error: `Слишком длинный текст (макс ${MAX_SHORT_FIELD} символов на поле)` });
    }
    if ((tag || '').trim().length > MAX_TAG_FIELD || (tag_color || '').trim().length > MAX_TAG_FIELD) {
      return res.status(400).json({ error: `Слишком длинный тег (макс ${MAX_TAG_FIELD} символов)` });
    }
    db.prepare(
      'UPDATE bug_examples SET tag = ?, tag_color = ?, problem = ?, bad_text = ?, good_text = ? WHERE id = ?'
    ).run((tag || 'Общее').trim(), tag_color || '#7F77DD', problem.trim(), bad_text.trim(), good_text.trim(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/bug-examples/:id', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    db.prepare('UPDATE bug_examples SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/glossary', authMiddleware, (req, res) => {
  try {
    // Plain `ORDER BY term ASC` is a byte-wise/binary comparison, which
    // sorts every uppercase letter before every lowercase one — "DOM"
    // (all-caps) used to land before "DevTools" even though "De" < "DO"
    // alphabetically, because 'O' (0x4F) < 'e' (0x65) in raw byte order.
    // COLLATE NOCASE compares case-insensitively instead, matching what a
    // human means by "alphabetical".
    res.json(db.prepare('SELECT * FROM glossary_terms WHERE deleted_at IS NULL ORDER BY term COLLATE NOCASE ASC').all());
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/glossary', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const { term, definition } = req.body;
    if (!term?.trim() || !definition?.trim()) {
      return res.status(400).json({ error: 'Заполните термин и определение' });
    }
    if (term.trim().length > MAX_TITLE || definition.trim().length > MAX_SHORT_FIELD) {
      return res.status(400).json({ error: `Слишком длинный текст (термин макс ${MAX_TITLE}, определение макс ${MAX_SHORT_FIELD})` });
    }
    const result = db.prepare(
      'INSERT INTO glossary_terms (term, definition, created_by) VALUES (?, ?, ?)'
    ).run(term.trim(), definition.trim(), req.user.id);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/glossary/:id', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM glossary_terms WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Не найдено' });
    const { term, definition } = req.body;
    if (!term?.trim() || !definition?.trim()) {
      return res.status(400).json({ error: 'Заполните термин и определение' });
    }
    if (term.trim().length > MAX_TITLE || definition.trim().length > MAX_SHORT_FIELD) {
      return res.status(400).json({ error: `Слишком длинный текст (термин макс ${MAX_TITLE}, определение макс ${MAX_SHORT_FIELD})` });
    }
    db.prepare('UPDATE glossary_terms SET term = ?, definition = ? WHERE id = ?').run(term.trim(), definition.trim(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/glossary/:id', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    db.prepare('UPDATE glossary_terms SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== GUIDES ==============
// Lead/admin (or a granted tester — see manage_guides) editable articles,
// meant to replace the team's external Notion docs. Content is a plain
// safe-markdown-subset string (see client GuidesPage's renderer) — never
// raw HTML, so there's no dangerouslySetInnerHTML/XSS surface.
//
// Any other tester can also *propose* a guide (POST below, unprivileged
// branch) — same shape, but forced unpublished + proposal_status='pending'
// until a lead approves it. See routes/courses.js's near-identical course
// proposal flow for the parallel design.

router.get('/api/guides', authMiddleware, (req, res) => {
  try {
    const canManage = hasManageGuides(req.user);
    const rows = canManage
      // Lead/admin/grantee: everything, including everyone's pending
      // proposals — this doubles as the review queue, no separate route.
      ? db.prepare(`
          SELECT g.id, g.title, g.category, g.updated_at, g.created_at, g.is_published, g.proposal_status, g.created_by, u.name as author_name
          FROM guides g JOIN users u ON u.id = g.created_by
          WHERE g.deleted_at IS NULL ORDER BY g.category, g.title
        `).all()
      // Everyone else: published guides, plus their own proposals whatever
      // their status (so they can at least see what they submitted).
      : db.prepare(`
          SELECT g.id, g.title, g.category, g.updated_at, g.created_at, g.is_published, g.proposal_status, g.created_by, u.name as author_name
          FROM guides g JOIN users u ON u.id = g.created_by
          WHERE g.deleted_at IS NULL AND (g.is_published = 1 OR g.created_by = ?) ORDER BY g.category, g.title
        `).all(req.user.id);
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/guides/:id', authMiddleware, (req, res) => {
  try {
    const guide = db.prepare(`
      SELECT g.*, u.name as author_name FROM guides g
      JOIN users u ON u.id = g.created_by
      WHERE g.id = ? AND g.deleted_at IS NULL
    `).get(req.params.id);
    if (!guide) return res.status(404).json({ error: 'Не найдено' });
    if (!guide.is_published && guide.created_by !== req.user.id && !hasManageGuides(req.user)) {
      return res.status(403).json({ error: 'Нет доступа' });
    }
    res.json(guide);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create guide — lead/admin/a manage_guides grant publishes immediately, as
// before. Anyone else is proposing one: forced is_published=0,
// proposal_status='pending', visible only to its author and to a lead
// until approved (see GET routes above).
router.post('/api/guides', authMiddleware, (req, res) => {
  try {
    const { title, category, content } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Укажите заголовок' });
    if (title.trim().length > MAX_TITLE || (content && content.length > MAX_GUIDE_CONTENT)) {
      return res.status(400).json({ error: `Слишком длинный текст (заголовок макс ${MAX_TITLE}, содержимое макс ${MAX_GUIDE_CONTENT})` });
    }
    const canPublishDirectly = hasManageGuides(req.user);
    const result = db.prepare(
      'INSERT INTO guides (title, category, content, created_by, is_published, proposal_status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(title.trim(), (category || 'Общее').trim(), content || '', req.user.id, canPublishDirectly ? 1 : 0, canPublishDirectly ? null : 'pending');
    if (canPublishDirectly) {
      db.prepare('INSERT INTO team_events (event_type, user_id, ref_id) VALUES (?, ?, ?)')
        .run('guide_published', req.user.id, result.lastInsertRowid);
    }
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/guides/:id', authMiddleware, requirePermission('manage_guides'), (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM guides WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Не найдено' });
    const { title, category, content } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Укажите заголовок' });
    if (title.trim().length > MAX_TITLE || (content && content.length > MAX_GUIDE_CONTENT)) {
      return res.status(400).json({ error: `Слишком длинный текст (заголовок макс ${MAX_TITLE}, содержимое макс ${MAX_GUIDE_CONTENT})` });
    }
    db.prepare('UPDATE guides SET title = ?, category = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(title.trim(), (category || 'Общее').trim(), content || '', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Decline a proposal reuses this same route (lead/admin/grantee can already
// delete any guide, proposal or not) — when the target was pending, the
// outcome is stamped before it's soft-deleted so it still counts toward the
// author's proposal history.
router.delete('/api/guides/:id', authMiddleware, requirePermission('manage_guides'), (req, res) => {
  try {
    const guide = db.prepare('SELECT proposal_status FROM guides WHERE id = ?').get(req.params.id);
    const rejected = guide?.proposal_status === 'pending';
    db.prepare(`UPDATE guides SET deleted_at = CURRENT_TIMESTAMP${rejected ? ", proposal_status = 'rejected'" : ''} WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve a pending guide proposal — publishes it and fires the same
// guide_published news event a lead's own direct creation would, credited
// to the original author (not the approving lead), so the news feed reads
// like "Nazariy опубликовал гайд «X»" and not "Alex Lead опубликовал...".
router.patch('/api/guides/:id/approve', authMiddleware, requirePermission('manage_guides'), (req, res) => {
  try {
    const guide = db.prepare('SELECT * FROM guides WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!guide) return res.status(404).json({ error: 'Не найдено' });
    if (guide.proposal_status !== 'pending') return res.status(400).json({ error: 'Это не заявка на рассмотрении' });

    db.prepare("UPDATE guides SET is_published = 1, proposal_status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(guide.id);
    db.prepare('INSERT INTO team_events (event_type, user_id, ref_id) VALUES (?, ?, ?)')
      .run('guide_published', guide.created_by, guide.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
