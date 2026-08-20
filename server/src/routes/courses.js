// Custom courses (modules/lessons/quizzes) + course time tracking. Split
// out from the old monolithic app.js — see PROGRESS.md.
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware, requireRole } from '../auth.js';
import { requirePermission, hasPermission, awardAchievement, ACHIEVEMENT_IDS, COIN_REWARDS, QUIZ_STREAK_LENGTH, awardCoins, awardOnce, displayName, logActivity, canManageCourse, canSeeCourse, toInt } from '../routeHelpers.js';
import { notifyUser } from '../telegram.js';

const router = express.Router();

// The frog's sign-off line on the course result screen. Short on purpose:
// it sits next to the frog as a single spoken line, not a paragraph.
const RESULT_TEXT_MAX = 300;

// A custom course can be edited/published/deleted by whoever authored it,
// or by an admin. A lead can additionally manage *any* pending proposal
// (not just their own courses) — that's the whole point of the review
// queue: a tester's proposal needs a lead's approve/decline regardless of
// who happens to review it, while an ordinary lead-authored course stays
// "own only" as before.
function hasManageCourses(user) {
  return user.role === 'lead' || user.role === 'admin' || hasPermission(user.id, 'manage_courses');
}

// The course a lesson belongs to, or null. The lesson-scoped routes take a
// lesson id and nothing else, so without this they had no way to reach the
// thing that decides whether the caller is allowed to be there.
function courseOfLesson(lessonId) {
  return db.prepare(`
    SELECT cc.* FROM custom_lessons l
    JOIN custom_modules m ON m.id = l.module_id
    JOIN custom_courses cc ON cc.id = m.course_id
    WHERE l.id = ?
  `).get(lessonId) || null;
}

// Guard for every route addressed by lesson id. These looked safe because
// each one starts by loading its lesson and 404s if it is missing — but a
// lesson id is a small integer anyone can count through, and the course it
// hangs off was never consulted. Submitting an empty answer set to
// /submit-quiz returned the full answer key, `correct_idx` and explanation
// per question, for a course the caller could not open: the stripping added
// to GET /api/custom-courses/:id was walked straight around. /complete let
// the same person accrue progress on a draft, which is the first half of
// what the course-completion coins are paid for.
//
// 404 rather than 403 on an invisible course: an unpublished draft's
// existence is itself not the caller's business.
function lessonVisibleTo(lessonId, user, res) {
  const course = courseOfLesson(lessonId);
  if (!canSeeCourse(course, user)) {
    res.status(404).json({ error: 'Урок не найден' });
    return null;
  }
  return course;
}

// How far one person has got through every course, in two queries rather
// than two per course. The catalog had no notion of this at all: a course
// someone finished last month looked exactly like one they had never
// opened, and the status filter beside it only ever applied to the fixed
// lecture track.
//
// Counted in lessons rather than by the pass mark, because that is what a
// progress bar means — "how much is left to read", not "did you score
// 60%". Whether it was *passed* is a separate question the course page
// answers (courseResultFor).
function progressByCourseFor(userId) {
  // One row per module, with its lesson count and how many of them this
  // person has finished. Everything else is arithmetic on top, so the whole
  // catalog costs one query rather than a couple per card.
  //
  // LEFT JOINs throughout: a module with no lessons yet, and a lesson
  // nobody has opened, both have to appear with a zero rather than vanish.
  const modules = db.prepare(`
    SELECT m.course_id as courseId,
           m.id as moduleId,
           COUNT(l.id) as lessons,
           COUNT(p.lesson_id) as done
    FROM custom_modules m
    LEFT JOIN custom_lessons l ON l.module_id = m.id
    LEFT JOIN custom_lesson_progress p ON p.lesson_id = l.id AND p.user_id = ?
    GROUP BY m.id
  `).all(userId);

  const byCourse = new Map();
  for (const row of modules) {
    const acc = byCourse.get(row.courseId) || { modulesTotal: 0, modulesDone: 0, lessonsTotal: 0, lessonsDone: 0 };
    // A module with nothing in it is an outline heading, not a unit of
    // work, so it is left out of the count entirely rather than counted as
    // permanently unfinished. Counting it produced a card that argued with
    // itself: every lesson done, so "КУРС ПРОЙДЕН!" and a full bar, above
    // a label reading "1/2 модулей".
    if (row.lessons > 0) {
      acc.modulesTotal += 1;
      // Done only once every lesson in it is.
      if (row.done >= row.lessons) acc.modulesDone += 1;
    }
    acc.lessonsTotal += row.lessons;
    acc.lessonsDone += row.done;
    byCourse.set(row.courseId, acc);
  }

  for (const acc of byCourse.values()) {
    // Completion is judged on lessons, not modules: they agree whenever
    // there is anything to finish, and lessons are the thing actually
    // marked done. The same empty-course caveat applies.
    acc.isCompleted = acc.lessonsTotal > 0 && acc.lessonsDone >= acc.lessonsTotal;
  }
  return byCourse;
}

const EMPTY_PROGRESS = { modulesTotal: 0, modulesDone: 0, lessonsTotal: 0, lessonsDone: 0, isCompleted: false };

// List: testers see published (+ their own proposals, any status); lead
// sees own + published + everyone's pending proposals (the review queue —
// see canManageCourse above for why "pending" specifically is the carve-out).
router.get('/api/custom-courses', authMiddleware, (req, res) => {
  try {
    let rows;
    if (req.user.role === 'lead') {
      rows = db.prepare(`
        SELECT cc.*, ${displayName('u')} as author_name,
          (SELECT gender FROM user_profiles WHERE user_id = u.id) as author_gender,
          cs.name as section_name,
          EXISTS(SELECT 1 FROM custom_course_views v WHERE v.user_id = ? AND v.course_id = cc.id) as viewed,
          (SELECT COUNT(DISTINCT ctt.user_id) FROM course_time_tracking ctt WHERE ctt.course_id = cc.id) as completedCount,
          COALESCE((SELECT deadline_at FROM course_deadline_overrides WHERE course_id = cc.id AND user_id = ?), cc.deadline_at) as effectiveDeadline
        FROM custom_courses cc
        JOIN users u ON u.id = cc.created_by
        LEFT JOIN course_sections cs ON cs.id = cc.section_id
        WHERE (cc.created_by = ? OR cc.is_published = 1 OR cc.proposal_status = 'pending') AND cc.deleted_at IS NULL
        ORDER BY cc.created_at DESC
      `).all(req.user.id, req.user.id, req.user.id);
      const totalTesters = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'tester' AND archived_at IS NULL").get().c;
      rows = rows.map(r => ({ ...r, totalTesters }));
    } else {
      rows = db.prepare(`
        SELECT cc.*, ${displayName('u')} as author_name,
          (SELECT gender FROM user_profiles WHERE user_id = u.id) as author_gender,
          cs.name as section_name,
          EXISTS(SELECT 1 FROM custom_course_views v WHERE v.user_id = ? AND v.course_id = cc.id) as viewed,
          COALESCE((SELECT deadline_at FROM course_deadline_overrides WHERE course_id = cc.id AND user_id = ?), cc.deadline_at) as effectiveDeadline
        FROM custom_courses cc
        JOIN users u ON u.id = cc.created_by
        LEFT JOIN course_sections cs ON cs.id = cc.section_id
        WHERE (cc.is_published = 1 OR cc.created_by = ?) AND cc.deleted_at IS NULL
        ORDER BY cc.created_at DESC
      `).all(req.user.id, req.user.id, req.user.id);
    }

    const progress = progressByCourseFor(req.user.id);
    rows = rows.map(r => ({ ...r, ...(progress.get(r.id) || EMPTY_PROGRESS) }));

    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Full course with modules, lessons, questions
// Which modules of a course are shut for this person, as a set of module
// ids. A module opens once every graded test in every module before it has
// been passed — that is what makes an intermediate test intermediate rather
// than an optional detour.
//
// Modules with nothing graded in them gate nothing: a course with no tests
// at all would otherwise be locked shut by a rule about tests. An empty test
// (no questions written yet) counts as nothing graded for the same reason.
function lockedModuleIds(userId, courseId) {
  const modules = db.prepare('SELECT id FROM custom_modules WHERE course_id = ? ORDER BY order_num, id').all(courseId);
  const quizzes = db.prepare(`
    SELECT l.module_id AS moduleId,
           (SELECT COUNT(*) FROM custom_quiz_questions q WHERE q.lesson_id = l.id) AS questions,
           r.score AS score
    FROM custom_lessons l
    JOIN custom_modules m ON m.id = l.module_id
    LEFT JOIN custom_quiz_results r ON r.lesson_id = l.id AND r.user_id = ?
    WHERE m.course_id = ? AND l.type = 'quiz'
  `).all(userId, courseId);

  const byModule = new Map();
  for (const q of quizzes) {
    if (q.questions === 0) continue;
    if (!byModule.has(q.moduleId)) byModule.set(q.moduleId, []);
    byModule.get(q.moduleId).push(q);
  }

  const locked = new Set();
  let blocked = false;
  for (const m of modules) {
    if (blocked) locked.add(m.id);
    const own = byModule.get(m.id) || [];
    if (own.some(q => q.score === null || q.score < COURSE_PASS_SCORE)) blocked = true;
  }
  return locked;
}

// Everything a person has earned so far in one course, paid the moment it
// is earned rather than all at the end. Called after any lesson is marked
// done; every payment is guarded by the ledger, so calling it again after
// the next lesson costs nothing.
//
// The unit is the module: 10 coins for finishing one. Every bonus here is a
// multiple of that, so the numbers stay comparable to each other.
function awardCourseProgress(userId, courseId) {
  const modules = db.prepare('SELECT id, order_num FROM custom_modules WHERE course_id = ? ORDER BY order_num, id').all(courseId);
  const lessons = db.prepare(`
    SELECT l.id, l.module_id, l.type,
           (SELECT COUNT(*) FROM custom_quiz_questions q WHERE q.lesson_id = l.id) AS questions,
           (SELECT 1 FROM custom_lesson_progress p WHERE p.lesson_id = l.id AND p.user_id = ?) AS done,
           r.score AS score, r.attempts AS attempts
    FROM custom_lessons l
    JOIN custom_modules m ON m.id = l.module_id
    LEFT JOIN custom_quiz_results r ON r.lesson_id = l.id AND r.user_id = ?
    WHERE m.course_id = ?
    ORDER BY m.order_num, l.order_num, l.id
  `).all(userId, userId, courseId);

  const byModule = new Map(modules.map(m => [m.id, []]));
  for (const l of lessons) if (byModule.has(l.module_id)) byModule.get(l.module_id).push(l);

  // A run of modules finished first try, counted in course order. It breaks
  // on the first module that is unfinished or needed a retake, so the bonus
  // means "three in a row", not "three altogether".
  let run = 0;
  let allFirstTry = true;

  for (const mod of modules) {
    const own = byModule.get(mod.id) || [];
    if (own.length === 0) continue;                      // an outline heading, not work
    const finished = own.every(l => l.done);
    const graded = own.filter(l => l.type === 'quiz' && l.questions > 0);
    const firstTry = graded.length > 0 && graded.every(l => l.attempts === 1);

    if (!finished) { run = 0; allFirstTry = false; continue; }

    awardOnce(userId, 'moduleCompleted', mod.id, COIN_REWARDS.moduleCompleted);
    if (firstTry) {
      awardOnce(userId, 'quizFirstTry', mod.id, COIN_REWARDS.quizFirstTry);
      run += 1;
      if (run >= QUIZ_STREAK_LENGTH) awardOnce(userId, 'quizStreak', mod.id, COIN_REWARDS.quizStreak);
    } else {
      run = 0;
      if (graded.length > 0) allFirstTry = false;
    }
  }

  // The course's last graded test, wherever it happens to live.
  const gradedLessons = lessons.filter(l => l.type === 'quiz' && l.questions > 0);
  const finalQuiz = gradedLessons[gradedLessons.length - 1];
  if (finalQuiz && finalQuiz.score !== null && finalQuiz.score >= COURSE_PASS_SCORE) {
    awardOnce(userId, 'finalQuizPassed', courseId, COIN_REWARDS.finalQuizPassed);
  }

  // Flawless is only decidable once the whole course is done, and only
  // means anything if there was something to get wrong.
  const everythingDone = lessons.length > 0 && lessons.every(l => l.done);
  if (everythingDone && gradedLessons.length > 0 && allFirstTry) {
    awardOnce(userId, 'courseFlawless', courseId, COIN_REWARDS.courseFlawless);
  }
}

// The gate never applies to whoever can edit the course: a lead walking
// their own draft is checking it, not taking it.
function moduleLockedFor(user, course, lesson) {
  if (!course || canManageCourse(course, user)) return false;
  const row = db.prepare('SELECT module_id FROM custom_lessons WHERE id = ?').get(lesson.id);
  return row ? lockedModuleIds(user.id, course.id).has(row.module_id) : false;
}

router.get('/api/custom-courses/:id', authMiddleware, (req, res) => {
  try {
    const course = db.prepare(`
      SELECT cc.*, ${displayName('u')} as author_name, (SELECT gender FROM user_profiles WHERE user_id = u.id) as author_gender
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

    // Someone taking the course must not be handed the answer key. Only a
    // person who can edit this course keeps correct_idx/explanation in the
    // payload — everyone else gets them one question at a time, after
    // answering, from the explanation route below. Mirrors how the seeded
    // lecture track has always done it (GET /api/lectures/:id/questions).
    const canSeeAnswers = canManageCourse(course, req.user);
    // Told to the client too: it mirrors the module gate locally so passing
    // a test opens the next module without a reload, and the mirror needs to
    // know when the gate does not apply.
    course.canManage = canSeeAnswers ? 1 : 0;

    // Their own best attempt per quiz lesson, so the page can show a score
    // it did not invent and the result screen can agree with the database.
    const myResults = lessonIds.length
      ? db.prepare(
          `SELECT lesson_id, score, correct_count, total_count, attempts FROM custom_quiz_results
           WHERE user_id = ? AND lesson_id IN (${lessonIds.map(() => '?').join(',')})`
        ).all(req.user.id, ...lessonIds)
      : [];
    const resultByLesson = new Map(myResults.map(r => [r.lesson_id, r]));

    // Every module after one whose test has not been passed. Computed once
    // for the whole course rather than per lesson.
    const lockedModules = canManageCourse(course, req.user) ? new Set() : lockedModuleIds(req.user.id, course.id);

    const lessonsByModule = new Map();
    for (const lesson of allLessons) {
      if (lesson.type === 'quiz') {
        lesson.questions = (questionsByLesson.get(lesson.id) || []).map(q =>
          canSeeAnswers ? q : (({ correct_idx, explanation, ...rest }) => rest)(q)
        );
        lesson.myResult = resultByLesson.get(lesson.id) || null;
      }
      lesson.completed = completedIds.has(lesson.id);
      // Only a 'mandatory' prerequisite can lock access — 'optional' is a
      // non-blocking recommendation (e.g. unverifiable external reading),
      // and 'none' has no gate at all.
      lesson.locked = (lesson.prerequisite_type === 'mandatory'
        && lesson.prerequisite_lesson_id != null
        && !completedIds.has(lesson.prerequisite_lesson_id))
        || lockedModules.has(lesson.module_id);
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
        SELECT o.user_id, o.deadline_at, o.reason, ${displayName('u')} as name
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
    if (!lessonVisibleTo(lesson.id, req.user, res)) return;

    if (lesson.prerequisite_type === 'mandatory' && lesson.prerequisite_lesson_id != null) {
      const prereqDone = db.prepare(
        'SELECT 1 FROM custom_lesson_progress WHERE user_id = ? AND lesson_id = ?'
      ).get(req.user.id, lesson.prerequisite_lesson_id);
      if (!prereqDone) {
        return res.status(403).json({ error: 'Сначала нужно пройти предыдущий урок' });
      }
    }

    // A module opens only once the test before it has been passed, so a
    // lesson inside a shut module cannot be marked done either — otherwise
    // the gate would hold the door while the room filled up behind it.
    if (moduleLockedFor(req.user, courseOfLesson(lesson.id), lesson)) {
      return res.status(403).json({ error: 'Сначала нужно сдать тест предыдущего модуля' });
    }

    // A quiz lesson is finished by passing it, not by saying so and not by
    // merely attempting it. Attempting used to be enough, which meant a
    // failed test still counted towards the course being finished and
    // towards its coins. Retaking is unlimited and the best attempt is what
    // is kept, so nothing is lost by requiring the pass.
    if (lesson.type === 'quiz') {
      const questionCount = db.prepare('SELECT COUNT(*) c FROM custom_quiz_questions WHERE lesson_id = ?').get(lesson.id).c;
      if (questionCount > 0) {
        const best = db.prepare('SELECT score FROM custom_quiz_results WHERE user_id = ? AND lesson_id = ?')
          .get(req.user.id, lesson.id);
        if (!best) return res.status(400).json({ error: 'Сначала нужно пройти тест' });
        if (best.score < COURSE_PASS_SCORE) {
          return res.status(400).json({ error: `Тест не сдан — нужно набрать ${COURSE_PASS_SCORE}% или больше. Попробуй ещё раз.` });
        }
      }
    }

    const course = courseOfLesson(lesson.id);
    db.transaction(() => {
      db.prepare(
        'INSERT OR IGNORE INTO custom_lesson_progress (user_id, lesson_id) VALUES (?, ?)'
      ).run(req.user.id, lesson.id);
      // Modules are paid as they are finished rather than all at the end, so
      // someone who stops halfway keeps what they earned.
      if (course) awardCourseProgress(req.user.id, course.id);
    })();

    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Grading, on the server, from the server's own copy of the answers.
//
// The score used to be computed in the browser and never sent anywhere: the
// completion coins, the pass/fail screen and the lead's analytics all rested
// on a number nobody had checked, and a course built in the builder produced
// no data at all. This is the same shape the seeded lecture track has always
// used (POST /api/lectures/:id/submit-test).
//
// `answers` is { questionId: optionIndex }. Keyed by id rather than by
// position so a course edited between loading and submitting can't silently
// grade someone against a different question than the one they read.
router.post('/api/custom-lessons/:id/submit-quiz', authMiddleware, (req, res) => {
  try {
    const lesson = db.prepare('SELECT * FROM custom_lessons WHERE id = ?').get(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Урок не найден' });
    if (!lessonVisibleTo(lesson.id, req.user, res)) return;
    if (lesson.type !== 'quiz') return res.status(400).json({ error: 'Это не тест' });
    if (moduleLockedFor(req.user, courseOfLesson(lesson.id), lesson)) {
      return res.status(403).json({ error: 'Сначала нужно сдать тест предыдущего модуля' });
    }

    const { answers } = req.body;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ error: 'Нужны ответы' });
    }

    const questions = db.prepare(
      'SELECT id, correct_idx, explanation FROM custom_quiz_questions WHERE lesson_id = ? ORDER BY order_num'
    ).all(lesson.id);
    if (questions.length === 0) return res.status(400).json({ error: 'В тесте нет вопросов' });

    let correct = 0;
    const breakdown = questions.map(q => {
      const given = answers[String(q.id)];
      const isCorrect = Number.isInteger(given) && given === q.correct_idx;
      if (isCorrect) correct++;
      return { id: q.id, chosen: Number.isInteger(given) ? given : null, correct_idx: q.correct_idx, isCorrect, explanation: q.explanation || '' };
    });
    const score = Math.round((correct / questions.length) * 100);

    // Best attempt wins, and the attempt counter keeps climbing — same rule
    // the courses page promises ("пересдавать можно сколько угодно,
    // сохраняется лучший результат").
    db.prepare(`
      INSERT INTO custom_quiz_results (user_id, lesson_id, score, correct_count, total_count, attempts)
      VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(user_id, lesson_id) DO UPDATE SET
        attempts = attempts + 1,
        score = MAX(score, excluded.score),
        correct_count = CASE WHEN excluded.score > score THEN excluded.correct_count ELSE correct_count END,
        total_count = excluded.total_count,
        completed_at = CURRENT_TIMESTAMP
    `).run(req.user.id, lesson.id, score, correct, questions.length);

    const stored = db.prepare('SELECT score, correct_count, total_count, attempts FROM custom_quiz_results WHERE user_id = ? AND lesson_id = ?')
      .get(req.user.id, lesson.id);

    // Only the lead ever sees these rows (see /api/lead/activity, and the
    // exclusion in /api/me/activity) — it is a record of how the team is
    // doing, not a scoreboard the team keeps on each other.
    const seconds = toInt(req.body.seconds_spent);
    const paceNote = seconds !== null && seconds > 0 ? `:${Math.min(seconds, MAX_COURSE_SECONDS_SPENT)}s` : '';
    logActivity(
      req.user.id,
      `${score >= COURSE_PASS_SCORE ? 'quiz_passed' : 'quiz_failed'}:${score}%${paceNote}:${lesson.title}`,
      { courseId: courseOfLesson(lesson.id)?.id ?? null }
    );

    res.json({ score, correct, total: questions.length, breakdown, best: stored });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// The per-question reveal, fetched only after an answer is picked — the
// counterpart of the seeded track's
// GET /api/lectures/:id/question/:qid/explanation. It exists so the taker
// gets immediate feedback without the whole answer key being sitting in the
// page source from the moment the course loads.
router.get('/api/custom-lessons/:lessonId/question/:questionId/explanation', authMiddleware, (req, res) => {
  try {
    if (!lessonVisibleTo(req.params.lessonId, req.user, res)) return;
    const q = db.prepare(
      'SELECT * FROM custom_quiz_questions WHERE id = ? AND lesson_id = ?'
    ).get(req.params.questionId, req.params.lessonId);
    if (!q) return res.status(404).json({ error: 'Вопрос не найден' });

    const options = [q.option_a, q.option_b, q.option_c, q.option_d];
    res.json({
      correct_idx: q.correct_idx,
      correctOption: options[q.correct_idx] ?? '',
      explanation: q.explanation || '',
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Everything the result screen needs, computed from stored attempts rather
// than from whatever the browser happens to remember. `score` is null for a
// course with nothing gradable in it, which the client renders as a plain
// "finished" rather than as a fabricated 0% or 100%.
router.get('/api/custom-courses/:id/my-result', authMiddleware, (req, res) => {
  try {
    const course = db.prepare('SELECT id FROM custom_courses WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Не найдено' });
    res.json(courseResultFor(req.user.id, course.id));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Shared by the route above and by the coin award in time-track below, so
// "did they pass" can never mean two different things in two places.
export const COURSE_PASS_SCORE = 60;

function courseResultFor(userId, courseId) {
  const rows = db.prepare(`
    SELECT l.id, m.title as module_title, r.score
    FROM custom_lessons l
    JOIN custom_modules m ON m.id = l.module_id
    LEFT JOIN custom_quiz_results r ON r.lesson_id = l.id AND r.user_id = ?
    WHERE m.course_id = ? AND l.type = 'quiz'
      AND EXISTS (SELECT 1 FROM custom_quiz_questions q WHERE q.lesson_id = l.id)
  `).all(userId, courseId);

  const graded = rows.filter(r => r.score !== null);
  const score = graded.length
    ? Math.round(graded.reduce((a, r) => a + r.score, 0) / graded.length)
    : null;

  return {
    score,
    passed: score === null ? true : score >= COURSE_PASS_SCORE,
    gradedCount: graded.length,
    quizCount: rows.length,
    // Modules whose quiz was failed — what the result screen offers to
    // re-read. Deduplicated, since a module can hold more than one quiz.
    weakModules: [...new Set(graded.filter(r => r.score < COURSE_PASS_SCORE).map(r => r.module_title))],
  };
}

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

// description/requirements/lesson.content all became rich-text fields
// (JSON-serialized Tiptap docs, same shape as guides.content in
// knowledge.js) once the editor rolled out here — previously plain text
// with no length cap at all. A JSON doc with a couple of embedded base64
// images can get large, so this caps it at the same generous size guides
// use, rather than leaving it fully unbounded. Runs unconditionally (draft
// saves included, unlike validateCourseStructureFromRequest below) since
// there's no reason to let oversized content persist even mid-draft.
const MAX_RICH_FIELD = 200000;

function validateRichFieldLengths(description, requirements, modules) {
  if (description && description.length > MAX_RICH_FIELD) return 'Описание курса слишком длинное';
  if (requirements && requirements.length > MAX_RICH_FIELD) return 'Требования слишком длинные';
  if (Array.isArray(modules)) {
    for (const mod of modules) {
      for (const lesson of (mod.lessons || [])) {
        if (lesson.content && lesson.content.length > MAX_RICH_FIELD) {
          return `Урок «${lesson.title || 'без названия'}» слишком большой`;
        }
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
    const { title, description, tag, color, requirements, modules, deadline_at, section_id, success_text, fail_text } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Укажите название курса' });
    const lengthError = validateRichFieldLengths(description, requirements, modules);
    if (lengthError) return res.status(400).json({ error: lengthError });

    const canPublishDirectly = hasManageCourses(req.user);
    const isPublished = canPublishDirectly ? !!req.body.is_published : false;
    const proposalStatus = canPublishDirectly ? null : 'pending';
    // A proposing tester's submission ignores this — only a lead/admin can
    // mark a course as the/an onboarding track or file it into a section.
    const isOnboarding = canPublishDirectly ? !!req.body.is_onboarding : false;
    const sectionId = canPublishDirectly ? (section_id || null) : null;

    if (isPublished || !canPublishDirectly) {
      const structureError = validateCourseStructureFromRequest(modules);
      if (structureError) return res.status(400).json({ error: structureError });
    }

    // insertCourseModules is many individual statements across modules,
    // lessons, and quiz questions — wrapped so a crash partway through
    // can't leave a course with, say, a module but no lessons in it.
    const courseId = db.transaction(() => {
      const courseRow = db.prepare(`
        INSERT INTO custom_courses (title, description, tag, color, requirements, is_published, deadline_at, created_by, updated_at, proposal_status, is_onboarding, section_id, success_text, fail_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        proposalStatus,
        isOnboarding ? 1 : 0,
        sectionId,
        (success_text || '').trim().slice(0, RESULT_TEXT_MAX),
        (fail_text || '').trim().slice(0, RESULT_TEXT_MAX)
      );
      insertCourseModules(courseRow.lastInsertRowid, modules);
      return courseRow.lastInsertRowid;
    })();

    if (isPublished) {
      db.prepare('INSERT INTO team_events (event_type, user_id, ref_id) VALUES (?, ?, ?)')
        .run('course_published', req.user.id, courseId);
    }
    // The title travels in the action string rather than being joined from
    // course_id at read time, so the line still reads years later — after a
    // rename, and after a purge that takes the course row with it.
    logActivity(req.user.id, `course_created:${title.trim().slice(0, 80)}`, { courseId });

    res.json({ id: courseId });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update course (lead, own only)
router.put('/api/custom-courses/:id', authMiddleware, requirePermission('manage_courses'), (req, res) => {
  try {
    const course = db.prepare('SELECT * FROM custom_courses WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Не найдено' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ error: 'Нет доступа' });

    const { title, description, tag, color, requirements, modules, is_published, is_onboarding, section_id, deadline_at, expected_updated_at, success_text, fail_text } = req.body;
    const lengthError = validateRichFieldLengths(description, requirements, modules);
    if (lengthError) return res.status(400).json({ error: lengthError });
    const newPublishedFlag = is_published !== undefined ? (is_published ? 1 : 0) : course.is_published;
    const newOnboardingFlag = is_onboarding !== undefined ? (is_onboarding ? 1 : 0) : course.is_onboarding;
    const newSectionId = section_id !== undefined ? (section_id || null) : course.section_id;

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
      db.prepare(`UPDATE custom_courses SET title=?, description=?, tag=?, color=?, requirements=?, is_published=?, is_onboarding=?, section_id=?, deadline_at=?, success_text=?, fail_text=?, updated_at=? WHERE id=?`).run(
        title?.trim() || course.title,
        description ?? course.description,
        tag || course.tag,
        color || course.color,
        requirements ?? course.requirements,
        newPublishedFlag,
        newOnboardingFlag,
        newSectionId,
        deadline_at !== undefined ? (deadline_at || null) : course.deadline_at,
        success_text !== undefined ? String(success_text).trim().slice(0, RESULT_TEXT_MAX) : course.success_text,
        fail_text !== undefined ? String(fail_text).trim().slice(0, RESULT_TEXT_MAX) : course.fail_text,
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
    const course = db.prepare('SELECT * FROM custom_courses WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Не найдено' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ error: 'Нет доступа' });

    const rejected = course.proposal_status === 'pending';
    db.prepare(`UPDATE custom_courses SET deleted_at = CURRENT_TIMESTAMP${rejected ? ", proposal_status = 'rejected'" : ''} WHERE id = ?`).run(course.id);
    // Proposals used to get approved/rejected in total silence — the author
    // had no way to find out short of re-checking their own course list.
    // Skipped when the actor is deleting their own (non-proposal) course,
    // not just when `rejected` is false, so a lead never gets a "your
    // proposal was declined" ping for their own ordinary course.
    if (rejected && course.created_by !== req.user.id) {
      const author = db.prepare('SELECT * FROM users WHERE id = ?').get(course.created_by);
      if (author) notifyUser(author, 'Курс отклонён', `Твой предложенный курс «${course.title}» отклонён.`);
    }
    logActivity(req.user.id, `course_deleted:${course.title.slice(0, 80)}`);
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
    const course = db.prepare('SELECT * FROM custom_courses WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
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
    if (approvingProposal) {
      awardAchievement(course.created_by, ACHIEVEMENT_IDS.AVTOR);
      if (course.created_by !== req.user.id) {
        awardCoins(course.created_by, COIN_REWARDS.proposalCourse);
        const author = db.prepare('SELECT * FROM users WHERE id = ?').get(course.created_by);
        if (author) notifyUser(author, 'Курс одобрен!', `Твой предложенный курс «${course.title}» одобрен и опубликован. +${COIN_REWARDS.proposalCourse} баг-коинов.`);
      }
    }

    logActivity(
      req.user.id,
      `${newStatus === 1 ? 'course_published' : 'course_unpublished'}:${course.title.slice(0, 80)}`,
      { courseId: course.id }
    );

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
    // Addressed by course id straight from the body, so it needs the same
    // visibility check the lesson routes now make — otherwise a draft
    // course could be time-tracked, and logged as completed, by someone
    // who cannot open it.
    const course = db.prepare('SELECT * FROM custom_courses WHERE id = ?').get(course_id);
    if (!canSeeCourse(course, req.user)) return res.status(404).json({ error: 'Курс не найден' });

    const clampedSeconds = Math.min(seconds_spent, MAX_COURSE_SECONDS_SPENT);
    // Coins for finishing a whole course need two guards this route can't
    // get from its own arguments. It upserts, so "was this the first call"
    // has to be read *before* the write; and it's an ordinary client POST
    // with a course_id in the body, so its word that the course is finished
    // buys nothing — every lesson has to be visible as done in
    // custom_lesson_progress, which only the gated
    // /api/custom-lessons/:id/complete route can write.
    const alreadyTracked = db.prepare(
      'SELECT 1 FROM course_time_tracking WHERE user_id = ? AND course_id = ?'
    ).get(userId, course_id);
    const lessonIds = db.prepare(`
      SELECT l.id FROM custom_lessons l
      JOIN custom_modules m ON m.id = l.module_id
      WHERE m.course_id = ?
    `).all(course_id).map(r => r.id);
    const doneCount = lessonIds.length
      ? db.prepare(
        `SELECT COUNT(*) as c FROM custom_lesson_progress WHERE user_id = ? AND lesson_id IN (${lessonIds.map(() => '?').join(',')})`
      ).get(userId, ...lessonIds).c
      : 0;
    const reallyFinished = lessonIds.length > 0 && doneCount === lessonIds.length;
    // ...and finishing it means passing it. The result screen already says
    // «Результат не засчитан» on a failed course; it used to pay the 50
    // coins anyway. A course with nothing gradable in it passes by default
    // (courseResultFor returns passed: true for score === null), so a
    // reading-only course still rewards finishing it.
    const passed = courseResultFor(userId, course_id).passed;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO course_time_tracking (user_id, course_id, seconds_spent, completed_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, course_id) DO UPDATE SET
          seconds_spent = excluded.seconds_spent,
          completed_at = excluded.completed_at
      `).run(userId, course_id, clampedSeconds);
      logActivity(userId, 'course_completed', { courseId: course_id });
      // Through the ledger, so the guard is a unique key rather than a
      // read-before-write that a second request could race past.
      if (reallyFinished && passed) awardOnce(userId, 'courseCompleted', course_id, COIN_REWARDS.courseCompleted);
    })();
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
        u.id as user_id, ${displayName('u')} as name, u.avatar_initials,
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

// ============== COURSE SECTIONS ==============
// Unlike suggestion_folders (private to the lead), these ARE part of the
// public catalog — every tester sees the same section grouping. CRUD is
// gated the same way course editing already is (hasManageCourses: admin,
// role lead, or a manage_courses grant), not the stricter requireRole('lead')
// suggestion_folders uses, since anyone who can already edit a course
// should be able to file it into a section.

router.get('/api/course-sections', authMiddleware, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM course_sections ORDER BY name').all());
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/course-sections', authMiddleware, requirePermission('manage_courses'), (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Укажите название раздела' });
    const id = db.prepare('INSERT INTO course_sections (name, created_by) VALUES (?, ?)').run(name, req.user.id).lastInsertRowid;
    res.status(201).json({ id, name });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/api/course-sections/:id', authMiddleware, requirePermission('manage_courses'), (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Укажите название раздела' });
    const section = db.prepare('SELECT id FROM course_sections WHERE id = ?').get(req.params.id);
    if (!section) return res.status(404).json({ error: 'Не найдено' });
    db.prepare('UPDATE course_sections SET name = ? WHERE id = ?').run(name, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/api/course-sections/:id', authMiddleware, requirePermission('manage_courses'), (req, res) => {
  try {
    db.transaction(() => {
      db.prepare('UPDATE custom_courses SET section_id = NULL WHERE section_id = ?').run(req.params.id);
      db.prepare('DELETE FROM course_sections WHERE id = ?').run(req.params.id);
    })();
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
