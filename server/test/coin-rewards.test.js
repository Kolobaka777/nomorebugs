// What earns bug-coins. The scheme is anchored on one number — 10 for
// finishing a module — and every other course reward is a multiple of it.
// The ledger is what makes each of them payable exactly once.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

vi.mock('../src/telegram.js', () => ({
  notifyUser: () => {},
  notifyUserConfirmed: async () => 'none',
}));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { COIN_REWARDS, QUIZ_STREAK_LENGTH } = await import('../src/routeHelpers.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, leadToken, testerToken;

const coinsOf = userId =>
  db.prepare('SELECT bug_coins FROM user_profiles WHERE user_id = ?').get(userId)?.bug_coins || 0;

const ledgerFor = userId =>
  db.prepare('SELECT reason, ref_id, amount FROM coin_ledger WHERE user_id = ?').all(userId);

const question = (correct) => ({
  question_text: 'Вопрос', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd',
  correct_idx: correct, explanation: 'потому что',
});

// `count` modules, each "тема + тест".
async function makeCourse(title, count) {
  const res = await request(server).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`)
    .send({
      title, is_published: 1,
      modules: Array.from({ length: count }, (_, i) => ({
        title: `Модуль ${i + 1}`,
        lessons: [
          { title: `${i + 1}.1 Тема`, type: 'lesson', content: 'текст', prerequisite_type: 'none' },
          { title: `Тест ${i + 1}`, type: 'quiz', content: '', prerequisite_type: 'none', questions: [question(0)] },
        ],
      })),
    });
  expect(res.status).toBe(200);
  const lessons = db.prepare(`
    SELECT l.id, l.title, l.type, m.id AS module_id FROM custom_lessons l
    JOIN custom_modules m ON m.id = l.module_id
    WHERE m.course_id = ? ORDER BY m.order_num, l.order_num
  `).all(res.body.id);
  return { courseId: res.body.id, lessons };
}

const qOf = lessonId => db.prepare('SELECT id, correct_idx FROM custom_quiz_questions WHERE lesson_id = ?').all(lessonId);

const answer = (lessonId, correct) => {
  const qs = qOf(lessonId);
  return request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
    .send({ answers: Object.fromEntries(qs.map(q => [q.id, correct ? q.correct_idx : (q.correct_idx + 1) % 4])) });
};
const finish = lessonId => request(server).post(`/api/custom-lessons/${lessonId}/complete`).set('Authorization', `Bearer ${testerToken}`);

// Reads a module: its lesson, then its test, passed on the first attempt.
async function clearModule(lessons, i) {
  await finish(lessons[i * 2].id);
  await answer(lessons[i * 2 + 1].id, true);
  await finish(lessons[i * 2 + 1].id);
}

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

describe('module rewards', () => {
  it('pays for a module when it is finished, not when the course is', async () => {
    const { lessons } = await makeCourse('Оплата по модулям', 2);
    const before = coinsOf(fixtures.testerId);

    await finish(lessons[0].id);
    // The lesson is read but the test is not passed — nothing is owed yet.
    expect(coinsOf(fixtures.testerId)).toBe(before);

    await clearModule(lessons, 0);
    expect(coinsOf(fixtures.testerId)).toBe(before + COIN_REWARDS.moduleCompleted + COIN_REWARDS.quizFirstTry);
  });

  it('pays for a module exactly once, however many times it is marked done', async () => {
    const { lessons } = await makeCourse('Дважды не платим', 1);
    await clearModule(lessons, 0);
    const after = coinsOf(fixtures.testerId);

    await finish(lessons[0].id);
    await finish(lessons[1].id);
    expect(coinsOf(fixtures.testerId)).toBe(after);
  });

  it('withholds the first-try bonus from a module that needed a retake', async () => {
    const { lessons } = await makeCourse('С пересдачей', 1);
    const before = coinsOf(fixtures.testerId);

    await answer(lessons[1].id, false);   // failed
    await answer(lessons[1].id, true);    // passed on the second attempt
    await finish(lessons[0].id);
    await finish(lessons[1].id);

    expect(coinsOf(fixtures.testerId)).toBe(before + COIN_REWARDS.moduleCompleted + COIN_REWARDS.finalQuizPassed);
    expect(ledgerFor(fixtures.testerId).some(r => r.reason === 'quizFirstTry' && r.ref_id === lessons[1].module_id)).toBe(false);
  });
});

describe('bonuses', () => {
  it('pays the streak once a run of modules is cleared first try, and not before', async () => {
    const { lessons } = await makeCourse('Серия', QUIZ_STREAK_LENGTH + 1);

    for (let i = 0; i < QUIZ_STREAK_LENGTH - 1; i++) await clearModule(lessons, i);
    const streaks = () => ledgerFor(fixtures.testerId).filter(r => r.reason === 'quizStreak').length;
    const before = streaks();

    await clearModule(lessons, QUIZ_STREAK_LENGTH - 1);
    expect(streaks()).toBe(before + 1);
  });

  it('pays for the final test and for a flawless run at the end of the course', async () => {
    const { courseId, lessons } = await makeCourse('Идеально', 2);
    for (let i = 0; i < 2; i++) await clearModule(lessons, i);

    const reasons = ledgerFor(fixtures.testerId).filter(r => r.ref_id === courseId).map(r => r.reason);
    expect(reasons).toContain('finalQuizPassed');
    expect(reasons).toContain('courseFlawless');
  });

  it('withholds the flawless bonus from a course where anything was retaken', async () => {
    const { courseId, lessons } = await makeCourse('Не идеально', 2);
    await clearModule(lessons, 0);
    await answer(lessons[3].id, false);
    await answer(lessons[3].id, true);
    await finish(lessons[2].id);
    await finish(lessons[3].id);

    const reasons = ledgerFor(fixtures.testerId).filter(r => r.ref_id === courseId).map(r => r.reason);
    expect(reasons).toContain('finalQuizPassed');
    expect(reasons).not.toContain('courseFlawless');
  });
});

describe('the price list', () => {
  it('is served from the same table the awards are paid from', async () => {
    const res = await request(server).get('/api/coins/rules').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.streakLength).toBe(QUIZ_STREAK_LENGTH);

    const byKey = Object.fromEntries(res.body.rules.map(r => [r.key, r]));
    for (const [key, amount] of Object.entries(COIN_REWARDS)) {
      expect(byKey[key].amount).toBe(amount);
      // A reward nobody can explain is a reward nobody can aim for.
      expect(byKey[key].label).not.toBe(key);
      expect(byKey[key].label.trim()).not.toBe('');
    }
  });

  it('lets a lead see what one person was paid for, and refuses everyone else', async () => {
    const mine = await request(server).get(`/api/lead/coins/${fixtures.testerId}`).set('Authorization', `Bearer ${leadToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.total).toBeGreaterThan(0);
    expect(mine.body.rows.every(r => r.label && r.times > 0)).toBe(true);

    const denied = await request(server).get(`/api/lead/coins/${fixtures.testerId}`).set('Authorization', `Bearer ${testerToken}`);
    expect(denied.status).toBe(403);
  });
});

describe('test attempts are recorded for the lead alone', () => {
  it('records the verdict and the pace, and keeps it out of the taker\'s own feed', async () => {
    const { lessons } = await makeCourse('Журнал попыток', 1);
    await request(server).post(`/api/custom-lessons/${lessons[1].id}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: Object.fromEntries(qOf(lessons[1].id).map(q => [q.id, q.correct_idx])), seconds_spent: 92 });

    const lead = await request(server).get('/api/lead/activity?category=learning').set('Authorization', `Bearer ${leadToken}`);
    const row = lead.body.rows.find(r => r.action.startsWith('quiz_passed:') && r.action.includes('Журнал попыток') === false);
    expect(row).toBeTruthy();
    expect(row.action).toMatch(/^quiz_passed:100%:92s:/);

    const own = await request(server).get('/api/me/activity').set('Authorization', `Bearer ${testerToken}`);
    expect(own.status).toBe(200);
    expect(own.body.rows.some(r => r.action.startsWith('quiz_passed:') || r.action.startsWith('quiz_failed:'))).toBe(false);
  });
});
