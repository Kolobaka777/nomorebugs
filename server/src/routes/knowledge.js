// Knowledge base (Багодельня): bug-example write-ups + glossary terms, and
// guides (lead/admin-editable articles replacing the team's external Notion
// docs).
import express from 'express';
import { db } from '../../db/schema.js';
import { displayName, logActivity } from '../routeHelpers.js';
import { logError } from '../sentry.js';
import { authMiddleware } from '../auth.js';
import { requirePermission, hasPermission, awardAchievement, ACHIEVEMENT_IDS, COIN_REWARDS, awardCoins } from '../routeHelpers.js';
import { notifyUser } from '../telegram.js';

// Truncates a rejected/approved proposal's own text for use inside a
// notification body — problem/term text can run up to MAX_SHORT_FIELD
// (5000 chars), way too long to put in a push notification.
function truncateForNotify(text, max = 60) {
  const s = String(text || '').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

const router = express.Router();

// A ceiling on the knowledge-base lists, none of which had one.
// These are curated content — a team's glossary and bug examples grow to
// hundreds of rows, not millions — so this is a backstop, not real
// pagination with a cursor the client walks. It exists so a list that grows
// unexpectedly (an import, a runaway script) degrades into "you see the
// most recent 500" instead of one response that keeps getting larger until
// something gives. The response shape is unchanged: still a plain array.
const KNOWLEDGE_LIST_CAP = 500;

function hasManageGuides(user) {
  return user.role === 'lead' || user.role === 'admin' || hasPermission(user.id, 'manage_guides');
}

function hasManageKB(user) {
  return user.role === 'lead' || user.role === 'admin' || hasPermission(user.id, 'manage_knowledge_base');
}

// Unlike profile.js's nickname/status_quote/info_box (which already cap
// length), these free-text fields had no limit beyond the global 3MB JSON
// body cap — plenty of room to paste something huge into a bug example or
// guide and bloat the DB. Internal small-team tool, so this is a sanity
// bound, not abuse-hardening.
const MAX_SHORT_FIELD = 5000; // problem/term — still plain short text, unlike the fields below
const MAX_TITLE = 200;
// bad_text/good_text/definition/guides.content are all JSON-serialized
// Tiptap documents now, not raw text — a short write-up with a couple of
// images (stored as base64 data URIs right in the doc, same trade-off as
// user_profiles.custom_avatar) weighs far more than the same words as
// plain markdown, hence the much higher cap than MAX_SHORT_FIELD/the old
// 5000/50000 text limits these fields used to have.
const MAX_RICH_FIELD = 200000;
const MAX_ICON_LENGTH = 16; // one emoji (incl. multi-codepoint ones like flags) plus headroom
const MAX_TAG_FIELD = 50; // tag/tag_color on bug_examples

// ============== KNOWLEDGE BASE (Багодельня) ==============

// Any tester can also *propose* a bug example or glossary term (POST
// below, unprivileged branch) — same shape as the course/guide proposal
// flow: forced unpublished + proposal_status='pending' until a lead
// approves it via the new .../approve routes further down.

router.get('/api/bug-examples', authMiddleware, (req, res) => {
  try {
    const canManage = hasManageKB(req.user);
    const rows = canManage
      // Lead/admin/grantee: everything, including everyone's pending
      // proposals — doubles as the review queue, same as guides.
      // LEFT JOIN, not JOIN — seeded rows (the original hardcoded content,
      // migrated in with created_by=NULL) would otherwise vanish entirely.
      ? db.prepare(`
          SELECT e.*, ${displayName('u')} as author_name, (SELECT gender FROM user_profiles WHERE user_id = u.id) as author_gender FROM bug_examples e
          LEFT JOIN users u ON u.id = e.created_by
          WHERE e.deleted_at IS NULL ORDER BY e.created_at DESC LIMIT ?
        `).all(KNOWLEDGE_LIST_CAP)
      : db.prepare(`
          SELECT e.*, ${displayName('u')} as author_name, (SELECT gender FROM user_profiles WHERE user_id = u.id) as author_gender FROM bug_examples e
          LEFT JOIN users u ON u.id = e.created_by
          WHERE e.deleted_at IS NULL AND (e.is_published = 1 OR e.created_by = ?) ORDER BY e.created_at DESC LIMIT ?
        `).all(req.user.id, KNOWLEDGE_LIST_CAP);
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/bug-examples', authMiddleware, (req, res) => {
  try {
    const { tag, tag_color, problem, bad_text, good_text } = req.body;
    // bad_text/good_text are JSON-serialized Tiptap docs now, not raw text
    // — an empty doc still serializes to a non-empty string, so their
    // presence isn't checked here the same way problem is (the client
    // already blocks submitting one with nothing actually typed in it via
    // richContentToPlainText; matches guides.content, which has no
    // server-side emptiness check either).
    if (!problem?.trim() || !bad_text || !good_text) {
      return res.status(400).json({ error: 'Заполните проблему, плохой и хороший пример' });
    }
    if (problem.trim().length > MAX_SHORT_FIELD || bad_text.length > MAX_RICH_FIELD || good_text.length > MAX_RICH_FIELD) {
      return res.status(400).json({ error: `Слишком длинный текст` });
    }
    if ((tag || '').trim().length > MAX_TAG_FIELD || (tag_color || '').trim().length > MAX_TAG_FIELD) {
      return res.status(400).json({ error: `Слишком длинный тег (макс ${MAX_TAG_FIELD} символов)` });
    }
    const canPublishDirectly = hasManageKB(req.user);
    const result = db.prepare(
      'INSERT INTO bug_examples (tag, tag_color, problem, bad_text, good_text, created_by, is_published, proposal_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      (tag || 'Общее').trim(), tag_color || '#7F77DD', problem.trim(), bad_text, good_text, req.user.id,
      canPublishDirectly ? 1 : 0, canPublishDirectly ? null : 'pending'
    );
    logActivity(req.user.id, `bug_example_created:${problem.trim().slice(0, 80)}`);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/bug-examples/:id', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM bug_examples WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Не найдено' });
    const { tag, tag_color, problem, bad_text, good_text } = req.body;
    if (!problem?.trim() || !bad_text || !good_text) {
      return res.status(400).json({ error: 'Заполните проблему, плохой и хороший пример' });
    }
    if (problem.trim().length > MAX_SHORT_FIELD || bad_text.length > MAX_RICH_FIELD || good_text.length > MAX_RICH_FIELD) {
      return res.status(400).json({ error: `Слишком длинный текст` });
    }
    if ((tag || '').trim().length > MAX_TAG_FIELD || (tag_color || '').trim().length > MAX_TAG_FIELD) {
      return res.status(400).json({ error: `Слишком длинный тег (макс ${MAX_TAG_FIELD} символов)` });
    }
    db.prepare(
      'UPDATE bug_examples SET tag = ?, tag_color = ?, problem = ?, bad_text = ?, good_text = ? WHERE id = ?'
    ).run((tag || 'Общее').trim(), tag_color || '#7F77DD', problem.trim(), bad_text, good_text, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Decline a proposal reuses this same route — when the target was pending,
// the outcome is stamped before it's soft-deleted so it still counts
// toward the author's proposal history (same pattern as guides).
router.delete('/api/bug-examples/:id', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const example = db.prepare('SELECT proposal_status, created_by, problem FROM bug_examples WHERE id = ?').get(req.params.id);
    const rejected = example?.proposal_status === 'pending';
    db.prepare(`UPDATE bug_examples SET deleted_at = CURRENT_TIMESTAMP${rejected ? ", proposal_status = 'rejected'" : ''} WHERE id = ?`).run(req.params.id);
    if (rejected && example.created_by && example.created_by !== req.user.id) {
      const author = db.prepare('SELECT * FROM users WHERE id = ?').get(example.created_by);
      if (author) notifyUser(author, 'Пример отклонён', `Твой предложенный пример бага «${truncateForNotify(example.problem)}» отклонён.`);
    }
    logActivity(req.user.id, `bug_example_deleted:${(example?.problem || '').slice(0, 80)}`);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve a pending bug-example proposal.
router.patch('/api/bug-examples/:id/approve', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const example = db.prepare('SELECT * FROM bug_examples WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!example) return res.status(404).json({ error: 'Не найдено' });
    if (example.proposal_status !== 'pending') return res.status(400).json({ error: 'Это не заявка на рассмотрении' });
    db.prepare("UPDATE bug_examples SET is_published = 1, proposal_status = 'approved' WHERE id = ?").run(example.id);
    if (example.created_by) {
      awardAchievement(example.created_by, ACHIEVEMENT_IDS.AVTOR);
      // Coins only when someone *else* signed off. A reviewer approving
      // their own proposal is just publishing, and paying for that would
      // make the reward self-serve for anyone holding the permission.
      if (example.created_by !== req.user.id) {
        awardCoins(example.created_by, COIN_REWARDS.proposalBugExample);
        const author = db.prepare('SELECT * FROM users WHERE id = ?').get(example.created_by);
        if (author) notifyUser(author, 'Пример одобрен!', `Твой предложенный пример бага «${truncateForNotify(example.problem)}» одобрен и опубликован. +${COIN_REWARDS.proposalBugExample} баг-коинов.`);
      }
    }
    logActivity(req.user.id, `bug_example_approved:${example.problem.slice(0, 80)}`);
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
    const canManage = hasManageKB(req.user);
    // LEFT JOIN, not JOIN — seeded terms (migrated in with created_by=NULL)
    // would otherwise vanish entirely.
    const rows = canManage
      ? db.prepare(`
          SELECT g.*, ${displayName('u')} as author_name, (SELECT gender FROM user_profiles WHERE user_id = u.id) as author_gender FROM glossary_terms g
          LEFT JOIN users u ON u.id = g.created_by
          WHERE g.deleted_at IS NULL ORDER BY g.term COLLATE NOCASE ASC LIMIT ?
        `).all(KNOWLEDGE_LIST_CAP)
      : db.prepare(`
          SELECT g.*, ${displayName('u')} as author_name, (SELECT gender FROM user_profiles WHERE user_id = u.id) as author_gender FROM glossary_terms g
          LEFT JOIN users u ON u.id = g.created_by
          WHERE g.deleted_at IS NULL AND (g.is_published = 1 OR g.created_by = ?) ORDER BY g.term COLLATE NOCASE ASC LIMIT ?
        `).all(req.user.id, KNOWLEDGE_LIST_CAP);
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/glossary', authMiddleware, (req, res) => {
  try {
    const { term, definition } = req.body;
    // Same emptiness-check nuance as bad_text/good_text above — definition
    // is now a JSON Tiptap doc, never falsy even when nothing was typed.
    if (!term?.trim() || !definition) {
      return res.status(400).json({ error: 'Заполните термин и определение' });
    }
    if (term.trim().length > MAX_TITLE || definition.length > MAX_RICH_FIELD) {
      return res.status(400).json({ error: `Слишком длинный текст` });
    }
    const canPublishDirectly = hasManageKB(req.user);
    const result = db.prepare(
      'INSERT INTO glossary_terms (term, definition, created_by, is_published, proposal_status) VALUES (?, ?, ?, ?, ?)'
    ).run(term.trim(), definition, req.user.id, canPublishDirectly ? 1 : 0, canPublishDirectly ? null : 'pending');
    logActivity(req.user.id, `glossary_created:${term.trim().slice(0, 80)}`);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/glossary/:id', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM glossary_terms WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Не найдено' });
    const { term, definition } = req.body;
    if (!term?.trim() || !definition) {
      return res.status(400).json({ error: 'Заполните термин и определение' });
    }
    if (term.trim().length > MAX_TITLE || definition.length > MAX_RICH_FIELD) {
      return res.status(400).json({ error: `Слишком длинный текст` });
    }
    db.prepare('UPDATE glossary_terms SET term = ?, definition = ? WHERE id = ?').run(term.trim(), definition, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Decline a proposal reuses this same route — same stamp-before-soft-delete
// pattern as bug-examples/guides.
router.delete('/api/glossary/:id', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const term = db.prepare('SELECT proposal_status, created_by, term FROM glossary_terms WHERE id = ?').get(req.params.id);
    const rejected = term?.proposal_status === 'pending';
    db.prepare(`UPDATE glossary_terms SET deleted_at = CURRENT_TIMESTAMP${rejected ? ", proposal_status = 'rejected'" : ''} WHERE id = ?`).run(req.params.id);
    if (rejected && term.created_by && term.created_by !== req.user.id) {
      const author = db.prepare('SELECT * FROM users WHERE id = ?').get(term.created_by);
      if (author) notifyUser(author, 'Термин отклонён', `Твой предложенный термин «${truncateForNotify(term.term)}» отклонён.`);
    }
    logActivity(req.user.id, `glossary_deleted:${(term?.term || '').slice(0, 80)}`);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve a pending glossary-term proposal.
router.patch('/api/glossary/:id/approve', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const term = db.prepare('SELECT * FROM glossary_terms WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!term) return res.status(404).json({ error: 'Не найдено' });
    if (term.proposal_status !== 'pending') return res.status(400).json({ error: 'Это не заявка на рассмотрении' });
    db.prepare("UPDATE glossary_terms SET is_published = 1, proposal_status = 'approved' WHERE id = ?").run(term.id);
    if (term.created_by) {
      awardAchievement(term.created_by, ACHIEVEMENT_IDS.AVTOR);
      // «Библиотекарь» — 5 approved glossary terms from this author.
      const approvedCount = db.prepare(
        "SELECT COUNT(*) as c FROM glossary_terms WHERE created_by = ? AND proposal_status = 'approved'"
      ).get(term.created_by).c;
      if (approvedCount >= 5) awardAchievement(term.created_by, ACHIEVEMENT_IDS.BIBLIOTEKAR);
      if (term.created_by !== req.user.id) {
        awardCoins(term.created_by, COIN_REWARDS.proposalGlossary);
        const author = db.prepare('SELECT * FROM users WHERE id = ?').get(term.created_by);
        if (author) notifyUser(author, 'Термин одобрен!', `Твой предложенный термин «${truncateForNotify(term.term)}» одобрен и опубликован. +${COIN_REWARDS.proposalGlossary} баг-коинов.`);
      }
    }
    logActivity(req.user.id, `glossary_approved:${term.term.slice(0, 80)}`);
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
          SELECT g.id, g.title, g.category, g.icon, g.updated_at, g.created_at, g.is_published, g.proposal_status, g.created_by, ${displayName('u')} as author_name,
            (SELECT gender FROM user_profiles WHERE user_id = u.id) as author_gender
          FROM guides g JOIN users u ON u.id = g.created_by
          WHERE g.deleted_at IS NULL ORDER BY g.category, g.title LIMIT ?
        `).all(KNOWLEDGE_LIST_CAP)
      // Everyone else: published guides, plus their own proposals whatever
      // their status (so they can at least see what they submitted).
      : db.prepare(`
          SELECT g.id, g.title, g.category, g.icon, g.updated_at, g.created_at, g.is_published, g.proposal_status, g.created_by, ${displayName('u')} as author_name,
            (SELECT gender FROM user_profiles WHERE user_id = u.id) as author_gender
          FROM guides g JOIN users u ON u.id = g.created_by
          WHERE g.deleted_at IS NULL AND (g.is_published = 1 OR g.created_by = ?) ORDER BY g.category, g.title LIMIT ?
        `).all(req.user.id, KNOWLEDGE_LIST_CAP);
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/guides/:id', authMiddleware, (req, res) => {
  try {
    const guide = db.prepare(`
      SELECT g.*, ${displayName('u')} as author_name, (SELECT gender FROM user_profiles WHERE user_id = u.id) as author_gender FROM guides g
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
// guides.content is now a JSON-serialized Tiptap document rather than the
// old hand-rolled markdown-subset text — but the server never parses or
// interprets it either way (the client is the only thing that ever renders
// it, via its own read-only Tiptap instance), so it stays an opaque string
// here, same as before. Deliberately NOT validated as JSON: the client's
// parseGuideContent already tolerates plain, non-JSON text (wraps it as a
// single paragraph) specifically so older content — or anything sent by a
// non-browser API caller — still renders as something instead of erroring.

router.post('/api/guides', authMiddleware, (req, res) => {
  try {
    const { title, category, content, icon } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Укажите заголовок' });
    if (title.trim().length > MAX_TITLE || (content && content.length > MAX_RICH_FIELD)) {
      return res.status(400).json({ error: `Слишком длинный текст (заголовок макс ${MAX_TITLE}, содержимое макс ${MAX_RICH_FIELD})` });
    }
    const canPublishDirectly = hasManageGuides(req.user);
    const result = db.prepare(
      'INSERT INTO guides (title, category, content, icon, created_by, is_published, proposal_status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      title.trim(), (category || 'Общее').trim(), content || '',
      icon ? String(icon).slice(0, MAX_ICON_LENGTH) : null,
      req.user.id, canPublishDirectly ? 1 : 0, canPublishDirectly ? null : 'pending'
    );
    if (canPublishDirectly) {
      db.prepare('INSERT INTO team_events (event_type, user_id, ref_id) VALUES (?, ?, ?)')
        .run('guide_published', req.user.id, result.lastInsertRowid);
    }
    logActivity(req.user.id, `guide_created:${title.trim().slice(0, 80)}`);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/guides/:id', authMiddleware, requirePermission('manage_guides'), (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM guides WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Не найдено' });
    const { title, category, content, icon } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Укажите заголовок' });
    if (title.trim().length > MAX_TITLE || (content && content.length > MAX_RICH_FIELD)) {
      return res.status(400).json({ error: `Слишком длинный текст (заголовок макс ${MAX_TITLE}, содержимое макс ${MAX_RICH_FIELD})` });
    }
    db.prepare('UPDATE guides SET title = ?, category = ?, content = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(title.trim(), (category || 'Общее').trim(), content || '', icon ? String(icon).slice(0, MAX_ICON_LENGTH) : null, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Bulk-rename a category across every guide that has it — categories are a
// plain free-text field (no separate table, unlike course_sections), so
// "rename" is just a mass UPDATE rather than editing one row.
router.patch('/api/guides/categories/rename', authMiddleware, requirePermission('manage_guides'), (req, res) => {
  try {
    const from = (req.body.from || '').trim();
    const to = (req.body.to || '').trim();
    if (!from || !to) return res.status(400).json({ error: 'Укажите старое и новое название категории' });
    if (to.length > MAX_TITLE) return res.status(400).json({ error: `Слишком длинное название (макс ${MAX_TITLE})` });
    db.prepare('UPDATE guides SET category = ? WHERE category = ?').run(to, from);
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
    const guide = db.prepare('SELECT proposal_status, created_by, title FROM guides WHERE id = ?').get(req.params.id);
    const rejected = guide?.proposal_status === 'pending';
    db.prepare(`UPDATE guides SET deleted_at = CURRENT_TIMESTAMP${rejected ? ", proposal_status = 'rejected'" : ''} WHERE id = ?`).run(req.params.id);
    if (rejected && guide.created_by && guide.created_by !== req.user.id) {
      const author = db.prepare('SELECT * FROM users WHERE id = ?').get(guide.created_by);
      if (author) notifyUser(author, 'Гайд отклонён', `Твой предложенный гайд «${truncateForNotify(guide.title)}» отклонён.`);
    }
    logActivity(req.user.id, `guide_deleted:${(guide?.title || '').slice(0, 80)}`);
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
    awardAchievement(guide.created_by, ACHIEVEMENT_IDS.AVTOR);
    // «Наставник» — 3 approved guides from this author.
    const approvedCount = db.prepare(
      "SELECT COUNT(*) as c FROM guides WHERE created_by = ? AND proposal_status = 'approved'"
    ).get(guide.created_by).c;
    if (approvedCount >= 3) awardAchievement(guide.created_by, ACHIEVEMENT_IDS.NASTAVNIK);
    if (guide.created_by !== req.user.id) {
      awardCoins(guide.created_by, COIN_REWARDS.proposalGuide);
      const author = db.prepare('SELECT * FROM users WHERE id = ?').get(guide.created_by);
      if (author) notifyUser(author, 'Гайд одобрен!', `Твой предложенный гайд «${truncateForNotify(guide.title)}» одобрен и опубликован. +${COIN_REWARDS.proposalGuide} баг-коинов.`);
    }
    logActivity(req.user.id, `guide_approved:${guide.title.slice(0, 80)}`);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
