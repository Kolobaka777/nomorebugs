// Knowledge base (Багодельня): bug-example write-ups + glossary terms, and
// guides (lead/admin-editable articles replacing the team's external Notion
// docs). Split out from the old monolithic app.js — see PROGRESS.md.
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware } from '../auth.js';
import { requirePermission } from '../routeHelpers.js';

const router = express.Router();

// Unlike profile.js's nickname/status_quote/info_box (which already cap
// length), these free-text fields had no limit beyond the global 3MB JSON
// body cap — plenty of room to paste something huge into a bug example or
// guide and bloat the DB. Internal small-team tool, so this is a sanity
// bound, not abuse-hardening.
const MAX_SHORT_FIELD = 5000; // problem/bad_text/good_text, term/definition
const MAX_TITLE = 200;
const MAX_GUIDE_CONTENT = 50000; // guides are meant to be full articles

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
    res.json(db.prepare('SELECT * FROM glossary_terms WHERE deleted_at IS NULL ORDER BY term ASC').all());
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

router.get('/api/guides', authMiddleware, (req, res) => {
  try {
    res.json(db.prepare('SELECT id, title, category, updated_at, created_at FROM guides WHERE deleted_at IS NULL ORDER BY category, title').all());
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/guides/:id', authMiddleware, (req, res) => {
  try {
    const guide = db.prepare('SELECT * FROM guides WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!guide) return res.status(404).json({ error: 'Не найдено' });
    res.json(guide);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/guides', authMiddleware, requirePermission('manage_guides'), (req, res) => {
  try {
    const { title, category, content } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Укажите заголовок' });
    if (title.trim().length > MAX_TITLE || (content && content.length > MAX_GUIDE_CONTENT)) {
      return res.status(400).json({ error: `Слишком длинный текст (заголовок макс ${MAX_TITLE}, содержимое макс ${MAX_GUIDE_CONTENT})` });
    }
    const result = db.prepare(
      'INSERT INTO guides (title, category, content, created_by) VALUES (?, ?, ?, ?)'
    ).run(title.trim(), (category || 'Общее').trim(), content || '', req.user.id);
    // Guides have no draft/publish toggle — creation is publishing.
    db.prepare('INSERT INTO team_events (event_type, user_id, ref_id) VALUES (?, ?, ?)')
      .run('guide_published', req.user.id, result.lastInsertRowid);
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

router.delete('/api/guides/:id', authMiddleware, requirePermission('manage_guides'), (req, res) => {
  try {
    db.prepare('UPDATE guides SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
