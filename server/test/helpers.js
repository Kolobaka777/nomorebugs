import bcryptjs from 'bcryptjs';

// Low bcrypt cost factor — this data never needs to resist real attacks, it
// only exists to make login endpoints exercisable in tests, and a low cost
// keeps the suite fast.
const TEST_BCRYPT_COST = 4;

/**
 * Inserts a minimal, self-contained fixture set into the given (test) db:
 * one lead, one tester, three lectures (with real correct_answer values),
 * and one baseline survey row. Returns the generated ids so tests can
 * reference them.
 */
export function seedTestData(db) {
  const insUser = db.prepare(
    'INSERT INTO users (email, password, name, role, avatar_initials) VALUES (?, ?, ?, ?, ?)'
  );
  const adminId = insUser.run(
    'admin@test.local', bcryptjs.hashSync('adminpass123', TEST_BCRYPT_COST), 'Test Admin', 'admin', 'TA'
  ).lastInsertRowid;
  const leadId = insUser.run(
    'lead@test.local', bcryptjs.hashSync('leadpass123', TEST_BCRYPT_COST), 'Test Lead', 'lead', 'TL'
  ).lastInsertRowid;
  const testerId = insUser.run(
    'tester@test.local', bcryptjs.hashSync('testerpass123', TEST_BCRYPT_COST), 'Test Tester', 'tester', 'TT'
  ).lastInsertRowid;

  const insLecture = db.prepare('INSERT INTO lectures (title, order_num, skill_area) VALUES (?, ?, ?)');
  const lec1Id = insLecture.run('Lecture One', 1, 'Skill A').lastInsertRowid;
  const lec2Id = insLecture.run('Lecture Two', 2, 'Skill A').lastInsertRowid;
  const lec3Id = insLecture.run('Lecture Three', 3, 'Skill A').lastInsertRowid;

  const insQuestion = db.prepare(`
    INSERT INTO questions (lecture_id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, order_num)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const q1Id = insQuestion.run(lec1Id, 'Q1?', 'A', 'B', 'C', 'D', 'b', 'because b', 1).lastInsertRowid;
  const q2Id = insQuestion.run(lec1Id, 'Q2?', 'A', 'B', 'C', 'D', 'a', 'because a', 2).lastInsertRowid;
  const q3Id = insQuestion.run(lec2Id, 'Q3?', 'A', 'B', 'C', 'D', 'c', 'because c', 1).lastInsertRowid;

  const insBaseline = db.prepare(`
    INSERT INTO baseline_survey (user_id, html_structure, css_reading, devtools, console_errors, bug_report_quality)
    VALUES (?, 2, 2, 2, 2, 2)
  `);
  insBaseline.run(testerId);

  return { adminId, leadId, testerId, lec1Id, lec2Id, lec3Id, q1Id, q2Id, q3Id };
}

export async function loginAs(request, app, email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Test login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}
