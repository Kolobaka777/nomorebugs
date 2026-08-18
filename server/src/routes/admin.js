// Admin endpoints (user management, role changes), the shared trash/
// soft-delete recovery bin, scoped permission grants, and recognition/
// bonus ledgers. Split out from the old monolithic app.js — see
// PROGRESS.md.
//
// Deliberately its own role rather than folded into 'lead' — a team lead
// running courses/checklists for their team is a different concern from
// who can grant roles across the whole system. requireRole('admin') below
// means literally only 'admin' passes (admin doesn't need to bypass itself).
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware, requireRole } from '../auth.js';
import { ROLES, isValidRole } from '../roles.js';
import { notifyUser } from '../telegram.js';
import { revokeAllRefreshTokens, hardDeleteCourse, KNOWN_PERMISSIONS, displayName } from '../routeHelpers.js';

const router = express.Router();

router.get('/api/admin/users', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const archived = req.query.archived === '1';
    const users = db.prepare(`
      SELECT u.id, u.email, ${displayName('u')} as name, u.name as account_name, u.role, u.avatar_initials, u.created_at, u.archived_at,
        u.telegram_id IS NOT NULL as has_telegram, u.must_change_password,
        (SELECT MAX(a.created_at) FROM activity_log a WHERE a.user_id = u.id) as last_active
      FROM users u
      WHERE u.archived_at IS ${archived ? 'NOT NULL' : 'NULL'}
      ORDER BY u.created_at DESC
    `).all();
    res.json(users);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Archive — not delete. Every table with a user_id FK stays intact; this
// only blocks login (see authMiddleware/POST /auth/login) and hides the
// account from active-team views. A lead can archive/restore testers only
// (mirrors the reset-password and permission-grant rules); admin can act
// on anyone but themselves, and never the last remaining admin.
router.post('/api/admin/users/:id/archive', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (req.user.role === 'lead' && target.role !== 'tester') {
      return res.status(403).json({ error: 'Лид может архивировать только тестировщиков' });
    }
    if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя архивировать самого себя' });
    if (target.role === 'admin') {
      const otherAdmins = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND id != ? AND archived_at IS NULL").get(targetId);
      if (otherAdmins.c === 0) return res.status(400).json({ error: 'Нельзя архивировать последнего администратора' });
    }

    // A crash mid-sequence used to be able to archive the account (blocking
    // login) while leaving its existing session tokens still valid, or vice
    // versa — archiving with no audit trail of who did it or when.
    db.transaction(() => {
      db.prepare('UPDATE users SET archived_at = CURRENT_TIMESTAMP WHERE id = ?').run(targetId);
      revokeAllRefreshTokens(targetId);
      db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)').run(req.user.id, `user_archived:target=${targetId}`);
    })();
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/admin/users/:id/restore', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (req.user.role === 'lead' && target.role !== 'tester') {
      return res.status(403).json({ error: 'Лид может восстанавливать только тестировщиков' });
    }
    db.transaction(() => {
      db.prepare('UPDATE users SET archived_at = NULL WHERE id = ?').run(targetId);
      db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)').run(req.user.id, `user_restored:target=${targetId}`);
    })();
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== TRASH (soft-delete recovery) ==============
// One shared "recycle bin" across the content types worth protecting from
// an accidental delete — a course took real effort to build, a bug example/
// glossary term/guide likewise. Checklist templates, permission grants,
// etc. are deliberately NOT here: they're either trivial to recreate or
// already have their own audit trail (activity_log) instead of needing
// undo. Each entity's own DELETE route sets deleted_at instead of removing
// the row (see routes/knowledge.js, routes/courses.js, routes/
// suggestions.js); this just exposes that shared state as one admin-facing
// list with restore/purge.
const TRASH_TABLES = {
  bug_examples: { label: 'Пример бага', titleCol: 'problem' },
  glossary_terms: { label: 'Термин глоссария', titleCol: 'term' },
  guides: { label: 'Гайд', titleCol: 'title' },
  custom_courses: { label: 'Курс', titleCol: 'title' },
  suggestions: { label: 'Предложение', titleCol: 'text' },
};

router.get('/api/admin/trash', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const items = [];
    for (const [table, { label, titleCol }] of Object.entries(TRASH_TABLES)) {
      const rows = db.prepare(
        `SELECT id, ${titleCol} as title, deleted_at FROM ${table} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`
      ).all();
      for (const r of rows) items.push({ type: table, typeLabel: label, id: r.id, title: r.title, deleted_at: r.deleted_at });
    }
    items.sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));
    res.json(items);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/admin/trash/:type/:id/restore', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const { type, id } = req.params;
    if (!Object.prototype.hasOwnProperty.call(TRASH_TABLES, type)) return res.status(400).json({ error: 'Неизвестный тип' });
    db.prepare(`UPDATE ${type} SET deleted_at = NULL WHERE id = ?`).run(id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/admin/trash/:type/:id', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const { type, id } = req.params;
    if (!Object.prototype.hasOwnProperty.call(TRASH_TABLES, type)) return res.status(400).json({ error: 'Неизвестный тип' });
    if (type === 'custom_courses') {
      hardDeleteCourse(parseInt(id, 10));
    } else if (type === 'suggestions') {
      db.transaction(() => {
        db.prepare('DELETE FROM suggestion_likes WHERE suggestion_id = ?').run(id);
        db.prepare('DELETE FROM suggestions WHERE id = ?').run(id);
      })();
    } else {
      db.prepare(`DELETE FROM ${type} WHERE id = ?`).run(id);
    }
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Site-wide counts an admin needs but a lead's team dashboard doesn't show
// (that one's scoped to per-tester progress/scores) — registration mix,
// engagement over the last week/month, and how much content exists.
router.get('/api/admin/overview', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const byRole = db.prepare('SELECT role, COUNT(*) as c FROM users GROUP BY role').all();
    const totalUsers = byRole.reduce((sum, r) => sum + r.c, 0);
    const viaTelegram = db.prepare("SELECT COUNT(*) as c FROM users WHERE email LIKE '%@telegram.local'").get().c;

    const active7d = db.prepare(
      "SELECT COUNT(DISTINCT user_id) as c FROM activity_log WHERE created_at >= datetime('now', '-7 days')"
    ).get().c;
    const active30d = db.prepare(
      "SELECT COUNT(DISTINCT user_id) as c FROM activity_log WHERE created_at >= datetime('now', '-30 days')"
    ).get().c;

    const totalCourses = db.prepare('SELECT COUNT(*) as c FROM custom_courses WHERE deleted_at IS NULL').get().c;
    const totalGuides = db.prepare('SELECT COUNT(*) as c FROM guides WHERE deleted_at IS NULL').get().c;
    const totalBugExamples = db.prepare('SELECT COUNT(*) as c FROM bug_examples WHERE deleted_at IS NULL').get().c;
    const pendingPasswordResets = db.prepare('SELECT COUNT(*) as c FROM users WHERE must_change_password = 1').get().c;

    res.json({
      totalUsers,
      byRole: Object.fromEntries(byRole.map(r => [r.role, r.c])),
      viaTelegram,
      viaEmail: totalUsers - viaTelegram,
      active7d,
      active30d,
      totalCourses,
      totalGuides,
      totalBugExamples,
      pendingPasswordResets,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/api/admin/users/:id/role', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const { role } = req.body;
    if (!isValidRole(role)) {
      return res.status(400).json({ error: `Неизвестная роль. Допустимые: ${ROLES.join(', ')}` });
    }

    const targetId = parseInt(req.params.id, 10);
    if (!Number.isInteger(targetId)) {
      return res.status(400).json({ error: 'Некорректный id' });
    }

    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

    // An admin demoting themselves away from 'admin' with no other admin
    // left would permanently lock everyone out of role management — the
    // same class of mistake as deleting your own only SSH key.
    if (targetId === req.user.id && role !== 'admin') {
      const otherAdmins = db.prepare(
        "SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND id != ?"
      ).get(targetId);
      if (otherAdmins.c === 0) {
        return res.status(400).json({ error: 'Нельзя снять последнего администратора с роли — сначала назначьте другого' });
      }
    }

    // activity_log rows are otherwise always "this is what user_id did" —
    // role changes are the one place that's ambiguous (the row could
    // reasonably describe the target or the actor), and there was
    // previously no record at all of *which admin* made a given change.
    // Logged under the acting admin's id, action string carries the target.
    // Wrapped so a crash between the two can't leave a role change with no
    // record of who made it.
    db.transaction(() => {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
      db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)')
        .run(req.user.id, `admin_role_change:target=${targetId}:new_role=${role}`);
    })();

    const updatedTarget = db.prepare('SELECT id, email, name, role, telegram_id FROM users WHERE id = ?').get(targetId);
    notifyUser(updatedTarget, 'Роль изменена', `Твоя роль в baga-net изменена на "${role}".`);

    res.json({ ok: true, id: targetId, role });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== SCOPED PERMISSIONS ==============

// Any authenticated user: what am I currently allowed to do beyond my role?
// The client uses this to decide whether to show knowledge-base edit
// controls — re-checked from the DB on every call, so a revoked grant takes
// effect immediately rather than waiting for the user's JWT to expire.
router.get('/api/me/permissions', authMiddleware, (req, res) => {
  try {
    if (req.user.role === 'lead' || req.user.role === 'admin') {
      return res.json(KNOWN_PERMISSIONS);
    }
    const rows = db.prepare(`
      SELECT permission FROM granted_permissions
      WHERE user_id = ? AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    `).all(req.user.id);
    res.json(rows.map(r => r.permission));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead: list active grants (who has what, and until when)
router.get('/api/lead/permissions', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    // granted_by_role: lets the client flag grants whose issuer is no
    // longer a lead/admin (e.g. demoted since) so an admin can spot and
    // reconsider them — the grant itself stays valid either way (it's
    // checked against the *holder's* current role, not the granter's), so
    // this is surfacing for a manual decision, not an automatic revoke.
    const rows = db.prepare(`
      SELECT gp.id, gp.permission, gp.granted_at, gp.expires_at,
             u.id as user_id, ${displayName('u')} as user_name, u.avatar_initials,
             ${displayName('gb')} as granted_by_name, gb.role as granted_by_role,
             (SELECT gender FROM user_profiles WHERE user_id = gb.id) as granted_by_gender
      FROM granted_permissions gp
      JOIN users u ON u.id = gp.user_id
      JOIN users gb ON gb.id = gp.granted_by
      WHERE gp.expires_at IS NULL OR datetime(gp.expires_at) > datetime('now')
      ORDER BY gp.granted_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead: grant a permission to a tester. expires_at is optional (ISO string
// or null for "doesn't expire on its own").
router.post('/api/lead/permissions', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const { user_id, permission, expires_at } = req.body;
    if (!KNOWN_PERMISSIONS.includes(permission)) {
      return res.status(400).json({ error: `Неизвестное право. Допустимые: ${KNOWN_PERMISSIONS.join(', ')}` });
    }
    const targetId = parseInt(user_id, 10);
    const target = db.prepare('SELECT id, role, name, telegram_id, archived_at FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (target.role !== 'tester') return res.status(400).json({ error: 'Права можно выдавать только тестировщикам — лид и админ уже имеют полный доступ' });
    if (target.archived_at) return res.status(400).json({ error: 'Сотрудник архивирован — сначала восстановите аккаунт' });
    // Was silently accepted — a past expires_at is immediately excluded by
    // every read (hasPermission/the GET above both filter expires_at >
    // now), so the grant would return 200 and then simply never apply,
    // with nothing telling the lead why.
    if (expires_at && new Date(expires_at) <= new Date()) {
      return res.status(400).json({ error: 'Дата истечения должна быть в будущем' });
    }

    // Replace any existing grant of the same permission for this user
    // instead of stacking duplicates — wrapped so a crash between the
    // delete and the insert can't leave the user with neither (a request
    // mid-flight would silently drop an access grant that should exist).
    const grantId = db.transaction(() => {
      db.prepare('DELETE FROM granted_permissions WHERE user_id = ? AND permission = ?').run(targetId, permission);
      const result = db.prepare(
        'INSERT INTO granted_permissions (user_id, permission, granted_by, expires_at) VALUES (?, ?, ?, ?)'
      ).run(targetId, permission, req.user.id, expires_at || null);
      db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)')
        .run(req.user.id, `permission_granted:target=${targetId}:permission=${permission}`);
      return result.lastInsertRowid;
    })();
    notifyUser(target, 'Новые права', `Тебе выдано право «${permission}» в baga-net.`);

    res.json({ ok: true, id: grantId });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead: revoke a grant early
router.delete('/api/lead/permissions/:id', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const grant = db.prepare('SELECT * FROM granted_permissions WHERE id = ?').get(req.params.id);
    if (!grant) return res.status(404).json({ error: 'Не найдено' });
    db.transaction(() => {
      db.prepare('DELETE FROM granted_permissions WHERE id = ?').run(req.params.id);
      db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)')
        .run(req.user.id, `permission_revoked:target=${grant.user_id}:permission=${grant.permission}`);
    })();
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== RECOGNITION / BONUSES ==============
// Two separate ledgers, deliberately not mixed:
//  - bonus_awards / premium_points: visible to the tester, lead-awarded,
//    meant to eventually convert to something real-world (e.g. an отгул —
//    that conversion itself is a manual, off-app decision for now).
//  - internal_score_events: invisible to the tester, awarded automatically
//    by the server itself when a quality+speed bar is cleared (see the
//    submit-test and checklist-submit routes) — purely a signal for a lead
//    to see who's quietly excellent, never shown to or gameable by the
//    tester it's about.
// Neither is real money — that's a payroll/accounting decision this app
// deliberately doesn't process; see /api/admin/bonus-candidates for the
// admin-facing report meant to inform (not replace) that human decision.
const MAX_BONUS_AMOUNT = 500;

router.post('/api/lead/award-bonus', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const { user_id, amount, reason } = req.body;
    const targetId = parseInt(user_id, 10);
    const amt = parseInt(amount, 10);
    if (!Number.isInteger(amt) || amt <= 0 || amt > MAX_BONUS_AMOUNT) {
      return res.status(400).json({ error: `Сумма должна быть от 1 до ${MAX_BONUS_AMOUNT}` });
    }
    if (!reason?.trim()) return res.status(400).json({ error: 'Укажите причину премии' });

    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (target.role !== 'tester') return res.status(400).json({ error: 'Премию можно начислить только тестировщику' });
    if (target.archived_at) return res.status(400).json({ error: 'Сотрудник архивирован — сначала восстановите аккаунт' });

    db.transaction(() => {
      db.prepare('INSERT INTO bonus_awards (user_id, amount, reason, awarded_by) VALUES (?, ?, ?, ?)')
        .run(targetId, amt, reason.trim(), req.user.id);
      db.prepare(`
        INSERT INTO user_profiles (user_id, premium_points) VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET premium_points = COALESCE(premium_points, 0) + excluded.premium_points
      `).run(targetId, amt);
    })();

    notifyUser(target, 'Премия!', `Тебе начислено ${amt} премиальных баллов: «${reason.trim()}»`);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Self-service — the tester's own visible balance + history. Deliberately
// only ever reads bonus_awards, never internal_score_events.
router.get('/api/me/premium-points', authMiddleware, (req, res) => {
  try {
    const profile = db.prepare('SELECT premium_points FROM user_profiles WHERE user_id = ?').get(req.user.id);
    const history = db.prepare(`
      SELECT amount, reason, awarded_at, ${displayName('ab')} as awarded_by_name
      FROM bonus_awards ba JOIN users ab ON ab.id = ba.awarded_by
      WHERE ba.user_id = ? ORDER BY ba.awarded_at DESC LIMIT 20
    `).all(req.user.id);
    res.json({ premium_points: profile?.premium_points || 0, history });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead-only — "who's quietly excellent". Ranked by the hidden auto-scored
// points (quality+speed, anti-cheat-checked — see submit-test), with
// visible premium_points shown alongside for context. Never reachable by a
// tester about themselves.
router.get('/api/lead/internal-ratings', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        u.id, ${displayName('u')} as name, u.avatar_initials,
        (SELECT COALESCE(SUM(points), 0) FROM internal_score_events WHERE user_id = u.id) as hiddenScore,
        (SELECT COALESCE(premium_points, 0) FROM user_profiles WHERE user_id = u.id) as premiumPoints,
        (SELECT COUNT(*) FROM internal_score_events WHERE user_id = u.id AND source = 'auto_quiz_excellence') as excellentQuizzes
      FROM users u
      WHERE u.role = 'tester' AND u.archived_at IS NULL
      ORDER BY hiddenScore DESC
    `).all();

    // The star score alone answers "who", never "for what" — a lead had no
    // way to see what specifically earned it beyond the two bucket counts
    // above. Each event's own `reason` text (set at award time — see
    // submit-test / checklists.submit) already says exactly what happened,
    // just nowhere surfaced. Capped per tester so this stays one query
    // instead of N, and doesn't return an unbounded history.
    const RECENT_EVENTS_PER_TESTER = 10;
    const eventRows = rows.length
      ? db.prepare(`
          SELECT user_id, points, reason, source, created_at FROM internal_score_events
          WHERE user_id IN (${rows.map(() => '?').join(',')})
          ORDER BY created_at DESC
        `).all(...rows.map(r => r.id))
      : [];
    const eventsByUser = {};
    for (const e of eventRows) {
      (eventsByUser[e.user_id] = eventsByUser[e.user_id] || []);
      if (eventsByUser[e.user_id].length < RECENT_EVENTS_PER_TESTER) eventsByUser[e.user_id].push(e);
    }

    res.json(rows.map(r => ({ ...r, recentEvents: eventsByUser[r.id] || [] })));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/lead/bonus-awards', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT ba.id, ba.amount, ba.reason, ba.awarded_at, ${displayName('u')} as user_name, ${displayName('ab')} as awarded_by_name
      FROM bonus_awards ba
      JOIN users u ON u.id = ba.user_id
      JOIN users ab ON ab.id = ba.awarded_by
      ORDER BY ba.awarded_at DESC
      LIMIT 50
    `).all();
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: a ranked "who's earning it" report over the last 30 days — real
// payroll/bonus decisions stay a human (admin) call, this just surfaces the
// input data (pass rate, activity) instead of making someone dig through
// raw tables to find it.
router.get('/api/admin/bonus-candidates', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        u.id, ${displayName('u')} as name,
        (SELECT COUNT(*) FROM test_results tr WHERE tr.user_id = u.id AND tr.completed_at >= datetime('now', '-30 days')) as quizzesLast30d,
        (SELECT AVG(score) FROM test_results tr WHERE tr.user_id = u.id AND tr.completed_at >= datetime('now', '-30 days')) as avgScoreLast30d,
        (SELECT COALESCE(SUM(ba.amount), 0) FROM bonus_awards ba WHERE ba.user_id = u.id) as totalBonusReceived
      FROM users u
      WHERE u.role = 'tester'
      ORDER BY quizzesLast30d DESC
    `).all();
    res.json(rows.map(r => ({ ...r, avgScoreLast30d: r.avgScoreLast30d ? Math.round(r.avgScoreLast30d) : null })));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
