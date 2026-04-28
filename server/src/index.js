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

    // Check if tester needs baseline survey
    let needsBaselineSurvey = false;
    if (user.role === 'tester') {
      const baseline = db.prepare('SELECT id FROM baseline_survey WHERE user_id = ?').get(user.id);
      needsBaselineSurvey = !baseline;
    }

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

    // Lectures completed
    const completedCount = db.prepare(`
      SELECT COUNT(*) as count FROM test_results WHERE user_id = ? AND score >= 60
    `).get(userId);

    // Average test score
    const avgScore = db.prepare(`
      SELECT AVG(score) as avg FROM test_results WHERE user_id = ?
    `).get(userId);

    // Skill growth: baseline vs current avg
    const baseline = db.prepare(`
      SELECT (html_structure + css_reading + devtools + console_errors + bug_report_quality) / 5.0 as avg
      FROM baseline_survey WHERE user_id = ?
    `).get(userId);

    const currentSkills = db.prepare(`
      SELECT AVG(score) as avg FROM test_results WHERE user_id = ?
    `).get(userId);

    const skillGrowth = (currentSkills?.avg || 0) - (baseline?.avg || 0);

    // Weeks remaining (assuming 10 weeks for 10 lectures)
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

      return {
        ...lecture,
        status,
      };
    });

    res.json(lecturesWithStatus);
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
    const { answers } = req.body; // { "questionId": "answer", ... }
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

    // Save test result
    db.prepare(`
      INSERT OR REPLACE INTO test_results (user_id, lecture_id, score, answers)
      VALUES (?, ?, ?, ?)
    `).run(userId, lectureId, score, JSON.stringify(answersMap));

    // Log activity
    if (score >= 60) {
      db.prepare(`
        INSERT INTO activity_log (user_id, action, lecture_id)
        VALUES (?, ?, ?)
      `).run(userId, 'passed_lecture', lectureId);
    }

    res.json({ score, passed: score >= 60 });
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
        u.id,
        u.name,
        (SELECT COUNT(*) FROM test_results WHERE user_id = u.id AND score >= 60) as lecturesCompleted,
        (SELECT AVG(score) FROM test_results WHERE user_id = u.id) as avgScore
      FROM users u
      WHERE u.role = 'tester'
      ORDER BY u.name
    `).all();

    const team = teamData.map((member) => ({
      ...member,
      lecturesCompleted: member.lecturesCompleted || 0,
      avgScore: Math.round(member.avgScore || 0),
      skillGrowth: 0, // Will calculate after
    }));

    // Calculate skill growth for each member
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
    const testers = db.prepare(`
      SELECT id, name FROM users WHERE role = 'tester' ORDER BY name
    `).all();

    const skills = [
      'html_structure',
      'css_reading',
      'devtools',
      'console_errors',
      'bug_report_quality',
    ];

    const skillLabels = [
      'HTML Structure',
      'CSS Reading',
      'DevTools',
      'Console Errors',
      'Bug Report Quality',
    ];

    const chartData = [];

    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      const label = skillLabels[i];
      const before = db.prepare(`
        SELECT AVG(${skill}) as avg FROM baseline_survey
      `).get();

      const after = db.prepare(`
        SELECT AVG(${skill}) as avg FROM final_survey
      `).get();

      chartData.push({
        skill: label,
        before: Math.round(before?.avg || 0),
        after: Math.round(after?.avg || 0),
        delta: Math.round((after?.avg || 0) - (before?.avg || 0)),
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
        a.id,
        a.action,
        a.created_at,
        u.name,
        l.title as lecture_title
      FROM activity_log a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN lectures l ON a.lecture_id = l.id
      ORDER BY a.created_at DESC
      LIMIT 10
    `).all();

    res.json(activity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== SERVER ==============

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
