// A module opens only once the test before it has been passed. Without this
// the intermediate tests were optional detours: the contents listed every
// module from the start and nothing stopped anyone clicking into the last
// one on day one.
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
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let leadToken, testerToken;

const question = (correct) => ({
  question_text: 'Вопрос', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd',
  correct_idx: correct, explanation: 'потому что',
});

// Two modules, each "тема + тест", plus a third with nothing graded in it.
async function makeCourse(title) {
  const res = await request(server).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`)
    .send({
      title, is_published: 1,
      modules: [
        { title: 'Модуль 1', lessons: [
          { title: '1.1 Тема', type: 'lesson', content: 'текст', prerequisite_type: 'none' },
          { title: 'Тест 1', type: 'quiz', content: '', prerequisite_type: 'none', questions: [question(0)] },
        ] },
        { title: 'Модуль 2', lessons: [
          { title: '2.1 Тема', type: 'lesson', content: 'текст', prerequisite_type: 'none' },
          { title: 'Тест 2', type: 'quiz', content: '', prerequisite_type: 'none', questions: [question(1)] },
        ] },
        { title: 'Модуль 3', lessons: [
          { title: '3.1 Тема', type: 'lesson', content: 'текст', prerequisite_type: 'none' },
        ] },
      ],
    });
  expect(res.status).toBe(200);

  const lessons = db.prepare(`
    SELECT l.id, l.title, l.type, m.order_num AS modOrder, l.order_num AS lesOrder
    FROM custom_lessons l JOIN custom_modules m ON m.id = l.module_id
    WHERE m.course_id = ? ORDER BY m.order_num, l.order_num
  `).all(res.body.id);
  const byTitle = Object.fromEntries(lessons.map(l => [l.title, l]));
  const qOf = title => db.prepare('SELECT id, correct_idx FROM custom_quiz_questions WHERE lesson_id = ?').all(byTitle[title].id);
  return { courseId: res.body.id, byTitle, qOf };
}

const lockedMap = async (courseId, token) => {
  const res = await request(server).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return Object.fromEntries(res.body.modules.flatMap(m => m.lessons).map(l => [l.title, l.locked]));
};

const pass = (lessonId, qs) => request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`)
  .set('Authorization', `Bearer ${testerToken}`)
  .send({ answers: Object.fromEntries(qs.map(q => [q.id, q.correct_idx])) });

beforeAll(async () => {
  seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

describe('the module gate', () => {
  it('shuts every module after the one whose test is unpassed, and opens the first', async () => {
    const { courseId, byTitle } = await makeCourse('Гейт: старт');
    const locked = await lockedMap(courseId, testerToken);

    expect(locked['1.1 Тема']).toBe(false);
    expect(locked['Тест 1']).toBe(false);
    expect(locked['2.1 Тема']).toBe(true);
    expect(locked['Тест 2']).toBe(true);
    expect(locked['3.1 Тема']).toBe(true);
    expect(byTitle['2.1 Тема']).toBeTruthy();
  });

  it('refuses to open a shut module\'s lesson even when asked directly', async () => {
    const { byTitle } = await makeCourse('Гейт: прямой запрос');
    const res = await request(server).post(`/api/custom-lessons/${byTitle['2.1 Тема'].id}/complete`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/предыдущего модуля/i);
  });

  it('refuses to grade a shut module\'s test, so the gate cannot be answered around', async () => {
    const { byTitle, qOf } = await makeCourse('Гейт: тест впереди');
    const qs = qOf('Тест 2');
    const res = await request(server).post(`/api/custom-lessons/${byTitle['Тест 2'].id}/submit-quiz`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [qs[0].id]: qs[0].correct_idx } });
    expect(res.status).toBe(403);
  });

  it('opens the next module the moment its test is passed, and not before', async () => {
    const { courseId, byTitle, qOf } = await makeCourse('Гейт: сдал');

    // Failing leaves it shut.
    const qs = qOf('Тест 1');
    await request(server).post(`/api/custom-lessons/${byTitle['Тест 1'].id}/submit-quiz`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [qs[0].id]: (qs[0].correct_idx + 1) % 4 } });
    expect((await lockedMap(courseId, testerToken))['2.1 Тема']).toBe(true);

    await pass(byTitle['Тест 1'].id, qs);
    const after = await lockedMap(courseId, testerToken);
    expect(after['2.1 Тема']).toBe(false);
    // ...and only the next one. Module 3 still waits on module 2's test.
    expect(after['3.1 Тема']).toBe(true);
  });

  it('never gates whoever can edit the course — a lead walking a draft is checking it', async () => {
    const { courseId } = await makeCourse('Гейт: автор');
    const locked = await lockedMap(courseId, leadToken);
    expect(Object.values(locked).every(v => v === false)).toBe(true);
  });

  it('leaves a course with nothing graded in it wide open', async () => {
    // A rule about tests must not lock a course that has none.
    const created = await request(server).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`)
      .send({
        title: 'Только чтение', is_published: 1,
        modules: [
          { title: 'М1', lessons: [{ title: 'Читать 1', type: 'lesson', content: 'x', prerequisite_type: 'none' }] },
          { title: 'М2', lessons: [{ title: 'Читать 2', type: 'lesson', content: 'y', prerequisite_type: 'none' }] },
        ],
      });
    const locked = await lockedMap(created.body.id, testerToken);
    expect(locked['Читать 1']).toBe(false);
    expect(locked['Читать 2']).toBe(false);
  });
});
