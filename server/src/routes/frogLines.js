// Everything the mascot says — the corner tip bubbles, the loading-screen
// one-liners, and the first-run tour steps. All three used to be arrays
// compiled into the client bundle, so fixing a typo in a tip meant a
// deploy. See the frog_lines table in db/schema.js for the shape and for
// the one-time seed of the copy they started as.
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware, requireRole } from '../auth.js';

const router = express.Router();

export const FROG_LINE_KINDS = ['tip', 'loader', 'tour'];
// Only 'tour' rows point at anything. Kept as a server-side allowlist rather
// than trusting the body, because a target that resolves to nothing is a
// tour step that silently skips itself — a failure nobody reports, since
// the tour only runs once and only for people who have no idea what they
// were supposed to see. Each value is a data-tour attribute the client puts
// on the real element, so the selector is derivable and the two can't drift
// apart — this list only decides what the editor is allowed to offer.
export const FROG_LINE_TARGETS = [
  'nav-home', 'nav-news', 'nav-courses', 'nav-team', 'nav-shop',
  'nav-guides', 'nav-suggestions', 'nav-help', 'nav-admin', 'nav-account',
  'frog-companion',
];
const ROLES = ['tester', 'lead', 'admin'];
const MAX_TEXT = 400;
const MAX_TITLE = 60;

// Everyone reads — the mascot talks to testers, and the tour is for them
// above all. `?kind=` narrows it; the editor asks for everything at once.
router.get('/api/frog-lines', authMiddleware, (req, res) => {
  try {
    const { kind } = req.query;
    if (kind && !FROG_LINE_KINDS.includes(kind)) return res.status(400).json({ error: 'Неизвестный тип' });
    const rows = kind
      ? db.prepare('SELECT * FROM frog_lines WHERE kind = ? ORDER BY order_num, id').all(kind)
      : db.prepare('SELECT * FROM frog_lines ORDER BY kind, order_num, id').all();
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

function validate(body) {
  const kind = String(body.kind || '');
  if (!FROG_LINE_KINDS.includes(kind)) return { error: 'Неизвестный тип' };
  const text = String(body.text || '').trim();
  if (!text) return { error: 'Текст не может быть пустым' };
  if (text.length > MAX_TEXT) return { error: `Текст длиннее ${MAX_TEXT} символов` };

  const title = String(body.title || '').trim();
  const target = String(body.target || '').trim();
  const role = String(body.role || '').trim();

  if (kind === 'tour') {
    if (!title) return { error: 'У шага тура нужен заголовок' };
    if (title.length > MAX_TITLE) return { error: `Заголовок длиннее ${MAX_TITLE} символов` };
    if (!FROG_LINE_TARGETS.includes(target)) return { error: 'Выберите, на что показывает шаг' };
  }
  if (role && !ROLES.includes(role)) return { error: 'Неизвестная роль' };

  return {
    value: {
      kind,
      text,
      // Title/target are meaningless outside a tour step; storing them anyway
      // would leave stale values behind if a row's kind is ever changed.
      title: kind === 'tour' ? title : null,
      target: kind === 'tour' ? target : null,
      role: role || null,
    },
  };
}

router.post('/api/frog-lines', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const { error, value } = validate(req.body);
    if (error) return res.status(400).json({ error });
    // New rows go to the end of their own kind rather than to a global 0 —
    // order_num is scoped to a kind everywhere it's read.
    const last = db.prepare('SELECT MAX(order_num) as m FROM frog_lines WHERE kind = ?').get(value.kind).m;
    const info = db.prepare(`
      INSERT INTO frog_lines (kind, text, title, target, role, order_num, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(value.kind, value.text, value.title, value.target, value.role, (last ?? -1) + 1, req.user.id);
    res.json(db.prepare('SELECT * FROM frog_lines WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/api/frog-lines/:id', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM frog_lines WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    const { error, value } = validate({ ...req.body, kind: row.kind }); // kind is fixed once created
    if (error) return res.status(400).json({ error });
    db.prepare('UPDATE frog_lines SET text = ?, title = ?, target = ?, role = ? WHERE id = ?')
      .run(value.text, value.title, value.target, value.role, row.id);
    res.json(db.prepare('SELECT * FROM frog_lines WHERE id = ?').get(row.id));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/frog-lines/:id', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM frog_lines WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Не найдено' });
    // Deleting the last tip or loader phrase would leave the mascot with
    // nothing to say and the client falling back to a blank string, so the
    // last one of a kind stays put. Tour steps have no such floor — a team
    // that wants no first-run tour should be able to have none.
    if (row.kind !== 'tour') {
      const remaining = db.prepare('SELECT COUNT(*) as c FROM frog_lines WHERE kind = ?').get(row.kind).c;
      if (remaining <= 1) return res.status(400).json({ error: 'Это последняя фраза этого типа — сначала добавь другую' });
    }
    db.prepare('DELETE FROM frog_lines WHERE id = ?').run(row.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
