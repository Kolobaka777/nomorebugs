// The bonuses that sit on top of the 10-per-module base. All three of these
// used to pay the wrong amount for reasons that only show up on courses
// shaped like the real ones — more than four modules, a theory module among
// the tested ones, someone re-reading a test they had already passed.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

vi.mock('../src/telegram.js', () => ({ notifyUser: () => {}, notifyUserConfirmed: async () => 'none' }));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { COIN_REWARDS, QUIZ_STREAK_LENGTH } = await import('../src/routeHelpers.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, leadToken, testerToken;

const question = () => ({ question_text: 'Вопрос', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_idx: 0, explanation: 'потому что' });
const tested = i => ({ title: `Модуль ${i}`, lessons: [
  { title: `${i}.1 Тема`, type: 'lesson', content: 'текст', prerequisite_type: 'none' },
  { title: `Тест ${i}`, type: 'quiz', content: '', prerequisite_type: 'none', questions: [question()] },
] });
const theoryOnly = i => ({ title: `Модуль ${i}`, lessons: [
  { title: `${i}.1 Только чтение`, type: 'lesson', content: 'текст', prerequisite_type: 'none' },
] });

async function makeCourse(title, modules) {
  const res = await request(server).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`)
    .send({ title, is_published: 1, modules });
  expect(res.status).toBe(200);
  return {
    courseId: res.body.id,
    lessons: db.prepare(`
      SELECT l.id, l.type, m.id AS module_id FROM custom_lessons l
      JOIN custom_modules m ON m.id = l.module_id
      WHERE m.course_id = ? ORDER BY m.order_num, l.order_num
    `).all(res.body.id),
  };
}

const submit = (lessonId, correct) => {
  const qs = db.prepare('SELECT id, correct_idx FROM custom_quiz_questions WHERE lesson_id = ?').all(lessonId);
  return request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
    .send({ answers: Object.fromEntries(qs.map(q => [q.id, correct ? q.correct_idx : (q.correct_idx + 1) % 4])) });
};
const finish = lessonId => request(server).post(`/api/custom-lessons/${lessonId}/complete`).set('Authorization', `Bearer ${testerToken}`);

const ledger = reason => db.prepare('SELECT ref_id FROM coin_ledger WHERE user_id = ? AND reason = ?').all(fixtures.testerId, reason);
const countOf = reason => ledger(reason).length;

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

describe('the streak bonus is paid per run, not per module', () => {
  it('pays a six-module flawless course twice, not four times', async () => {
    const { lessons } = await makeCourse('Шесть модулей', [1, 2, 3, 4, 5, 6].map(tested));
    const before = countOf('quizStreak');

    for (let i = 0; i < 6; i++) {
      await finish(lessons[i * 2].id);
      await submit(lessons[i * 2 + 1].id, true);
      await finish(lessons[i * 2 + 1].id);
    }

    // Six modules is two complete runs of three. Paying on every module from
    // the third onward gave four, so the bonus outgrew the base it is meant
    // to be a fraction of.
    expect(countOf('quizStreak') - before).toBe(Math.floor(6 / QUIZ_STREAK_LENGTH));
  });

  it('pays nothing extra for a run that is still one module short', async () => {
    const { lessons } = await makeCourse('Два модуля', [1, 2].map(tested));
    const before = countOf('quizStreak');
    for (let i = 0; i < 2; i++) {
      await finish(lessons[i * 2].id);
      await submit(lessons[i * 2 + 1].id, true);
      await finish(lessons[i * 2 + 1].id);
    }
    expect(countOf('quizStreak')).toBe(before);
  });
});

describe('a module with nothing to grade', () => {
  it('does not break a run of tests passed either side of it', async () => {
    // The shape every seeded lecture track has: tested modules with a
    // reading-only one among them.
    const { lessons } = await makeCourse('С теорией внутри', [tested(1), tested(2), theoryOnly(3), tested(4)]);
    const before = countOf('quizStreak');

    // Walked in order, because the module gate refuses a lesson in a module
    // whose predecessor's test has not been passed yet.
    for (const l of lessons) {
      if (l.type === 'quiz') await submit(l.id, true);
      await finish(l.id);
    }

    // Three tested modules, all first try, nothing failed. The theory module
    // between them used to zero the run and pay nothing at all.
    expect(countOf('quizStreak') - before).toBe(1);
  });

  it('still pays for finishing that theory module', async () => {
    const { lessons } = await makeCourse('Только чтение', [theoryOnly(1)]);
    const before = countOf('moduleCompleted');
    await finish(lessons[0].id);
    expect(countOf('moduleCompleted') - before).toBe(1);
  });
});

describe('"с первого раза" means the first attempt passed', () => {
  it('does not punish someone for opening a test they already passed', async () => {
    const { courseId, lessons } = await makeCourse('Перечитал', [tested(1), tested(2)]);

    await finish(lessons[0].id);
    await submit(lessons[1].id, true);
    await finish(lessons[1].id);

    // Back into the test to look at it again, answering correctly a second
    // time. Nothing was failed; the attempt counter simply moved.
    await submit(lessons[1].id, true);
    expect(db.prepare('SELECT attempts FROM custom_quiz_results WHERE lesson_id = ? AND user_id = ?')
      .get(lessons[1].id, fixtures.testerId).attempts).toBe(2);

    await finish(lessons[2].id);
    await submit(lessons[3].id, true);
    await finish(lessons[3].id);

    expect(ledger('courseFlawless').some(r => r.ref_id === courseId)).toBe(true);
  });

  it('still withholds it when the first attempt actually failed', async () => {
    const { courseId, lessons } = await makeCourse('Не с первого', [tested(1)]);
    await submit(lessons[1].id, false);
    await submit(lessons[1].id, true);
    await finish(lessons[0].id);
    await finish(lessons[1].id);

    expect(ledger('courseFlawless').some(r => r.ref_id === courseId)).toBe(false);
    expect(ledger('quizFirstTry').some(r => r.ref_id === lessons[1].module_id)).toBe(false);
  });

  it('records the first attempt separately from the best one', async () => {
    const { lessons } = await makeCourse('Лучший и первый', [tested(1)]);
    await submit(lessons[1].id, false);
    await submit(lessons[1].id, true);
    const row = db.prepare('SELECT score, first_score FROM custom_quiz_results WHERE lesson_id = ? AND user_id = ?')
      .get(lessons[1].id, fixtures.testerId);
    expect(row.score).toBe(100);
    expect(row.first_score).toBe(0);
  });
});

describe('the amount paid stays anchored on the module', () => {
  it('never lets the streak bonus outgrow what the modules themselves paid', async () => {
    const { lessons } = await makeCourse('Длинный курс', [1, 2, 3, 4, 5, 6, 7, 8, 9].map(tested));
    const beforeModules = countOf('moduleCompleted');
    const beforeStreak = countOf('quizStreak');

    for (let i = 0; i < 9; i++) {
      await finish(lessons[i * 2].id);
      await submit(lessons[i * 2 + 1].id, true);
      await finish(lessons[i * 2 + 1].id);
    }

    const modulePay = (countOf('moduleCompleted') - beforeModules) * COIN_REWARDS.moduleCompleted;
    const streakPay = (countOf('quizStreak') - beforeStreak) * COIN_REWARDS.quizStreak;
    expect(streakPay).toBeLessThan(modulePay);
  });
});
