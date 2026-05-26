import express from 'express';
import cors from 'cors';
import { db, initDb } from '../db/schema.js';
import bcryptjs from 'bcryptjs';
import { generateToken, authMiddleware, requireRole } from './auth.js';

initDb();

const app = express();
app.use(cors());
app.use(express.json());

// ============== AUTH ENDPOINTS ==============

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user || !bcryptjs.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);

    let needsBaselineSurvey = false;
    if (user.role === 'tester') {
      const baseline = db.prepare('SELECT id FROM baseline_survey WHERE user_id = ?').get(user.id);
      needsBaselineSurvey = !baseline;
    }

    // Log login activity
    db.prepare(`INSERT INTO activity_log (user_id, action) VALUES (?, ?)`).run(user.id, 'login');

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar_initials: user.avatar_initials },
      needsBaselineSurvey,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== TESTER CABINET ==============

app.get('/api/tester/profile', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, avatar_initials FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/tester/metrics', authMiddleware, (req, res) => {
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

    const currentSkills = db.prepare(`
      SELECT AVG(score) as avg FROM test_results WHERE user_id = ?
    `).get(userId);

    const skillGrowth = (currentSkills?.avg || 0) - (baseline?.avg || 0);
    const weeksRemaining = 10 - (completedCount?.count || 0);

    res.json({
      lecturesCompleted: completedCount?.count || 0,
      averageScore: Math.round(avgScore?.avg || 0),
      skillGrowth: skillGrowth.toFixed(1),
      weeksRemaining,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/tester/lectures', authMiddleware, (req, res) => {
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
      let status = 'locked';

      if (idx === 0 && !lecture.passed) {
        status = 'active';
      } else if (lecture.passed) {
        status = 'passed';
      } else if (idx > 0) {
        const prevLecture = lectures[idx - 1];
        if (prevLecture.passed && prevLecture.score >= 60) {
          status = 'active';
        }
      }

      return { ...lecture, status };
    });

    res.json(lecturesWithStatus);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== TESTER ACHIEVEMENTS ==============

app.get('/api/tester/achievements', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const firstTest = db.prepare('SELECT id FROM test_results WHERE user_id = ? LIMIT 1').get(userId);
    const perfectScore = db.prepare('SELECT id FROM test_results WHERE user_id = ? AND score = 100 LIMIT 1').get(userId);
    const allDone = db.prepare('SELECT COUNT(*) as count FROM test_results WHERE user_id = ? AND score >= 60').get(userId);
    const hasReport = db.prepare('SELECT id FROM baseline_survey WHERE user_id = ? LIMIT 1').get(userId);

    // Check 3-day streak
    const days = db.prepare(`
      SELECT DATE(created_at) as day FROM activity_log
      WHERE user_id = ?
      GROUP BY DATE(created_at)
      ORDER BY day DESC
      LIMIT 30
    `).all(userId);

    let hasStreak = false;
    for (let i = 0; i < days.length - 2; i++) {
      const d1 = new Date(days[i].day);
      const d2 = new Date(days[i + 1].day);
      const d3 = new Date(days[i + 2].day);
      const diff1 = Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
      const diff2 = Math.round((d2 - d3) / (1000 * 60 * 60 * 24));
      if (diff1 === 1 && diff2 === 1) {
        hasStreak = true;
        break;
      }
    }

    // Rare: perfect score 3 in a row
    const recentScores = db.prepare(
      'SELECT score FROM test_results WHERE user_id = ? ORDER BY completed_at DESC LIMIT 5'
    ).all(userId);
    const perfectThree = recentScores.length >= 3 && recentScores.slice(0, 3).every(r => r.score === 100);

    // Rare: early bird (before 9am)
    const earlyBird = db.prepare(
      "SELECT id FROM test_results WHERE user_id = ? AND CAST(strftime('%H', completed_at) AS INTEGER) < 9 LIMIT 1"
    ).get(userId);

    // Rare: night owl (after 23:00)
    const nightOwl = db.prepare(
      "SELECT id FROM test_results WHERE user_id = ? AND CAST(strftime('%H', completed_at) AS INTEGER) >= 23 LIMIT 1"
    ).get(userId);

    // Epic: no retakes + average >= 85
    const avgAll = db.prepare('SELECT AVG(score) as a FROM test_results WHERE user_id = ?').get(userId);
    const noRetakes = (allDone?.count || 0) > 0 && (allDone?.count || 0) === (firstTest ? 1 : 0);
    // simpler: check total tests = total passed lectures (meaning no duplicate attempts affected score much)
    const totalAttempts = db.prepare('SELECT COUNT(*) as c FROM test_results WHERE user_id = ?').get(userId)?.c || 0;
    const noRetakesEpic = totalAttempts === (allDone?.count || 0) && (avgAll?.a || 0) >= 85 && totalAttempts > 0;

    // Epic: all 100%
    const totalPassed = allDone?.count || 0;
    const all100 = totalPassed === 10 &&
      db.prepare('SELECT COUNT(*) as c FROM test_results WHERE user_id = ? AND score < 100').get(userId)?.c === 0;

    // Secret: snail joke filled
    const profileRow = db.prepare('SELECT snail_joke FROM user_profiles WHERE user_id = ?').get(userId);
    const hasSnailJoke = !!(profileRow?.snail_joke);

    // Rare: speedrun — complete a full block (2+ cards) in under 3 days
    const speedrun = db.prepare(`
      SELECT uc.skill_area FROM user_cards uc
      WHERE uc.user_id = ?
      GROUP BY uc.skill_area
      HAVING COUNT(*) >= (SELECT COUNT(*) FROM lectures l WHERE l.skill_area = uc.skill_area)
        AND (julianday('now') - julianday(MIN(uc.earned_at))) <= 3
      LIMIT 1
    `).get(userId);

    const achievements = [
      // === COMMON ===
      { id: 'first_test',   name: 'Юный жуковед',         description: 'Сдай первый тест',          icon: '🐛', earned: !!firstTest,           rarity: 'common' },
      { id: 'first_report', name: 'Охотник',               description: 'Заполни базовый опрос',      icon: '🎯', earned: !!hasReport,            rarity: 'common' },
      { id: 'streak_3',     name: 'Не улитка',             description: '3 дня активности подряд',    icon: '🔥', earned: hasStreak,              rarity: 'common' },
      // === RARE ===
      { id: 'perfect_score',name: 'Баг не прошёл',         description: '100% на любом тесте',        icon: '💯', earned: !!perfectScore,        rarity: 'rare' },
      { id: 'perfect_three',name: 'Перфекционист',         description: '100% на трёх тестах подряд', icon: '🎯', earned: perfectThree,           rarity: 'rare' },
      { id: 'early_bird',   name: 'Ранняя пташка',         description: 'Сдай тест до 9:00 утра',     icon: '🌅', earned: !!earlyBird,            rarity: 'rare' },
      { id: 'night_owl',    name: 'Сова',                  description: 'Сдай тест после 23:00',       icon: '🦉', earned: !!nightOwl,             rarity: 'rare' },
      { id: 'speedrun',     name: 'Спидран',               description: 'Закрой блок за 3 дня',        icon: '⚡', earned: !!speedrun,             rarity: 'rare' },
      // === EPIC ===
      { id: 'all_done',     name: 'Главный экстерминатор', description: 'Пройди все 10 лекций',        icon: '🏆', earned: totalPassed >= 10,      rarity: 'epic' },
      { id: 'no_retakes',   name: 'Пересдача не нужна',    description: 'Все лекции — с первого раза + средний ≥ 85%', icon: '🛡', earned: noRetakesEpic, rarity: 'epic' },
      { id: 'all_100',      name: 'Легенда жуков',         description: '100% на всех 10 тестах',      icon: '👑', earned: all100,                 rarity: 'epic' },
      // === SECRET ===
      { id: 'snail_joke',   name: 'Анекдотчик',            description: '???',                         icon: '🐌', earned: hasSnailJoke,           rarity: 'secret' },
    ];

    res.json(achievements);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== TESTER HISTORY ==============

app.get('/api/tester/history', authMiddleware, (req, res) => {
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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== TESTER BEFORE/AFTER ==============

app.get('/api/tester/before-after', authMiddleware, (req, res) => {
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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== GLOBAL STATS ==============

app.get('/api/stats', (req, res) => {
  try {
    const courses = db.prepare('SELECT COUNT(*) as count FROM lectures').get();
    const testers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'tester'").get();
    const bugsCaught = db.prepare('SELECT COUNT(*) as count FROM test_results WHERE score >= 60').get();

    res.json({
      courses: courses?.count || 0,
      testers: testers?.count || 0,
      bugsCaught: bugsCaught?.count || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== QUIZ ENDPOINTS ==============

app.get('/api/lectures/:id/questions', authMiddleware, (req, res) => {
  try {
    const questions = db.prepare(`
      SELECT id, lecture_id, question_text, option_a, option_b, option_c, option_d, order_num
      FROM questions
      WHERE lecture_id = ?
      ORDER BY order_num
    `).all(req.params.id);

    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/lectures/:id/submit-test', authMiddleware, (req, res) => {
  try {
    const { answers } = req.body;
    const lectureId = req.params.id;
    const userId = req.user.id;

    const questions = db.prepare(`
      SELECT id, correct_answer FROM questions WHERE lecture_id = ? ORDER BY order_num
    `).all(lectureId);

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

    db.prepare(`
      INSERT OR REPLACE INTO test_results (user_id, lecture_id, score, answers)
      VALUES (?, ?, ?, ?)
    `).run(userId, lectureId, score, JSON.stringify(answersMap));

    if (score >= 60) {
      db.prepare(`
        INSERT INTO activity_log (user_id, action, lecture_id)
        VALUES (?, ?, ?)
      `).run(userId, 'passed_lecture', lectureId);
    } else {
      db.prepare(`
        INSERT INTO activity_log (user_id, action, lecture_id)
        VALUES (?, ?, ?)
      `).run(userId, 'failed_lecture', lectureId);
    }

    // Award trading card if passed
    let cardDrop = null;
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

    // Award bug_coins
    const coinsEarned = score >= 90 ? 25 : score >= 75 ? 18 : score >= 60 ? 10 : 3;
    db.prepare(`
      INSERT INTO user_profiles (user_id, bug_coins)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET bug_coins = COALESCE(bug_coins, 0) + excluded.bug_coins
    `).run(userId, coinsEarned);

    res.json({ score, passed: score >= 60, cardDrop, coinsEarned });
  } catch (err) {
    console.error(err);
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

app.post('/api/tester/shop/buy', authMiddleware, (req, res) => {
  try {
    const { item_id } = req.body;
    const item = SHOP_CATALOG[item_id];
    if (!item) return res.status(400).json({ error: 'Неизвестный товар' });

    const userId = req.user.id;
    const row = db.prepare('SELECT bug_coins, purchased_items FROM user_profiles WHERE user_id = ?').get(userId) || {};
    const coins     = row.bug_coins || 0;
    const purchased = JSON.parse(row.purchased_items || '[]');

    if (purchased.includes(item_id)) return res.status(400).json({ error: 'Уже куплено' });
    if (coins < item.cost) return res.status(400).json({ error: `Недостаточно монет (нужно ${item.cost})` });

    const newCoins     = coins - item.cost;
    const newPurchased = JSON.stringify([...purchased, item_id]);

    db.prepare(`
      INSERT INTO user_profiles (user_id, bug_coins, purchased_items)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET bug_coins = ?, purchased_items = ?
    `).run(userId, newCoins, newPurchased, newCoins, newPurchased);

    res.json({ success: true, newCoins, item_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/lectures/:id/question/:qid/explanation', authMiddleware, (req, res) => {
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
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== BASELINE/FINAL SURVEY ==============

app.post('/api/tester/baseline-survey', authMiddleware, (req, res) => {
  try {
    const { html_structure, css_reading, devtools, console_errors, bug_report_quality } = req.body;
    const userId = req.user.id;

    db.prepare(`
      INSERT INTO baseline_survey (user_id, html_structure, css_reading, devtools, console_errors, bug_report_quality)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, html_structure, css_reading, devtools, console_errors, bug_report_quality);

    db.prepare(`INSERT INTO activity_log (user_id, action) VALUES (?, ?)`).run(userId, 'completed_baseline');

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/tester/final-survey', authMiddleware, (req, res) => {
  try {
    const { html_structure, css_reading, devtools, console_errors, bug_report_quality } = req.body;
    const userId = req.user.id;

    db.prepare(`
      INSERT OR REPLACE INTO final_survey (user_id, html_structure, css_reading, devtools, console_errors, bug_report_quality)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, html_structure, css_reading, devtools, console_errors, bug_report_quality);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== LEAD DASHBOARD ==============

app.get('/api/lead/team', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const teamData = db.prepare(`
      SELECT
        u.id, u.name, u.avatar_initials,
        (SELECT COUNT(*) FROM test_results WHERE user_id = u.id AND score >= 60) as lecturesCompleted,
        (SELECT AVG(score) FROM test_results WHERE user_id = u.id) as avgScore,
        (SELECT MAX(created_at) FROM activity_log WHERE user_id = u.id) as lastActive
      FROM users u
      WHERE u.role = 'tester'
      ORDER BY u.name
    `).all();

    const now = Date.now();

    const team = teamData.map((member) => {
      const lastActiveMs = member.lastActive ? new Date(member.lastActive).getTime() : 0;
      const daysInactive = member.lastActive
        ? Math.floor((now - lastActiveMs) / (1000 * 60 * 60 * 24))
        : 999;

      return {
        ...member,
        lecturesCompleted: member.lecturesCompleted || 0,
        avgScore: Math.round(member.avgScore || 0),
        skillGrowth: 0,
        daysInactive,
        isSnail: daysInactive >= 7,
      };
    });

    for (const member of team) {
      const baseline = db.prepare(`
        SELECT (html_structure + css_reading + devtools + console_errors + bug_report_quality) / 5.0 as avg
        FROM baseline_survey WHERE user_id = ?
      `).get(member.id);

      const current = db.prepare(`
        SELECT AVG(score) as avg FROM test_results WHERE user_id = ?
      `).get(member.id);

      member.skillGrowth = Math.round((current?.avg || 0) - (baseline?.avg || 0) * 10);
    }

    res.json(team);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/lead/before-after', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const skills = ['html_structure', 'css_reading', 'devtools', 'console_errors', 'bug_report_quality'];
    const skillLabels = ['HTML Structure', 'CSS Reading', 'DevTools', 'Console Errors', 'Bug Report Quality'];

    const chartData = [];

    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      const label = skillLabels[i];
      const before = db.prepare(`SELECT AVG(${skill}) as avg FROM baseline_survey`).get();
      const after  = db.prepare(`SELECT AVG(${skill}) as avg FROM final_survey`).get();

      chartData.push({
        skill: label,
        before: Math.round((before?.avg || 0) * 10) / 10,
        after:  Math.round((after?.avg || 0) * 10) / 10,
        delta:  Math.round(((after?.avg || 0) - (before?.avg || 0)) * 10) / 10,
      });
    }

    res.json(chartData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/lead/activity', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const activity = db.prepare(`
      SELECT
        a.id, a.action, a.created_at,
        u.name,
        l.title as lecture_title
      FROM activity_log a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN lectures l ON a.lecture_id = l.id
      ORDER BY a.created_at DESC
      LIMIT 20
    `).all();

    res.json(activity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== PROFILE CUSTOMIZATION ==============

// Badge unlock mappings (what each crafted badge awards)
const BADGE_UNLOCKS = {
  'HTML structure':      { frame: 'code',        bg: 'forest',  spec: 'HTML-жук' },
  'CSS reading':         { frame: 'rainbow',      bg: 'console', spec: 'CSS-жук' },
  'DevTools':            { frame: 'glitch',       bg: 'console', spec: 'DevTools-жук' },
  'Console errors':      { frame: 'code',         bg: 'console', spec: 'Консольный жук' },
  'Bug report quality':  { frame: 'crimescene',   bg: 'hive',    spec: 'Жук-репортёр' },
};

app.get('/api/tester/profile-full', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const user = db.prepare('SELECT id, email, name, avatar_initials, created_at FROM users WHERE id = ?').get(userId);
    const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId) || {};

    // RPG stats
    const totalTests    = db.prepare('SELECT COUNT(*) as c FROM test_results WHERE user_id = ?').get(userId)?.c || 0;
    const avgScore      = db.prepare('SELECT AVG(score) as a FROM test_results WHERE user_id = ?').get(userId)?.a || 0;
    const highScore     = db.prepare('SELECT COUNT(*) as c FROM test_results WHERE user_id = ? AND score >= 80').get(userId)?.c || 0;
    const passedCount   = db.prepare('SELECT COUNT(*) as c FROM test_results WHERE user_id = ? AND score >= 60').get(userId)?.c || 0;

    const joined      = new Date(user.created_at);
    const weeksActive = Math.max(1, Math.round((Date.now() - joined.getTime()) / (1000 * 60 * 60 * 24 * 7)));

    const stats = {
      int:     Math.min(10, Math.round(avgScore / 10)),
      per:     Math.min(10, Math.round((highScore / Math.max(1, totalTests)) * 10)),
      spd:     Math.min(10, Math.round((passedCount / weeksActive) * 1.5)),
      def:     Math.min(10, Math.round((passedCount / Math.max(1, totalTests)) * 10)),
      bug_pwr: Math.min(20, totalTests * 2),
    };

    // Streak
    const days = db.prepare(
      'SELECT DATE(created_at) as day FROM activity_log WHERE user_id = ? GROUP BY day ORDER BY day DESC'
    ).all(userId);
    let streak = 0;
    let expected = new Date().toISOString().split('T')[0];
    for (const { day } of days) {
      if (day === expected) {
        streak++;
        const d = new Date(expected); d.setDate(d.getDate() - 1);
        expected = d.toISOString().split('T')[0];
      } else break;
    }

    // Cards & badges
    const cards  = db.prepare('SELECT * FROM user_cards WHERE user_id = ? ORDER BY earned_at DESC').all(userId);
    const badges = db.prepare('SELECT * FROM user_badges WHERE user_id = ?').all(userId);

    // Craftable: all cards for a skill_area but badge not yet crafted
    const craftable = db.prepare(`
      SELECT uc.skill_area, COUNT(*) as card_count,
             (SELECT COUNT(*) FROM lectures WHERE skill_area = uc.skill_area) as total
      FROM user_cards uc WHERE uc.user_id = ?
      GROUP BY uc.skill_area
    `).all(userId)
      .filter(r => r.card_count >= r.total && !badges.find(b => b.badge_id === r.skill_area))
      .map(r => r.skill_area);

    // Favorite lecture detail
    let favLecture = null;
    if (profile.favorite_lecture_id) {
      favLecture = db.prepare(`
        SELECT l.id, l.title, l.skill_area, tr.score, tr.completed_at
        FROM lectures l LEFT JOIN test_results tr ON tr.lecture_id = l.id AND tr.user_id = ?
        WHERE l.id = ?
      `).get(userId, profile.favorite_lecture_id);
    }

    res.json({
      ...user,
      nickname:           profile.nickname    || user.name,
      status_quote:       profile.status_quote || '',
      specialization:     profile.specialization || '',
      info_box:           profile.info_box     || '',
      snail_joke:         profile.snail_joke   || '',
      avatar_id:          profile.avatar_id    || 'bug1',
      avatar_frame:       profile.avatar_frame || 'default',
      profile_bg:         profile.profile_bg   || 'default',
      showcase_badges:    JSON.parse(profile.showcase_badges || '[]'),
      favorite_lecture_id: profile.favorite_lecture_id || null,
      is_public:          profile.is_public !== undefined ? !!profile.is_public : true,
      custom_avatar:      profile.custom_avatar || null,
      bug_coins:          profile.bug_coins    || 0,
      purchased_items:    JSON.parse(profile.purchased_items || '[]'),
      stats, streak, cards, badges, craftable, favLecture,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/tester/profile', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const {
      nickname, status_quote, specialization, info_box, snail_joke,
      avatar_id, avatar_frame, profile_bg, showcase_badges,
      favorite_lecture_id, is_public, custom_avatar,
    } = req.body;

    if (nickname && nickname.length > 40)   return res.status(400).json({ error: 'Ник слишком длинный (макс 40)' });
    if (status_quote && status_quote.length > 60) return res.status(400).json({ error: 'Цитата слишком длинная (макс 60)' });
    if (info_box && info_box.length > 200)  return res.status(400).json({ error: 'Инфобокс слишком длинный (макс 200)' });

    db.prepare(`
      INSERT INTO user_profiles
        (user_id, nickname, status_quote, specialization, info_box, snail_joke,
         avatar_id, avatar_frame, profile_bg, showcase_badges, favorite_lecture_id, is_public, custom_avatar)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET
        nickname            = excluded.nickname,
        status_quote        = excluded.status_quote,
        specialization      = excluded.specialization,
        info_box            = excluded.info_box,
        snail_joke          = excluded.snail_joke,
        avatar_id           = excluded.avatar_id,
        avatar_frame        = excluded.avatar_frame,
        profile_bg          = excluded.profile_bg,
        showcase_badges     = excluded.showcase_badges,
        favorite_lecture_id = excluded.favorite_lecture_id,
        is_public           = excluded.is_public,
        custom_avatar       = excluded.custom_avatar
    `).run(
      userId,
      nickname || null, status_quote || null, specialization || null,
      info_box || null, snail_joke || null,
      avatar_id || 'bug1', avatar_frame || 'default', profile_bg || 'default',
      JSON.stringify(showcase_badges || []),
      favorite_lecture_id || null, is_public ? 1 : 0,
      custom_avatar || null,
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== TRADING CARDS ==============

app.get('/api/tester/cards', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const cards  = db.prepare('SELECT uc.*, l.title as lecture_title FROM user_cards uc JOIN lectures l ON uc.lecture_id = l.id WHERE uc.user_id = ? ORDER BY uc.earned_at DESC').all(userId);
    const badges = db.prepare('SELECT * FROM user_badges WHERE user_id = ?').all(userId);

    // Per-block progress
    const blocks = db.prepare(`
      SELECT l.skill_area,
             COUNT(*) as total,
             (SELECT COUNT(*) FROM user_cards uc WHERE uc.user_id = ? AND uc.skill_area = l.skill_area) as collected
      FROM lectures l GROUP BY l.skill_area
    `).all(userId);

    res.json({ cards, badges, blocks });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/tester/craft-badge', authMiddleware, (req, res) => {
  try {
    const { skill_area } = req.body;
    const userId = req.user.id;

    const collected = db.prepare('SELECT COUNT(*) as c FROM user_cards WHERE user_id = ? AND skill_area = ?').get(userId, skill_area)?.c || 0;
    const total     = db.prepare('SELECT COUNT(*) as c FROM lectures WHERE skill_area = ?').get(skill_area)?.c || 0;

    if (collected < total) return res.status(400).json({ error: 'Недостаточно карточек' });
    if (db.prepare('SELECT id FROM user_badges WHERE user_id = ? AND badge_id = ?').get(userId, skill_area))
      return res.status(400).json({ error: 'Значок уже скрафчен' });

    db.prepare('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, skill_area);
    db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)').run(userId, `crafted_badge:${skill_area}`);

    const unlocks = BADGE_UNLOCKS[skill_area] || { frame: 'gold', bg: 'forest', spec: '' };
    res.json({ success: true, badge_id: skill_area, unlocks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== SERVER ==============

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
