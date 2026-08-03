// QA checklists: templates (manual + Excel import), submissions, stats.
// Split out from the old monolithic app.js — see PROGRESS.md.
import express from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware, requireRole } from '../auth.js';
import { isUniqueConstraintError, requirePermission } from '../routeHelpers.js';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// See the 'auto_checklist_clean' award below — caps the hidden-rating
// credit for a clean checklist run at this many per rolling 24h per tester.
const MAX_CHECKLIST_QUALITY_AWARDS_PER_DAY = 5;

router.get('/api/checklists/templates', authMiddleware, (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM checklist_templates ORDER BY order_num').all();
    const items = db.prepare('SELECT * FROM checklist_items ORDER BY template_id, order_num').all();
    const result = templates.map(t => ({
      ...t,
      items: items.filter(i => i.template_id === t.id),
    }));
    res.json(result);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/checklists/submit', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { template_id, task_name, content_author, verska_author, task_type, check_date, results } = req.body;

    if (!template_id || !task_name || !Array.isArray(results)) {
      return res.status(400).json({ error: 'Неверные данные' });
    }
    if (!task_name.trim()) return res.status(400).json({ error: 'Укажите название задачи' });

    const tpl = db.prepare('SELECT id FROM checklist_templates WHERE id = ?').get(template_id);
    if (!tpl) return res.status(404).json({ error: 'Шаблон не найден' });

    // A crash partway through would otherwise leave a permanently
    // incomplete submission on the record (a row with no/partial item
    // results) — wrapped so the whole thing commits or none of it does.
    const submissionId = db.transaction(() => {
      const sub = db.prepare(`
        INSERT INTO checklist_submissions (user_id, template_id, task_name, content_author, verska_author, task_type, check_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, template_id, task_name.trim(),
        content_author || '', verska_author || '', task_type || '', check_date || '');

      const insertResult = db.prepare(
        'INSERT INTO checklist_item_results (submission_id, item_id, status, note) VALUES (?, ?, ?, ?)'
      );
      let checkedCount = 0;
      let failCount = 0;
      for (const r of results) {
        if (r.item_id && r.status) {
          insertResult.run(sub.lastInsertRowid, r.item_id, r.status, (r.note || '').trim().slice(0, 1000));
          checkedCount++;
          if (r.status === 'fail') failCount++;
        }
      }

      db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)')
        .run(userId, `checklist_submitted:${template_id}`);

      // Hidden quality signal (see submit-test's matching comment) — a
      // meaningfully-sized checklist (5+ items actually checked) with zero
      // fails found. Not "no bugs exist", just "thorough enough to be worth
      // a lead's attention" — the actual QA judgment stays with the lead.
      // Unlike a lecture, a checklist submission has no natural identity to
      // dedupe on (task_name is free-typed and unreliable, and testers
      // legitimately submit many distinct real checklists over time) — so
      // instead of a one-time-ever gate, this caps how many times this
      // credit can land per day, closing the "resubmit the same trivial
      // checklist on a loop" farm without blocking genuine, spread-out work.
      if (checkedCount >= 5 && failCount === 0) {
        const recentCleanAwards = db.prepare(
          `SELECT COUNT(*) as c FROM internal_score_events
           WHERE user_id = ? AND source = 'auto_checklist_clean' AND created_at >= datetime('now', '-1 day')`
        ).get(userId)?.c || 0;
        if (recentCleanAwards < MAX_CHECKLIST_QUALITY_AWARDS_PER_DAY) {
          db.prepare('INSERT INTO internal_score_events (user_id, points, reason, source) VALUES (?, ?, ?, ?)')
            .run(userId, 3, `Чистый прогон чеклиста (${checkedCount} пунктов, 0 ошибок)`, 'auto_checklist_clean');
        }
      }

      return sub.lastInsertRowid;
    })();

    res.json({ success: true, submission_id: submissionId });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// All authenticated users: all submissions with filters
router.get('/api/checklists/submissions', authMiddleware, (req, res) => {
  try {
    const { template_id, tester, content_author, verska_author, task_type, date_from, date_to, sort = 'date_desc' } = req.query;
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const PAGE_SIZE = 50;

    let where = [];
    let params = [];

    if (template_id) { where.push('cs.template_id = ?'); params.push(template_id); }
    if (tester) { where.push('LOWER(u.name) LIKE ?'); params.push(`%${tester.toLowerCase()}%`); }
    if (content_author) { where.push('LOWER(cs.content_author) LIKE ?'); params.push(`%${content_author.toLowerCase()}%`); }
    if (verska_author) { where.push('LOWER(cs.verska_author) LIKE ?'); params.push(`%${verska_author.toLowerCase()}%`); }
    if (task_type) { where.push('cs.task_type = ?'); params.push(task_type); }
    // Filtered on submitted_at (a real, always-populated timestamp) rather
    // than check_date (free-typed by the tester, so unreliable format) —
    // see the task-types/date-range notes in ChecklistsPage.tsx.
    // datetime(), not date() — date_from/date_to arrive as full UTC instants
    // (the client converts the picked local calendar day to its UTC bounds
    // before sending), and date() would truncate both sides back to a bare
    // UTC calendar day, reintroducing the boundary mismatch this avoids.
    // datetime() still accepts a bare "YYYY-MM-DD" as midnight UTC, so old
    // callers/tests passing a plain date keep working unchanged.
    if (date_from) { where.push('datetime(cs.submitted_at) >= datetime(?)'); params.push(date_from); }
    if (date_to) { where.push('datetime(cs.submitted_at) <= datetime(?)'); params.push(date_to); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const orderMap = {
      date_desc: 'cs.submitted_at DESC',
      date_asc: 'cs.submitted_at ASC',
      fails_desc: 'fail_count DESC',
      fails_asc: 'fail_count ASC',
    };
    const orderBy = orderMap[sort] || 'cs.submitted_at DESC';

    const rows = db.prepare(`
      SELECT cs.id, cs.task_name, cs.content_author, cs.verska_author, cs.task_type, cs.check_date, cs.submitted_at,
             u.name as tester_name, u.avatar_initials,
             ct.name as template_name, ct.color,
             COUNT(CASE WHEN cir.status = 'fail' THEN 1 END) as fail_count,
             COUNT(cir.id) as total_items
      FROM checklist_submissions cs
      JOIN users u ON cs.user_id = u.id
      JOIN checklist_templates ct ON cs.template_id = ct.id
      LEFT JOIN checklist_item_results cir ON cir.submission_id = cs.id
      ${whereClause}
      GROUP BY cs.id
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, PAGE_SIZE + 1, offset);

    const hasMore = rows.length > PAGE_SIZE;
    res.json({ rows: rows.slice(0, PAGE_SIZE), hasMore });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// All authenticated users: distinct authors used in submissions
router.get('/api/checklists/authors', authMiddleware, (req, res) => {
  try {
    const contentAuthors = db.prepare(
      "SELECT DISTINCT content_author FROM checklist_submissions WHERE content_author != '' ORDER BY content_author"
    ).all().map(r => r.content_author);
    const verskaAuthors = db.prepare(
      "SELECT DISTINCT verska_author FROM checklist_submissions WHERE verska_author != '' ORDER BY verska_author"
    ).all().map(r => r.verska_author);
    res.json({ contentAuthors, verskaAuthors });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// All authenticated users: distinct task types actually used in submissions
// (free-typed by testers, so this reflects real values — not a fixed enum).
// The curated list (admin-managed — see /api/admin/task-types in
// routes/lecturesAdmin.js), not just whatever's been free-typed into
// submissions so far. A tester can still type a one-off custom value at
// submit time (TaskTypeSelect on the client keeps that escape hatch) —
// this only drives the suggested list.
router.get('/api/checklists/task-types', authMiddleware, (req, res) => {
  try {
    const types = db.prepare('SELECT name FROM task_types ORDER BY name').all().map(r => r.name);
    res.json(types);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead or submitter: detail of one submission
router.get('/api/checklists/submissions/:id', authMiddleware, (req, res) => {
  try {
    const sub = db.prepare(`
      SELECT cs.*, u.name as tester_name, ct.name as template_name, ct.color
      FROM checklist_submissions cs
      JOIN users u ON cs.user_id = u.id
      JOIN checklist_templates ct ON cs.template_id = ct.id
      WHERE cs.id = ?
    `).get(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Не найдено' });

    if (req.user.role !== 'lead' && req.user.role !== 'admin' && sub.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const results = db.prepare(`
      SELECT cir.status, cir.note, ci.text, ci.category, ci.order_num, ci.id as item_id
      FROM checklist_item_results cir
      JOIN checklist_items ci ON cir.item_id = ci.id
      WHERE cir.submission_id = ?
      ORDER BY ci.order_num
    `).all(req.params.id);

    res.json({ ...sub, results });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead: stats — by template, top fails, per tester, per content/verska author.
// Accepts the same optional filters as /api/checklists/submissions
// (template_id, task_type, date_from, date_to) so a lead can scope the
// whole report to e.g. "prelending checklists in the last week" instead of
// only ever seeing an unfiltered all-time aggregate.
router.get('/api/checklists/stats', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const { template_id, task_type, date_from, date_to } = req.query;

    const subFilters = [];
    const subParams = [];
    if (template_id) { subFilters.push('cs.template_id = ?'); subParams.push(template_id); }
    if (task_type) { subFilters.push('cs.task_type = ?'); subParams.push(task_type); }
    if (date_from) { subFilters.push('datetime(cs.submitted_at) >= datetime(?)'); subParams.push(date_from); }
    if (date_to) { subFilters.push('datetime(cs.submitted_at) <= datetime(?)'); subParams.push(date_to); }
    const subWhere = subFilters.length ? 'WHERE ' + subFilters.join(' AND ') : '';
    const subWhereAnd = subFilters.length ? 'AND ' + subFilters.join(' AND ') : '';

    const byTemplate = db.prepare(`
      SELECT ct.id, ct.name, ct.color,
             COUNT(DISTINCT cs.id) as submissions
      FROM checklist_templates ct
      LEFT JOIN checklist_submissions cs ON cs.template_id = ct.id ${subWhere ? subWhere.replace('WHERE', 'AND') : ''}
      GROUP BY ct.id
      ORDER BY ct.order_num
    `).all(...subParams);

    const topFails = db.prepare(`
      SELECT ci.text as item_text, ci.category, ct.name as template_name, ct.color,
             COUNT(*) as fail_count,
             (SELECT COUNT(*) FROM checklist_item_results cir2
              JOIN checklist_submissions cs2 ON cir2.submission_id = cs2.id
              WHERE cs2.template_id = ct.id AND cir2.item_id = ci.id ${subWhereAnd.replace(/cs\./g, 'cs2.')}) as total_checks
      FROM checklist_item_results cir
      JOIN checklist_items ci ON cir.item_id = ci.id
      JOIN checklist_submissions cs ON cir.submission_id = cs.id
      JOIN checklist_templates ct ON cs.template_id = ct.id
      WHERE cir.status = 'fail' ${subWhereAnd}
      GROUP BY ci.id
      ORDER BY fail_count DESC
      LIMIT 15
    `).all(...subParams, ...subParams);

    const byTester = db.prepare(`
      SELECT u.name as tester_name, u.avatar_initials,
             COUNT(DISTINCT cs.id) as submissions,
             COUNT(CASE WHEN cir.status = 'fail' THEN 1 END) as bugs_found
      FROM checklist_submissions cs
      JOIN users u ON cs.user_id = u.id
      LEFT JOIN checklist_item_results cir ON cir.submission_id = cs.id
      ${subWhere}
      GROUP BY u.id
      ORDER BY submissions DESC
    `).all(...subParams);

    const byContentAuthor = db.prepare(`
      SELECT cs.content_author,
             COUNT(DISTINCT cs.id) as submissions,
             COUNT(CASE WHEN cir.status = 'fail' THEN 1 END) as bugs_found
      FROM checklist_submissions cs
      LEFT JOIN checklist_item_results cir ON cir.submission_id = cs.id
      WHERE cs.content_author != '' ${subWhereAnd}
      GROUP BY cs.content_author
      ORDER BY bugs_found DESC
      LIMIT 20
    `).all(...subParams);

    const byVerskaAuthor = db.prepare(`
      SELECT cs.verska_author,
             COUNT(DISTINCT cs.id) as submissions,
             COUNT(CASE WHEN cir.status = 'fail' THEN 1 END) as bugs_found
      FROM checklist_submissions cs
      LEFT JOIN checklist_item_results cir ON cir.submission_id = cs.id
      WHERE cs.verska_author != '' ${subWhereAnd}
      GROUP BY cs.verska_author
      ORDER BY bugs_found DESC
      LIMIT 20
    `).all(...subParams);

    res.json({ byTemplate, topFails, byTester, byContentAuthor, byVerskaAuthor });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Import checklist template from Excel (all roles)
// Coerces an exceljs cell value (which may be rich text, a formula result, a
// Date, or a plain scalar) into a plain string for the flexible row parser below.
function cellToString(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v instanceof Date) return v.toISOString();
    return '';
  }
  return String(v);
}

// Manual template creation — the alternative to Excel import for a lead/
// admin who'd rather type a short checklist directly than build a
// spreadsheet for it. Same validation and insert shape as the import route
// below, just fed structured JSON instead of a parsed file.
router.post('/api/checklists/templates', authMiddleware, requirePermission('manage_checklists'), (req, res) => {
  try {
    const templateName = (req.body.name || '').trim();
    const templateColor = req.body.color || '#1D9E75';
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!templateName) return res.status(400).json({ error: 'Укажите название шаблона' });
    const cleanItems = items
      .map(i => ({ category: (i.category || 'Общее').trim() || 'Общее', text: (i.text || '').trim() }))
      .filter(i => i.text);
    if (cleanItems.length === 0) return res.status(400).json({ error: 'Добавьте хотя бы один пункт проверки' });

    const tplId = db.transaction(() => {
      const maxOrder = db.prepare('SELECT MAX(order_num) as m FROM checklist_templates').get();
      const nextOrder = (maxOrder.m || 0) + 1;
      const tpl = db.prepare(
        'INSERT INTO checklist_templates (name, task_type, color, order_num) VALUES (?, ?, ?, ?)'
      ).run(templateName, templateName.toLowerCase().replace(/\s+/g, '_'), templateColor, nextOrder);

      const insertItem = db.prepare(
        'INSERT INTO checklist_items (template_id, category, text, order_num) VALUES (?, ?, ?, ?)'
      );
      cleanItems.forEach((item, idx) => insertItem.run(tpl.lastInsertRowid, item.category, item.text, idx + 1));

      return tpl.lastInsertRowid;
    })();

    res.json({ success: true, id: tplId, name: templateName, item_count: cleanItems.length });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ error: 'Шаблон с таким названием уже существует' });
    }
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/checklists/templates/import', authMiddleware, requirePermission('manage_checklists'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(req.file.buffer);
    } catch {
      // multer only checks the file *size*, not its actual content — a
      // renamed non-xlsx file (or a corrupted one) reached ExcelJS and threw
      // here, previously falling through to the generic try/catch below and
      // surfacing as an opaque "Server error" instead of telling the lead
      // their file just isn't readable as an Excel file.
      return res.status(400).json({ error: 'Не удалось прочитать файл — убедитесь, что это настоящий .xlsx файл' });
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ error: 'В файле не найдено листов' });

    const rows = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      rows.push([cellToString(row.getCell(1).value), cellToString(row.getCell(2).value)]);
    });

    const templateName = (req.body.name || '').trim();
    const templateColor = req.body.color || '#1D9E75';

    if (!templateName) return res.status(400).json({ error: 'Укажите название шаблона' });

    const existing = db.prepare('SELECT id FROM checklist_templates WHERE name = ?').get(templateName);
    if (existing) return res.status(409).json({ error: 'Шаблон с таким именем уже существует' });

    // Flexible parser: works with any 1- or 2-column format.
    // Column A = category (when col B is empty) or ignored (when col B has content).
    // Column A only = item text when no col B exists in the whole sheet (single-column mode).
    // Rows that look like metadata headers (contain date/author keywords) are skipped.
    const SKIP_KEYWORDS = ['дата', 'date', 'автор', 'верстка', 'контент', 'тип задач', 'преленд', 'task', 'preland', 'author'];
    const looksLikeHeader = (a, b) =>
      SKIP_KEYWORDS.some(k => a.toLowerCase().includes(k) || b.toLowerCase().includes(k));

    // Detect if file is single-column (all content in col A, no col B at all)
    const hasTwoColumns = rows.some(r => String(r[1] || '').trim().length > 0);

    const items = [];
    let currentCategory = 'Общее';

    for (const row of rows) {
      const colA = String(row[0] || '').trim();
      const colB = String(row[1] || '').trim();

      if (!colA && !colB) continue;
      if (looksLikeHeader(colA, colB)) continue;

      if (hasTwoColumns) {
        // Two-column mode: col A = category header (when col B empty), col B = item text
        if (colA && !colB) { currentCategory = colA; continue; }
        if (colB) {
          if (colA) currentCategory = colA;
          items.push({ category: currentCategory, text: colB });
        }
      } else {
        // Single-column mode: col A alternates category / item based on indentation or just accumulates
        // Heuristic: short ALL-CAPS or ends with ":" → category, otherwise item
        const isCategoryHint = (colA === colA.toUpperCase() && colA.length > 2) || colA.endsWith(':');
        if (isCategoryHint) { currentCategory = colA.replace(/:$/, '').trim(); }
        else { items.push({ category: currentCategory, text: colA }); }
      }
    }

    if (items.length === 0) {
      return res.status(400).json({ error: 'В файле не найдено пунктов чеклиста. Проверь формат: колонка A — категория, колонка B — пункт.' });
    }

    // The category/item split above is a heuristic (ALL-CAPS or trailing ":"
    // in single-column mode), which can silently misparse an unexpected
    // layout into one flat category instead of erroring. Rather than trust
    // it blindly, surface a warning when every item landed in the fallback
    // "Общее" category — for most real checklists that's a sign the
    // category rows weren't recognized, not that the checklist is genuinely
    // flat. It's a warning, not a hard failure, since a flat list is also a
    // legitimate real format — the lead can decide whether to fix and re-import.
    const categoryBreakdown = {};
    for (const item of items) categoryBreakdown[item.category] = (categoryBreakdown[item.category] || 0) + 1;
    const categoryNames = Object.keys(categoryBreakdown);
    const suspiciousFlatImport = categoryNames.length === 1 && categoryNames[0] === 'Общее' && items.length > 5;

    // Template row + all its item rows must land together — a crash partway
    // through a large import used to be able to leave an orphaned template
    // with only some of its items.
    const tplId = db.transaction(() => {
      const maxOrder = db.prepare('SELECT MAX(order_num) as m FROM checklist_templates').get();
      const nextOrder = (maxOrder.m || 0) + 1;

      const tpl = db.prepare(
        'INSERT INTO checklist_templates (name, task_type, color, order_num) VALUES (?, ?, ?, ?)'
      ).run(templateName, templateName.toLowerCase().replace(/\s+/g, '_'), templateColor, nextOrder);

      const insertItem = db.prepare(
        'INSERT INTO checklist_items (template_id, category, text, order_num) VALUES (?, ?, ?, ?)'
      );
      items.forEach((item, idx) => insertItem.run(tpl.lastInsertRowid, item.category, item.text, idx + 1));

      return tpl.lastInsertRowid;
    })();

    res.json({
      success: true,
      id: tplId,
      name: templateName,
      item_count: items.length,
      category_count: categoryNames.length,
      warning: suspiciousFlatImport
        ? 'Все пункты попали в одну категорию «Общее» — возможно, категории в файле не распознались. Проверь исходный файл и результат импорта.'
        : null,
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ error: 'Шаблон с таким названием уже существует' });
    }
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead: update in_mvt flags per item (MVT config).
// Optimistic locking: the caller must echo back `expected_mvt_updated_at`
// (the stamp it loaded the template with) — if another lead has saved
// since, this 409s instead of silently overwriting their change.
router.patch('/api/checklists/templates/:id/mvt', authMiddleware, requirePermission('manage_checklists'), (req, res) => {
  try {
    const { items, expected_mvt_updated_at } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Неверные данные' });

    const tpl = db.prepare('SELECT mvt_updated_at FROM checklist_templates WHERE id = ?').get(req.params.id);
    if (!tpl) return res.status(404).json({ error: 'Шаблон не найден' });
    if ((tpl.mvt_updated_at || null) !== (expected_mvt_updated_at || null)) {
      return res.status(409).json({ error: 'Кто-то уже изменил настройки MVT для этого чеклиста — обнови страницу и попробуй снова' });
    }

    const now = new Date().toISOString();
    db.transaction(() => {
      const update = db.prepare('UPDATE checklist_items SET in_mvt = ? WHERE id = ? AND template_id = ?');
      for (const item of items) {
        update.run(item.in_mvt ? 1 : 0, item.id, req.params.id);
      }
      db.prepare('UPDATE checklist_templates SET mvt_updated_at = ? WHERE id = ?').run(now, req.params.id);
    })();
    res.json({ ok: true, mvt_updated_at: now });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Tester: task counts per template type
router.get('/api/tester/task-counts', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const rows = db.prepare(`
      SELECT ct.name, ct.task_type, ct.color,
             COUNT(cs.id) as count
      FROM checklist_templates ct
      LEFT JOIN checklist_submissions cs ON cs.template_id = ct.id AND cs.user_id = ?
      GROUP BY ct.id
      ORDER BY ct.order_num
    `).all(userId);
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
