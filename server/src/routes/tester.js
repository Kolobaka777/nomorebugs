// Tester-facing cabinet: profile/metrics/lecture listing, history,
// before/after self-comparison, global landing-page stats, quiz
// submission + shop, and baseline/final skill surveys. Split out from the
// old monolithic app.js — see PROGRESS.md.
import express from 'express';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import { authMiddleware } from '../auth.js';
import { isUniqueConstraintError, awardAchievement, ACHIEVEMENT_IDS } from '../routeHelpers.js';

const router = express.Router();

// ============== TESTER CABINET ==============

router.get('/api/tester/profile', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, avatar_initials FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/tester/metrics', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const completedCount = db.prepare(`
      SELECT COUNT(*) as count FROM test_results WHERE user_id = ? AND score >= 60
    `).get(userId);

    const avgScore = db.prepare(`
      SELECT AVG(score) as avg FROM test_results WHERE user_id = ?
    `).get(userId);

    const baseline = db.prepare(`
      SELECT (html_structure + css_reading + devtools + console_errors + bug_report_quality) / 5.0 as avg
      FROM baseline_survey WHERE user_id = ?
    `).get(userId);

    // currentSkills is the same average-test-score value as avgScore above —
    // reuse it instead of running the identical query twice.
    const currentSkills = avgScore;

    // Both sides normalized to a 0-100 scale: baseline is a 1-5 self-rating (x20),
    // current is the average test score (already 0-100).
    const skillGrowth = (currentSkills?.avg || 0) - (baseline?.avg || 0) * 20;
    const weeksRemaining = 10 - (completedCount?.count || 0);

    res.json({
      lecturesCompleted: completedCount?.count || 0,
      averageScore: Math.round(avgScore?.avg || 0),
      skillGrowth: skillGrowth.toFixed(1),
      weeksRemaining,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/tester/lectures', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const lectures = db.prepare(`
      SELECT l.*,
        (SELECT score FROM test_results WHERE user_id = ? AND lecture_id = l.id) as score,
        (SELECT COUNT(*) FROM test_results WHERE user_id = ? AND lecture_id = l.id) as passed
      FROM lectures l
      ORDER BY l.order_num
    `).all(userId, userId);

    const lecturesWithStatus = lectures.map((lecture, idx) => {
      // `passed` here is actually an attempt count (see query above), not a
      // pass/fail flag — a real pass additionally requires score >= 60.
      const passedWithScore = lecture.passed && lecture.score >= 60;

      let status;
      if (passedWithScore) {
        status = 'passed';
      } else if (idx === 0) {
        // The first lecture is always available, including for a retry after a failed attempt.
        status = 'active';
      } else {
        const prevLecture = lectures[idx - 1];
        status = (prevLecture.passed && prevLecture.score >= 60) ? 'active' : 'locked';
      }

      return { ...lecture, status };
    });

    res.json(lecturesWithStatus);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== TESTER HISTORY ==============

router.get('/api/tester/history', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const history = db.prepare(`
      SELECT tr.id, tr.score, tr.completed_at, l.title as lecture_title, l.skill_area
      FROM test_results tr
      JOIN lectures l ON tr.lecture_id = l.id
      WHERE tr.user_id = ?
      ORDER BY tr.completed_at DESC
    `).all(userId);

    res.json(history);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== TESTER BEFORE/AFTER ==============

router.get('/api/tester/before-after', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const baseline = db.prepare('SELECT * FROM baseline_survey WHERE user_id = ?').get(userId);
    const final = db.prepare('SELECT * FROM final_survey WHERE user_id = ?').get(userId);

    const skills = [
      { key: 'html_structure', label: 'HTML структура' },
      { key: 'css_reading', label: 'Чтение CSS' },
      { key: 'devtools', label: 'DevTools' },
      { key: 'console_errors', label: 'Ошибки консоли' },
      { key: 'bug_report_quality', label: 'Баг-репорты' },
    ];

    const result = skills.map(s => {
      const before = baseline?.[s.key] || 0;
      const after = final?.[s.key] || before;
      return {
        skill: s.label,
        before,
        after,
        delta: after - before,
      };
    });

    res.json(result);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== GLOBAL STATS ==============

// These 5 COUNT/AVG queries run over the whole table on every homepage load
// but change slowly — a simple in-process cache keeps that off the hot path
// without pulling in an external cache library for one endpoint.
const STATS_CACHE_MS = 60 * 1000;
let statsCache = { data: null, expiresAt: 0 };

router.get('/api/stats', (req, res) => {
  try {
    if (statsCache.data && Date.now() < statsCache.expiresAt) {
      return res.json(statsCache.data);
    }

    const courses = db.prepare('SELECT COUNT(*) as count FROM lectures').get();
    const testers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'tester'").get();
    const bugsCaught = db.prepare('SELECT COUNT(*) as count FROM test_results WHERE score >= 60').get();
    const avgScore = db.prepare('SELECT AVG(score) as avg FROM test_results').get();
    const checklistsCompleted = db.prepare('SELECT COUNT(*) as count FROM checklist_submissions').get();

    const data = {
      courses: courses?.count || 0,
      testers: testers?.count || 0,
      bugsCaught: bugsCaught?.count || 0,
      // Homepage's "Балл" stat card — global average test score, rescaled
      // from the 0-100 DB range to the /5 the design shows (e.g. "4.7").
      avgScore: Math.round(((avgScore?.avg || 0) / 100) * 5 * 10) / 10,
      checklistsCompleted: checklistsCompleted?.count || 0,
    };

    statsCache = { data, expiresAt: Date.now() + STATS_CACHE_MS };
    res.json(data);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== QUIZ ENDPOINTS ==============

// Tracks when a tester actually fetched a lecture's questions, so
// submit-test can verify how long a quiz genuinely took server-side instead
// of trusting the client-reported per-question timings (which a direct API
// call could simply omit — see that route's comment). In-memory and
// single-instance only (matches this app's numReplicas: 1 constraint,
// documented in DEPLOYMENT.md); losing an entry on restart just means that
// one in-flight quiz's speed can't be verified, which fails closed on
// rewards below rather than blocking submission.
const quizStartTimes = new Map();

// Lightweight lecture metadata (currently just video_url) — kept as its own
// endpoint rather than folded into GET /api/lectures/:id/questions, whose
// response is consumed as a bare question array today; reshaping that would
// be a breaking change for every existing caller.
router.get('/api/lectures/:id', authMiddleware, (req, res) => {
  try {
    const lecture = db.prepare('SELECT id, title, skill_area, video_url FROM lectures WHERE id = ?').get(req.params.id);
    if (!lecture) return res.status(404).json({ error: 'Не найдено' });
    res.json(lecture);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/lectures/:id/questions', authMiddleware, (req, res) => {
  try {
    const questions = db.prepare(`
      SELECT id, lecture_id, question_text, option_a, option_b, option_c, option_d, order_num
      FROM questions
      WHERE lecture_id = ?
      ORDER BY order_num
    `).all(req.params.id);

    quizStartTimes.set(`${req.user.id}:${req.params.id}`, Date.now());

    res.json(questions);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/lectures/:id/submit-test', authMiddleware, (req, res) => {
  try {
    const { answers, meta } = req.body;
    const lectureId = req.params.id;
    const userId = req.user.id;

    // Was indexed directly below (`answers[question.id]`) with no check —
    // a request missing/malformed `answers` (e.g. a client bug, or a direct
    // API call) threw a raw TypeError, surfacing as an opaque 500 instead of
    // a normal 400.
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ error: 'Некорректный формат ответов' });
    }

    // Mandatory sequential prerequisite, server-enforced. Previously this
    // was only a display-layer computation (in GET /api/tester/lectures) —
    // the frontend hid the button for a "locked" lecture, but nothing
    // stopped a direct API call from submitting one anyway.
    const lecture = db.prepare('SELECT order_num FROM lectures WHERE id = ?').get(lectureId);
    if (!lecture) return res.status(404).json({ error: 'Лекция не найдена' });
    const prevLecture = db.prepare('SELECT id FROM lectures WHERE order_num < ? ORDER BY order_num DESC LIMIT 1').get(lecture.order_num);
    if (prevLecture) {
      const prevResult = db.prepare('SELECT score FROM test_results WHERE user_id = ? AND lecture_id = ?').get(userId, prevLecture.id);
      if (!prevResult || prevResult.score < 60) {
        return res.status(403).json({ error: 'Сначала нужно пройти предыдущую лекцию' });
      }
    }

    const questions = db.prepare(`
      SELECT id, correct_answer, question_text, option_a, option_b, option_c, option_d
      FROM questions WHERE lecture_id = ? ORDER BY order_num
    `).all(lectureId);

    // A lecture with no questions (shouldn't normally happen, but nothing
    // else here guarantees it) would otherwise divide by zero below and
    // silently produce a NaN score.
    if (questions.length === 0) {
      return res.status(400).json({ error: 'У этой лекции нет вопросов' });
    }

    let score = 0;
    const answersMap = {};

    for (const question of questions) {
      const userAnswer = answers[question.id];
      answersMap[question.id] = userAnswer;
      if (userAnswer === question.correct_answer) {
        score += (100 / questions.length);
      }
    }

    score = Math.round(score);

    // Whether coins / hidden-rating credit are even eligible on this
    // submission — checked before the write below replaces the row.
    // Resubmitting an already-attempted lecture still updates the score
    // record and can still unlock the next lecture as before, but no
    // longer re-grants coins or hidden-rating points every time —
    // previously a passed lecture could be resubmitted indefinitely to
    // farm both without bound.
    const isFirstSubmission = !db.prepare(
      'SELECT 1 FROM test_results WHERE user_id = ? AND lecture_id = ?'
    ).get(userId, lectureId);

    // Per-question minimum-plausible-read time — used below to verify pace
    // server-side instead of trusting the client's own report of it.
    function minPlausibleSeconds(q) {
      const text = [q.question_text, q.option_a, q.option_b, q.option_c, q.option_d].join(' ');
      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      return Math.max(3, Math.ceil(wordCount / 3)); // ~3 words/sec fast-but-real reading pace
    }

    // The "how fast did they actually go" signal used to come entirely from
    // client-reported meta.questionTimes — a direct API call could just
    // omit meta (a missing per-question time defaulted to 999, i.e. "not
    // fast"), which both unconditionally passed the hidden-rating gate
    // below AND hid the exact same fastAnswerCount from the lead-facing
    // "soft flag" a lead would otherwise notice it by. Total elapsed time
    // is measured server-side instead, from when this tester actually
    // fetched the lecture's questions (see GET /api/lectures/:id/questions)
    // to now — a number the client has no way to inflate. Anything that
    // can't be verified this way (no recorded fetch — a direct submit that
    // skipped fetching first, or a server restart mid-quiz) is treated as
    // unverified pace rather than trusted, both for the flag and for reward
    // eligibility below.
    const startKey = `${userId}:${lectureId}`;
    const startedAt = quizStartTimes.get(startKey);
    quizStartTimes.delete(startKey);
    const totalMinPlausibleSeconds = questions.reduce((sum, q) => sum + minPlausibleSeconds(q), 0);
    const serverElapsedSeconds = startedAt != null ? (Date.now() - startedAt) / 1000 : null;
    const verifiedHonestPace = serverElapsedSeconds !== null && serverElapsedSeconds >= totalMinPlausibleSeconds;
    const fastAnswerCount = verifiedHonestPace ? 0 : questions.length;
    const tabSwitches = Number.isInteger(meta?.tabSwitches) ? meta.tabSwitches : 0;
    const resultMeta = JSON.stringify({ tabSwitches, fastAnswerCount, serverElapsedSeconds, totalMinPlausibleSeconds });

    // Result, activity log, card award, and coin award must all land together
    // or not at all — a crash mid-sequence used to be able to record a score
    // with no card/coins granted for it.
    const coinsEarned = isFirstSubmission ? (score >= 90 ? 25 : score >= 75 ? 18 : score >= 60 ? 10 : 3) : 0;
    let cardDrop = null;
    db.transaction(() => {
      // Keeps the *best* score across retakes, not just the latest — a
      // retake used to overwrite an already-passing score with a worse one
      // (INSERT OR REPLACE), which could flip an already-passed lecture back
      // to "locked" (and re-lock whatever came after it) until retaken again.
      // answers/meta still reflect the most recent attempt, since those are
      // what a lead would want to review.
      db.prepare(`
        INSERT INTO test_results (user_id, lecture_id, score, answers, meta)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, lecture_id) DO UPDATE SET
          score = MAX(score, excluded.score),
          answers = excluded.answers,
          meta = excluded.meta,
          completed_at = CURRENT_TIMESTAMP
      `).run(userId, lectureId, score, JSON.stringify(answersMap), resultMeta);

      db.prepare(`
        INSERT INTO activity_log (user_id, action, lecture_id)
        VALUES (?, ?, ?)
      `).run(userId, score >= 60 ? 'passed_lecture' : 'failed_lecture', lectureId);

      // Award trading card if passed
      if (score >= 60) {
        const lec = db.prepare('SELECT skill_area FROM lectures WHERE id = ?').get(lectureId);
        if (lec) {
          const rarity = score >= 90 ? 'epic' : score >= 75 ? 'rare' : 'common';
          const inserted = db.prepare(
            'INSERT OR IGNORE INTO user_cards (user_id, lecture_id, skill_area, rarity) VALUES (?,?,?,?)'
          ).run(userId, lectureId, lec.skill_area, rarity);
          if (inserted.changes > 0) {
            cardDrop = { skill_area: lec.skill_area, rarity };
          }
          // Check if block is now craftable
          const collected = db.prepare('SELECT COUNT(*) as c FROM user_cards WHERE user_id = ? AND skill_area = ?').get(userId, lec.skill_area)?.c || 0;
          const total     = db.prepare('SELECT COUNT(*) as c FROM lectures WHERE skill_area = ?').get(lec.skill_area)?.c || 0;
          const alreadyBadged = db.prepare('SELECT id FROM user_badges WHERE user_id = ? AND badge_id = ?').get(userId, lec.skill_area);
          if (cardDrop) cardDrop.canCraft = (collected >= total) && !alreadyBadged;
        }
      }

      // Award bug_coins — first attempt at this lecture only, see isFirstSubmission above.
      if (isFirstSubmission) {
        db.prepare(`
          INSERT INTO user_profiles (user_id, bug_coins)
          VALUES (?, ?)
          ON CONFLICT(user_id) DO UPDATE SET bug_coins = COALESCE(bug_coins, 0) + excluded.bug_coins
        `).run(userId, coinsEarned);
      }

      // Hidden quality+speed signal for a lead's internal-ratings view (see
      // /api/lead/internal-ratings) — score and pace both have to be
      // genuinely good (pace is now verified server-side, see above), pace
      // is disqualified entirely by more than one tab-switch, and this only
      // ever fires once per lecture (isFirstSubmission) so it can't be
      // farmed by repeatedly resubmitting an already-passed lecture.
      if (isFirstSubmission && score >= 90 && verifiedHonestPace && tabSwitches <= 1) {
        db.prepare('INSERT INTO internal_score_events (user_id, points, reason, source) VALUES (?, ?, ?, ?)')
          .run(userId, 5, `Отличный результат по лекции (${score}%), без признаков спешки`, 'auto_quiz_excellence');
      }

      // «Отличник» achievement — the 5 most-recently-completed lectures (by
      // distinct lecture, best score kept on retake) are all ≥90%. Re-checked
      // on every submission, not just isFirstSubmission, since a retake that
      // raises an old score can be what completes the streak; awardAchievement
      // is idempotent so re-awarding on a later still-qualifying submission
      // is a harmless no-op.
      const recentScores = db.prepare(
        'SELECT score FROM test_results WHERE user_id = ? ORDER BY completed_at DESC LIMIT 5'
      ).all(userId);
      if (recentScores.length === 5 && recentScores.every(r => r.score >= 90)) {
        awardAchievement(userId, ACHIEVEMENT_IDS.OTLICHNIK);
      }
    })();

    res.json({ score, passed: score >= 60, cardDrop, coinsEarned });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── SHOP ──────────────────────────────────────────────────────────────────────
const SHOP_CATALOG = {
  'frame_gold':    { cost: 200, label: 'Золотая рамка' },
  'frame_rainbow': { cost: 350, label: 'Рамка-радуга' },
  'frame_glitch':  { cost: 300, label: 'Глитч-рамка' },
  'bg_hive':       { cost: 150, label: 'Фон «Улей»' },
  'bg_amber':      { cost: 250, label: 'Фон «Янтарь»' },
};

router.post('/api/tester/shop/buy', authMiddleware, (req, res) => {
  try {
    const { item_id } = req.body;
    const item = SHOP_CATALOG[item_id];
    if (!item) return res.status(400).json({ error: 'Неизвестный товар' });

    const userId = req.user.id;

    // Read-check-write on bug_coins — wrapped so two concurrent purchases
    // can't both read the same starting balance and each independently
    // decide they can afford it (better-sqlite3 transactions are
    // synchronous, so this makes the whole read-check-write atomic).
    const result = db.transaction(() => {
      const row = db.prepare('SELECT bug_coins, purchased_items FROM user_profiles WHERE user_id = ?').get(userId) || {};
      const coins     = row.bug_coins || 0;
      const purchased = JSON.parse(row.purchased_items || '[]');

      if (purchased.includes(item_id)) return { error: 'Уже куплено' };
      if (coins < item.cost) return { error: `Недостаточно монет (нужно ${item.cost})` };

      const newCoins     = coins - item.cost;
      const newPurchased = JSON.stringify([...purchased, item_id]);

      db.prepare(`
        INSERT INTO user_profiles (user_id, bug_coins, purchased_items)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET bug_coins = ?, purchased_items = ?
      `).run(userId, newCoins, newPurchased, newCoins, newPurchased);

      return { newCoins };
    })();

    if (result.error) return res.status(400).json({ error: result.error });

    res.json({ success: true, newCoins: result.newCoins, item_id });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/lectures/:id/question/:qid/explanation', authMiddleware, (req, res) => {
  try {
    const question = db.prepare(`
      SELECT question_text, option_a, option_b, option_c, option_d, correct_answer, explanation
      FROM questions
      WHERE id = ?
    `).get(req.params.qid);

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const options = {
      a: question.option_a,
      b: question.option_b,
      c: question.option_c,
      d: question.option_d,
    };

    res.json({
      question: question.question_text,
      correctAnswer: question.correct_answer,
      correctOption: options[question.correct_answer],
      explanation: question.explanation,
      allOptions: options,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== BASELINE/FINAL SURVEY ==============

// The table itself has a CHECK(1-5) constraint on every one of these
// columns, which already blocks genuinely out-of-range abuse (a request
// would just 500 on the constraint violation) — this is purely so a bad
// request gets a clear 400 instead of an opaque server error, and so a
// non-integer like 3.5 (which the CHECK's numeric bounds alone don't catch,
// since SQLite's INTEGER affinity keeps a non-whole REAL as-is) can't quietly
// skew the before/after skill dashboards with a value nobody could have
// actually picked in the UI's 1-5 radio buttons.
function validateSurveyAnswers(body) {
  for (const field of ['html_structure', 'css_reading', 'devtools', 'console_errors', 'bug_report_quality']) {
    const value = body[field];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return `Поле "${field}" должно быть целым числом от 1 до 5`;
    }
  }
  return null;
}

router.post('/api/tester/baseline-survey', authMiddleware, (req, res) => {
  try {
    const validationError = validateSurveyAnswers(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const { html_structure, css_reading, devtools, console_errors, bug_report_quality } = req.body;
    const userId = req.user.id;

    db.prepare(`
      INSERT INTO baseline_survey (user_id, html_structure, css_reading, devtools, console_errors, bug_report_quality)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, html_structure, css_reading, devtools, console_errors, bug_report_quality);

    db.prepare(`INSERT INTO activity_log (user_id, action) VALUES (?, ?)`).run(userId, 'completed_baseline');

    res.json({ success: true });
  } catch (err) {
    // baseline_survey.user_id is UNIQUE by design (it's a one-time "before"
    // snapshot compared against the final survey later) — a second
    // submission hitting that constraint is an expected condition, not a
    // server fault.
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ error: 'Вы уже проходили этот опрос' });
    }
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/tester/final-survey', authMiddleware, (req, res) => {
  try {
    const validationError = validateSurveyAnswers(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const { html_structure, css_reading, devtools, console_errors, bug_report_quality } = req.body;
    const userId = req.user.id;

    db.prepare(`
      INSERT OR REPLACE INTO final_survey (user_id, html_structure, css_reading, devtools, console_errors, bug_report_quality)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, html_structure, css_reading, devtools, console_errors, bug_report_quality);

    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
