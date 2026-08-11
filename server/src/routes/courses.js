// Custom courses (modules/lessons/quizzes) + course time tracking. Split
// out from the old monolithic app.js — see PROGRESS.md.
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware, requireRole } from '../auth.js';
import { requirePermission, hasPermission, awardAchievement, ACHIEVEMENT_IDS } from '../routeHelpers.js';

const router = express.Router();

// A custom course can be edited/published/deleted by whoever authored it,
// or by an admin. A lead can additionally manage *any* pending proposal
// (not just their own courses) — that's the whole point of the review
// queue: a tester's proposal needs a lead's approve/decline regardless of
// who happens to review it, while an ordinary lead-authored course stays
// "own only" as before.
function canManageCourse(course, user) {
  if (user.role === 'admin') return true;
  if (course.created_by === user.id) return true;
  if (course.proposal_status === 'pending' && user.role === 'lead') return true;
  return false;
}

function hasManageCourses(user) {
  return user.role === 'lead' || user.role === 'admin' || hasPermission(user.id, 'manage_courses');
}

// List: testers see published (+ their own proposals, any status); lead
// sees own + published + everyone's pending proposals (the review queue —
// see canManageCourse above for why "pending" specifically is the carve-out).
router.get('/api/custom-courses', authMiddleware, (req, res) => {
  try {
    let rows;
    if (req.user.role === 'lead') {
      rows = db.prepare(`
        SELECT cc.*, u.name as author_name,
          EXISTS(SELECT 1 FROM custom_course_views v WHERE v.user_id = ? AND v.course_id = cc.id) as viewed,
          (SELECT COUNT(DISTINCT ctt.user_id) FROM course_time_tracking ctt WHERE ctt.course_id = cc.id) as completedCount,
          COALESCE((SELECT deadline_at FROM course_deadline_overrides WHERE course_id = cc.id AND user_id = ?), cc.deadline_at) as effectiveDeadline
        FROM custom_courses cc
        JOIN users u ON u.id = cc.created_by
        WHERE (cc.created_by = ? OR cc.is_published = 1 OR cc.proposal_status = 'pending') AND cc.deleted_at IS NULL
        ORDER BY cc.created_at DESC
      `).all(req.user.id, req.user.id, req.user.id);
      const totalTesters = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'tester' AND archived_at IS NULL").get().c;
      rows = rows.map(r => ({ ...r, totalTesters }));
    } else {
      rows = db.prepare(`
        SELECT cc.*, u.name as author_name,
          EXISTS(SELECT 1 FROM custom_course_views v WHERE v.user_id = ? AND v.course_id = cc.id) as viewed,
          COALESCE((SELECT deadline_at FROM course_deadline_overrides WHERE course_id = cc.id AND user_id = ?), cc.deadline_at) as effectiveDeadline
        FROM custom_courses cc
        JOIN users u ON u.id = cc.created_by
        WHERE (cc.is_published = 1 OR cc.created_by = ?) AND cc.deleted_at IS NULL
        ORDER BY cc.created_at DESC
      `).all(req.user.id, req.user.id, req.user.id);
    }
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Full course with modules, lessons, questions
router.get('/api/custom-courses/:id', authMiddleware, (req, res) => {
  try {
    const course = db.prepare(`
      SELECT cc.*, u.name as author_name
      FROM custom_courses cc JOIN users u ON u.id = cc.created_by
      WHERE cc.id = ? AND cc.deleted_at IS NULL
    `).get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Не найдено' });
    if (!course.is_published && !canManageCourse(course, req.user)) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    db.prepare('INSERT OR IGNORE INTO custom_course_views (user_id, course_id) VALUES (?, ?)').run(req.user.id, course.id);

    const completedIds = new Set(
      db.prepare('SELECT lesson_id FROM custom_lesson_progress WHERE user_id = ?').all(req.user.id).map(r => r.lesson_id)
    );

    // Batched instead of one query per module (+ one more per quiz lesson):
    // a course with 10 modules x 5 lessons used to cost 50+ round trips for
    // a single page load. Fetch everything for the whole course in 3 fixed
    // queries total and group it back together in JS.
    const modules = db.prepare('SELECT * FROM custom_modules WHERE course_id = ? ORDER BY order_num').all(course.id);
    const moduleIds = modules.map(m => m.id);

    const allLessons = moduleIds.length
      ? db.prepare(`SELECT * FROM custom_lessons WHERE module_id IN (${moduleIds.map(() => '?').join(',')}) ORDER BY order_num`).all(...moduleIds)
      : [];
    const lessonIds = allLessons.map(l => l.id);

    const allQuestions = lessonIds.length
      ? db.prepare(`SELECT * FROM custom_quiz_questions WHERE lesson_id IN (${lessonIds.map(() => '?').join(',')}) ORDER BY order_num`).all(...lessonIds)
      : [];
    const questionsByLesson = new Map();
    for (const q of allQuestions) {
      if (!questionsByLesson.has(q.lesson_id)) questionsByLesson.set(q.lesson_id, []);
      questionsByLesson.get(q.lesson_id).push(q);
    }

    const lessonsByModule = new Map();
    for (const lesson of allLessons) {
      if (lesson.type === 'quiz') lesson.questions = questionsByLesson.get(lesson.id) || [];
      lesson.completed = completedIds.has(lesson.id);
      // Only a 'mandatory' prerequisite can lock access — 'optional' is a
      // non-blocking recommendation (e.g. unverifiable external reading),
      // and 'none' has no gate at all.
      lesson.locked = lesson.prerequisite_type === 'mandatory'
        && lesson.prerequisite_lesson_id != null
        && !completedIds.has(lesson.prerequisite_lesson_id);
      if (!lessonsByModule.has(lesson.module_id)) lessonsByModule.set(lesson.module_id, []);
      lessonsByModule.get(lesson.module_id).push(lesson);
    }
    for (const mod of modules) {
      mod.lessons = lessonsByModule.get(mod.id) || [];
    }

    // Lead/admin get to see who on the team has actually engaged with this
    // course, not just an aggregate — "click into a course, see the people
    // and their progress" was previously nowhere in the app.
    let progressByTester;
    let deadlineOverrides;
    if (req.user.role === 'lead' || req.user.role === 'admin') {
      const testers = db.prepare("SELECT id, name, avatar_initials FROM users WHERE role = 'tester' AND archived_at IS NULL ORDER BY name").all();
      const lessonProgressRows = lessonIds.length
        ? db.prepare(`SELECT user_id, COUNT(*) as c FROM custom_lesson_progress WHERE lesson_id IN (${lessonIds.map(() => '?').join(',')}) GROUP BY user_id`).all(...lessonIds)
        : [];
      const completedLessonsByUser = Object.fromEntries(lessonProgressRows.map(r => [r.user_id, r.c]));
      const finishedRows = db.prepare('SELECT user_id, completed_at FROM course_time_tracking WHERE course_id = ?').all(course.id);
      const finishedAtByUser = Object.fromEntries(finishedRows.map(r => [r.user_id, r.completed_at]));
      progressByTester = testers.map(t => ({
        id: t.id,
        name: t.name,
        avatar_initials: t.avatar_initials,
        completedLessons: completedLessonsByUser[t.id] || 0,
        totalLessons: lessonIds.length,
        finished: !!finishedAtByUser[t.id],
        finishedAt: finishedAtByUser[t.id] || null,
      }));
      deadlineOverrides = db.prepare(`
        SELECT o.user_id, o.deadline_at, o.reason, u.name
        FROM course_deadline_overrides o JOIN users u ON u.id = o.user_id
        WHERE o.course_id = ?
      `).all(course.id);
    }

    const effectiveDeadline = db.prepare(
      'SELECT deadline_at FROM course_deadline_overrides WHERE course_id = ? AND user_id = ?'
    ).get(course.id, req.user.id)?.deadline_at || course.deadline_at || null;

    res.json({
      ...course,
      modules,
      effectiveDeadline,
      ...(progressByTester ? { progressByTester } : {}),
      ...(deadlineOverrides ? { deadlineOverrides } : {}),
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark a custom-course lesson complete. Previously this was tracked only in
// localStorage (client-only — spoofable, didn't sync across devices, and
// meant "mandatory" prerequisites had nothing real to check against).
router.post('/api/custom-lessons/:id/complete', authMiddleware, (req, res) => {
  try {
    const lesson = db.prepare('SELECT * FROM custom_lessons WHERE id = ?').get(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Урок не найден' });

    if (lesson.prerequisite_type === 'mandatory' && lesson.prerequisite_lesson_id != null) {
      const prereqDone = db.prepare(
        'SELECT 1 FROM custom_lesson_progress WHERE user_id = ? AND lesson_id = ?'
      ).get(req.user.id, lesson.prerequisite_lesson_id);
      if (!prereqDone) {
        return res.status(403).json({ error: 'Сначала нужно пройти предыдущий урок' });
      }
    }

    db.prepare(
      'INSERT OR IGNORE INTO custom_lesson_progress (user_id, lesson_id) VALUES (?, ?)'
    ).run(req.user.id, lesson.id);

    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Inserts modules/lessons/questions for a course and resolves 'mandatory'
// prerequisite references. The client can only know a lesson's real DB id
// after it's inserted, so a lesson picked as someone else's prerequisite is
// sent as `prerequisite_lesson_local_id` (the course-builder's client-side
// draft id) — pass 1 inserts everything and records local->real id, pass 2
// resolves those references now that every lesson has a real id.
function insertCourseModules(courseId, modules) {
  if (!Array.isArray(modules)) return;

  const localIdToRealId = new Map();
  const pendingPrereqs = []; // { lessonId, localPrereqId }

  modules.forEach((mod, mIdx) => {
    const modRow = db.prepare('INSERT INTO custom_modules (course_id, title, order_num) VALUES (?, ?, ?)').run(courseId, mod.title || '', mIdx);
    const modId = modRow.lastInsertRowid;
    if (!Array.isArray(mod.lessons)) return;

    mod.lessons.forEach((lesson, lIdx) => {
      const lessonRow = db.prepare(`
        INSERT INTO custom_lessons (module_id, title, type, content, order_num, prerequisite_type, prerequisite_note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        modId, lesson.title || '', lesson.type || 'lesson', lesson.content || '', lIdx,
        lesson.prerequisite_type || 'none',
        lesson.prerequisite_type === 'optional' ? (lesson.prerequisite_note || '') : ''
      );
      const lessonId = lessonRow.lastInsertRowid;

      if (lesson._id) localIdToRealId.set(lesson._id, lessonId);
      if (lesson.prerequisite_type === 'mandatory' && lesson.prerequisite_lesson_local_id) {
        pendingPrereqs.push({ lessonId, localPrereqId: lesson.prerequisite_lesson_local_id });
      }

      if (lesson.type === 'quiz' && Array.isArray(lesson.questions)) {
        lesson.questions.forEach((q, qIdx) => {
          db.prepare('INSERT INTO custom_quiz_questions (lesson_id, question_text, option_a, option_b, option_c, option_d, correct_idx, explanation, order_num) VALUES (?,?,?,?,?,?,?,?,?)').run(lessonId, q.question_text || '', q.option_a || '', q.option_b || '', q.option_c || '', q.option_d || '', q.correct_idx ?? 0, q.explanation || '', qIdx);
        });
      }
    });
  });

  const setPrereq = db.prepare('UPDATE custom_lessons SET prerequisite_lesson_id = ? WHERE id = ?');
  for (const { lessonId, localPrereqId } of pendingPrereqs) {
    const realPrereqId = localIdToRealId.get(localPrereqId);
    if (realPrereqId) setPrereq.run(realPrereqId, lessonId);
  }
}

// Diffs incoming modules/lessons against what's already in the DB instead of
// deleting and recreating everything, so editing a course no longer wipes
// every tester's custom_lesson_progress. A module/lesson is matched to an
// existing row when its client-side `_id` is the stringified real DB id
// (the course-builder loads existing rows with `_id: String(row.id)` for
// exactly this reason); anything else is treated as newly added. Existing
// rows not present in the incoming payload were removed by the editor and
// get deleted (cascading their questions/progress). Quiz questions have no
// persistent identity anywhere (custom-course quizzes are graded
// client-side, with no per-question history to preserve), so they're always
// fully replaced — only lesson/module identity needs to survive an edit.
function updateCourseModules(courseId, modules) {
  if (!Array.isArray(modules)) return;

  const existingModuleIds = new Set(
    db.prepare('SELECT id FROM custom_modules WHERE course_id = ?').all(courseId).map(m => m.id)
  );
  const existingLessonIds = new Set(
    db.prepare(`
      SELECT cl.id FROM custom_lessons cl
      JOIN custom_modules cm ON cm.id = cl.module_id
      WHERE cm.course_id = ?
    `).all(courseId).map(l => l.id)
  );
  const usedModuleIds = new Set();
  const usedLessonIds = new Set();
  const localIdToRealId = new Map();
  const pendingPrereqs = [];

  const insertModule = db.prepare('INSERT INTO custom_modules (course_id, title, order_num) VALUES (?, ?, ?)');
  const updateModule = db.prepare('UPDATE custom_modules SET title = ?, order_num = ? WHERE id = ?');
  const insertLesson = db.prepare(`
    INSERT INTO custom_lessons (module_id, title, type, content, order_num, prerequisite_type, prerequisite_note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const updateLesson = db.prepare(`
    UPDATE custom_lessons
    SET module_id = ?, title = ?, type = ?, content = ?, order_num = ?, prerequisite_type = ?, prerequisite_note = ?, prerequisite_lesson_id = NULL
    WHERE id = ?
  `);
  const insertQuestion = db.prepare(`
    INSERT INTO custom_quiz_questions (lesson_id, question_text, option_a, option_b, option_c, option_d, correct_idx, explanation, order_num)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);

  const asExistingId = (localId, existingSet) => {
    if (!localId || !/^\d+$/.test(localId)) return null;
    const n = parseInt(localId, 10);
    return existingSet.has(n) ? n : null;
  };

  modules.forEach((mod, mIdx) => {
    const matchedModId = asExistingId(mod._id, existingModuleIds);
    const modId = matchedModId
      ? (updateModule.run(mod.title || '', mIdx, matchedModId), matchedModId)
      : insertModule.run(courseId, mod.title || '', mIdx).lastInsertRowid;
    usedModuleIds.add(modId);

    (mod.lessons || []).forEach((lesson, lIdx) => {
      const prereqType = lesson.prerequisite_type || 'none';
      const prereqNote = prereqType === 'optional' ? (lesson.prerequisite_note || '') : '';
      const matchedLessonId = asExistingId(lesson._id, existingLessonIds);

      let lessonId;
      if (matchedLessonId) {
        updateLesson.run(modId, lesson.title || '', lesson.type || 'lesson', lesson.content || '', lIdx, prereqType, prereqNote, matchedLessonId);
        db.prepare('DELETE FROM custom_quiz_questions WHERE lesson_id = ?').run(matchedLessonId);
        lessonId = matchedLessonId;
      } else {
        lessonId = insertLesson.run(modId, lesson.title || '', lesson.type || 'lesson', lesson.content || '', lIdx, prereqType, prereqNote).lastInsertRowid;
      }
      usedLessonIds.add(lessonId);
      if (lesson._id) localIdToRealId.set(lesson._id, lessonId);
      if (prereqType === 'mandatory' && lesson.prerequisite_lesson_local_id) {
        pendingPrereqs.push({ lessonId, localPrereqId: lesson.prerequisite_lesson_local_id });
      }

      if (lesson.type === 'quiz' && Array.isArray(lesson.questions)) {
        lesson.questions.forEach((q, qIdx) => {
          insertQuestion.run(lessonId, q.question_text || '', q.option_a || '', q.option_b || '', q.option_c || '', q.option_d || '', q.correct_idx ?? 0, q.explanation || '', qIdx);
        });
      }
    });
  });

  const setPrereq = db.prepare('UPDATE custom_lessons SET prerequisite_lesson_id = ? WHERE id = ?');
  for (const { lessonId, localPrereqId } of pendingPrereqs) {
    const realPrereqId = localIdToRealId.get(localPrereqId);
    if (realPrereqId) setPrereq.run(realPrereqId, lessonId);
  }

  // Anything that existed before but wasn't touched this save was removed
  // by the editor — delete it (and its now-orphaned questions/progress).
  for (const lessonId of existingLessonIds) {
    if (usedLessonIds.has(lessonId)) continue;
    db.prepare('DELETE FROM custom_quiz_questions WHERE lesson_id = ?').run(lessonId);
    db.prepare('DELETE FROM custom_lesson_progress WHERE lesson_id = ?').run(lessonId);
    db.prepare('DELETE FROM custom_lessons WHERE id = ?').run(lessonId);
  }
  for (const modId of existingModuleIds) {
    if (!usedModuleIds.has(modId)) db.prepare('DELETE FROM custom_modules WHERE id = ?').run(modId);
  }
}

// Was nothing enforcing this — a course could be published with zero
// modules, an empty module, or a quiz-type lesson with zero questions (the
// builder UI lets you delete a quiz's last question after adding it). A
// tester reaching such a course/lesson hit a permanent dead end with no way
// to complete it. Only checked when a course is actually being published —
// a lead should still be free to save an in-progress draft that isn't ready.
function validateCourseStructureFromRequest(modules) {
  if (!Array.isArray(modules) || modules.length === 0) return 'В курсе должен быть хотя бы один модуль';
  for (const mod of modules) {
    if (!Array.isArray(mod.lessons) || mod.lessons.length === 0) {
      return `Модуль «${mod.title || 'без названия'}» должен содержать хотя бы один урок`;
    }
    for (const lesson of mod.lessons) {
      if (lesson.type === 'quiz' && (!Array.isArray(lesson.questions) || lesson.questions.length === 0)) {
        return `Тест «${lesson.title || 'без названия'}» должен содержать хотя бы один вопрос`;
      }
    }
  }
  return null;
}

// Same check as above, against what's already persisted — used when
// publishing without also resending the full module tree (PATCH .../publish
// never receives one; PUT doesn't always either).
function validateCourseStructureInDb(courseId) {
  const modules = db.prepare('SELECT id, title FROM custom_modules WHERE course_id = ?').all(courseId);
  if (modules.length === 0) return 'В курсе должен быть хотя бы один модуль';
  for (const mod of modules) {
    const lessons = db.prepare('SELECT id, type, title FROM custom_lessons WHERE module_id = ?').all(mod.id);
    if (lessons.length === 0) return `Модуль «${mod.title || 'без названия'}» должен содержать хотя бы один урок`;
    for (const lesson of lessons) {
      if (lesson.type === 'quiz') {
        const qCount = db.prepare('SELECT COUNT(*) as c FROM custom_quiz_questions WHERE lesson_id = ?').get(lesson.id).c;
        if (qCount === 0) return `Тест «${lesson.title || 'без названия'}» должен содержать хотя бы один вопрос`;
      }
    }
  }
  return null;
}

// Create course — lead/admin/a manage_courses grant publishes (or saves a
// draft) directly, exactly as before. Anyone else is submitting a
// *proposal*: forced unpublished + proposal_status='pending' regardless of
// what they send, and — unlike a lead's own WIP draft — the structure must
// already be complete, since a proposal is a submission for review, not a
// work in progress only the author can see.
router.post('/api/custom-courses', authMiddleware, (req, res) => {
  try {
    const { title, description, tag, color, requirements, modules, deadline_at } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Укажите название курса' });

    const canPublishDirectly = hasManageCourses(req.user);
    const isPublished = canPublishDirectly ? !!req.body.is_published : false;
    const proposalStatus = canPublishDirectly ? null : 'pending';

    if (isPublished || !canPublishDirectly) {
      const structureError = validateCourseStructureFromRequest(modules);
      if (structureError) return res.status(400).json({ error: structureError });
    }

    // insertCourseModules is many individual statements across modules,
    // lessons, and quiz questions — wrapped so a crash partway through
    // can't leave a course with, say, a module but no lessons in it.
    const courseId = db.transaction(() => {
      const courseRow = db.prepare(`
        INSERT INTO custom_courses (title, description, tag, color, requirements, is_published, deadline_at, created_by, updated_at, proposal_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        title.trim(),
        description || '',
        tag || 'Custom',
        color || '#1D9E75',
        requirements || '',
        isPublished ? 1 : 0,
        deadline_at || null,
        req.user.id,
        new Date().toISOString(),
        proposalStatus
      );
      insertCourseModules(courseRow.lastInsertRowid, modules);
      return courseRow.lastInsertRowid;
    })();

    if (isPublished) {
      db.prepare('INSERT INTO team_events (event_type, user_id, ref_id) VALUES (?, ?, ?)')
        .run('course_published', req.user.id, courseId);
    }

    res.json({ id: courseId });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update course (lead, own only)
router.put('/api/custom-courses/:id', authMiddleware, requirePermission('manage_courses'), (req, res) => {
  try {
    const course = db.prepare('SELECT * FROM custom_courses WHERE id = ?').get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Не найдено' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ error: 'Нет доступа' });

    const { title, description, tag, color, requirements, modules, is_published, deadline_at, expected_updated_at } = req.body;
    const newPublishedFlag = is_published !== undefined ? (is_published ? 1 : 0) : course.is_published;

    // Optimistic locking for module-tree edits specifically: updateCourseModules
    // diffs against whatever's in the DB right now and deletes anything the
    // caller's payload doesn't mention — if two leads edited the same course
    // starting from the same loaded state, the second save would otherwise
    // silently delete the first save's new lessons/modules (and any tester
    // progress already recorded against them). The client already warns via
    // a re-fetch+confirm before calling this, but that's a courtesy, not a
    // guarantee (a direct API call skips it, and there's a race window
    // between that check and this request) — this makes it authoritative.
    // Metadata-only saves (no modules array) can't lose data this way, so
    // they're not gated on it.
    if (Array.isArray(modules) && expected_updated_at !== undefined && expected_updated_at !== course.updated_at) {
      return res.status(409).json({ error: 'Курс был изменён кем-то другим с момента загрузки — обнови страницу и повтори изменения' });
    }

    if (newPublishedFlag) {
      // If this save also sends a new module tree, that's the state to
      // validate (it's about to replace what's in the DB); otherwise the
      // existing persisted structure is what will still be live after this
      // save, so check that instead.
      const structureError = Array.isArray(modules)
        ? validateCourseStructureFromRequest(modules)
        : validateCourseStructureInDb(course.id);
      if (structureError) return res.status(400).json({ error: structureError });
    }

    // updateCourseModules is a diff (update/insert/delete across modules,
    // lessons, and quiz questions) — a crash partway through would leave
    // the course in a genuinely broken half-edited state, not just a
    // failed request, so this needs to be all-or-nothing.
    db.transaction(() => {
      db.prepare(`UPDATE custom_courses SET title=?, description=?, tag=?, color=?, requirements=?, is_published=?, deadline_at=?, updated_at=? WHERE id=?`).run(
        title?.trim() || course.title,
        description ?? course.description,
        tag || course.tag,
        color || course.color,
        requirements ?? course.requirements,
        newPublishedFlag,
        deadline_at !== undefined ? (deadline_at || null) : course.deadline_at,
        new Date().toISOString(),
        course.id
      );

      if (Array.isArray(modules)) {
        updateCourseModules(course.id, modules);
      }
    })();

    // Only the 0->1 transition is "news" — every other edit already
    // mutates updated_at without needing its own feed item.
    if (!course.is_published && newPublishedFlag) {
      db.prepare('INSERT INTO team_events (event_type, user_id, ref_id) VALUES (?, ?, ?)')
        .run('course_published', req.user.id, course.id);
    }

    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete course (lead, own only) — also doubles as "decline a proposal":
// canManageCourse lets a lead soft-delete any pending tester proposal even
// though they didn't author it, so this is the reject action, no separate
// route needed. When the target was a pending proposal, stamp
// proposal_status='rejected' before it goes to trash — deleted_at already
// hides it everywhere, but the outcome stays on the row so "how many
// proposals has this person submitted" can still count it later.
// Soft-delete — moves the course to the trash (see /api/admin/trash)
// instead of removing it. The full cascade delete this used to do inline
// now only runs on a real purge (hardDeleteCourse, in routeHelpers.js),
// since a trashed-but-not-yet-purged course still needs its modules/lessons
// intact in case it gets restored.
router.delete('/api/custom-courses/:id', authMiddleware, requirePermission('manage_courses'), (req, res) => {
  try {
    const course = db.prepare('SELECT * FROM custom_courses WHERE id = ?').get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Не найдено' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ error: 'Нет доступа' });

    const rejected = course.proposal_status === 'pending';
    db.prepare(`UPDATE custom_courses SET deleted_at = CURRENT_TIMESTAMP${rejected ? ", proposal_status = 'rejected'" : ''} WHERE id = ?`).run(course.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle publish — also doubles as "approve a proposal" when the target is
// pending: canManageCourse lets a lead flip it regardless of authorship,
// and the 0->1 transition clears proposal_status to 'approved' (kept, not
// nulled, so it still counts toward the author's proposal history) so the
// course reads as an ordinary published one everywhere else from then on.
router.patch('/api/custom-courses/:id/publish', authMiddleware, requirePermission('manage_courses'), (req, res) => {
  try {
    const course = db.prepare('SELECT * FROM custom_courses WHERE id = ?').get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Не найдено' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ error: 'Нет доступа' });
    const newStatus = course.is_published ? 0 : 1;
    if (newStatus === 1) {
      const structureError = validateCourseStructureInDb(course.id);
      if (structureError) return res.status(400).json({ error: structureError });
    }
    const approvingProposal = newStatus === 1 && course.proposal_status === 'pending';
    db.prepare(`UPDATE custom_courses SET is_published=?, updated_at=?${approvingProposal ? ", proposal_status = 'approved'" : ''} WHERE id=?`)
      .run(newStatus, new Date().toISOString(), course.id);
    if (newStatus === 1) {
      db.prepare('INSERT INTO team_events (event_type, user_id, ref_id) VALUES (?, ?, ?)')
        .run('course_published', course.created_by, course.id);
    }
    // «Автор» achievement — first ever approved proposal of any kind
    // (course/guide/bug example/glossary term). awardAchievement is
    // idempotent, so it's safe to just call it on every approval rather
    // than separately tracking "is this their first".
    if (approvingProposal) awardAchievement(course.created_by, ACHIEVEMENT_IDS.AVTOR);

    res.json({ is_published: newStatus });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Per-user deadline override — e.g. someone was on vacation when a course's
// default deadline passed. Upsert (one override per course+user, editing an
// existing extension just replaces it) rather than a history of overrides.
router.post('/api/custom-courses/:id/deadline-override', authMiddleware, requirePermission('manage_courses'), (req, res) => {
  try {
    const course = db.prepare('SELECT id, created_by FROM custom_courses WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Не найдено' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ error: 'Нет доступа' });
    const { user_id, deadline_at, reason } = req.body;
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (!deadline_at) return res.status(400).json({ error: 'Укажите дедлайн' });

    db.prepare(`
      INSERT INTO course_deadline_overrides (course_id, user_id, deadline_at, reason, set_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(course_id, user_id) DO UPDATE SET
        deadline_at = excluded.deadline_at,
        reason      = excluded.reason,
        set_by      = excluded.set_by,
        set_at      = CURRENT_TIMESTAMP
    `).run(course.id, user_id, deadline_at, String(reason || '').slice(0, 300), req.user.id);

    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/custom-courses/:id/deadline-override/:userId', authMiddleware, requirePermission('manage_courses'), (req, res) => {
  try {
    const course = db.prepare('SELECT id, created_by FROM custom_courses WHERE id = ?').get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Не найдено' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ error: 'Нет доступа' });
    db.prepare('DELETE FROM course_deadline_overrides WHERE course_id = ? AND user_id = ?')
      .run(req.params.id, req.params.userId);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Upper bound on a single course's self-reported time — this is purely a
// client-reported engagement metric a lead sees on /api/courses/time-stats
// (there's no server-side start timestamp to check it against), so nothing
// stops it being an arbitrary number; this at least keeps one bogus/buggy
// report from skewing that view with an implausible value (a course
// realistically takes at most a few hours, not weeks).
const MAX_COURSE_SECONDS_SPENT = 6 * 60 * 60; // 6 hours

router.post('/api/courses/time-track', authMiddleware, (req, res) => {
  try {
    const { course_id, seconds_spent } = req.body;
    const userId = req.user.id;
    if (!course_id || typeof seconds_spent !== 'number' || !Number.isFinite(seconds_spent) || seconds_spent < 0) {
      return res.status(400).json({ error: 'Неверные данные' });
    }
    const clampedSeconds = Math.min(seconds_spent, MAX_COURSE_SECONDS_SPENT);
    db.prepare(`
      INSERT INTO course_time_tracking (user_id, course_id, seconds_spent, completed_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, course_id) DO UPDATE SET
        seconds_spent = excluded.seconds_spent,
        completed_at = excluded.completed_at
    `).run(userId, course_id, clampedSeconds);
    db.prepare('INSERT INTO activity_log (user_id, action, lecture_id) VALUES (?, ?, ?)')
      .run(userId, 'course_completed', course_id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead: time stats per tester per course
router.get('/api/courses/time-stats', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        u.id as user_id, u.name, u.avatar_initials,
        ctt.course_id,
        ctt.seconds_spent,
        ctt.completed_at
      FROM course_time_tracking ctt
      JOIN users u ON u.id = ctt.user_id
      ORDER BY ctt.completed_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
