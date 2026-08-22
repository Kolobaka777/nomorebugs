// Purging a course from the trash for good. The cascade is walked by hand
// because the foreign keys carry no ON DELETE and foreign_keys is ON — so a
// forgotten table does not leave stray rows, it rolls the whole transaction
// back and strands the course in the trash permanently.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

vi.mock('../src/telegram.js', () => ({ notifyUser: () => {}, notifyUserConfirmed: async () => 'none' }));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { hardDeleteCourse } = await import('../src/routeHelpers.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, leadToken, testerToken;

const question = () => ({
  question_text: 'Вопрос', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd',
  correct_idx: 0, explanation: 'потому что',
});

async function makeCourse(title) {
  const res = await request(server).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`)
    .send({
      title, is_published: 1,
      modules: [{
        title: 'Модуль 1',
        lessons: [
          { title: '1.1 Тема', type: 'lesson', content: 'текст', prerequisite_type: 'none' },
          { title: 'Тест 1', type: 'quiz', content: '', prerequisite_type: 'none', questions: [question()] },
        ],
      }],
    });
  expect(res.status).toBe(200);
  const lessons = db.prepare(`
    SELECT l.id, l.type FROM custom_lessons l
    JOIN custom_modules m ON m.id = l.module_id
    WHERE m.course_id = ? ORDER BY l.order_num
  `).all(res.body.id);
  return { courseId: res.body.id, lessons };
}

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

describe('a course somebody actually took', () => {
  it('purges instead of sticking in the trash forever', async () => {
    const { courseId, lessons } = await makeCourse('Пройденный курс');
    const quiz = lessons.find(l => l.type === 'quiz');

    // Somebody passed the test, which puts a row in custom_quiz_results with
    // a foreign key on custom_lessons.
    const qs = db.prepare('SELECT id, correct_idx FROM custom_quiz_questions WHERE lesson_id = ?').all(quiz.id);
    await request(server).post(`/api/custom-lessons/${quiz.id}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: Object.fromEntries(qs.map(q => [q.id, q.correct_idx])) });
    expect(db.prepare('SELECT COUNT(*) c FROM custom_quiz_results WHERE lesson_id = ?').get(quiz.id).c).toBe(1);

    expect(() => hardDeleteCourse(courseId)).not.toThrow();

    expect(db.prepare('SELECT COUNT(*) c FROM custom_courses WHERE id = ?').get(courseId).c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) c FROM custom_quiz_results WHERE lesson_id = ?').get(quiz.id).c).toBe(0);
  });

  it('leaves no orphaned rows behind', async () => {
    const { courseId, lessons } = await makeCourse('Ещё один');
    const quiz = lessons.find(l => l.type === 'quiz');
    const qs = db.prepare('SELECT id, correct_idx FROM custom_quiz_questions WHERE lesson_id = ?').all(quiz.id);
    await request(server).post(`/api/custom-lessons/${quiz.id}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: Object.fromEntries(qs.map(q => [q.id, q.correct_idx])) });
    for (const l of lessons) {
      await request(server).post(`/api/custom-lessons/${l.id}/complete`).set('Authorization', `Bearer ${testerToken}`);
    }
    await request(server).post(`/api/tester/favorites`).set('Authorization', `Bearer ${testerToken}`)
      .send({ course_type: 'custom', course_id: courseId });

    hardDeleteCourse(courseId);

    const lessonIds = lessons.map(l => l.id);
    const placeholders = lessonIds.map(() => '?').join(',');
    expect(db.prepare(`SELECT COUNT(*) c FROM custom_quiz_results WHERE lesson_id IN (${placeholders})`).all(...lessonIds)[0].c).toBe(0);
    expect(db.prepare(`SELECT COUNT(*) c FROM custom_lesson_progress WHERE lesson_id IN (${placeholders})`).all(...lessonIds)[0].c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) c FROM custom_modules WHERE course_id = ?').get(courseId).c).toBe(0);
    // Favourites reference a course with no foreign key, so they do not fail
    // the transaction — they just go on pointing at nothing and render a card
    // in the profile for a course that no longer exists.
    expect(db.prepare("SELECT COUNT(*) c FROM user_favorite_courses WHERE course_type = 'custom' AND course_id = ?").get(courseId).c).toBe(0);
  });
});

describe('a course with prerequisites across modules', () => {
  it('purges even though module two points at module one', async () => {
    // This is the shape seedFrontendCourses builds (a module's opening lesson
    // chained to the previous module's test), and so do
    // backfillSequentialPrerequisites and the onboarding course. Lessons are
    // deleted module by module, and prerequisite_lesson_id is a self-referencing
    // key with no ON DELETE: module two's lessons hold module one's down, and
    // deleting the first one fails.
    const res = await request(server).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`)
      .send({
        title: 'С пререквизитами', is_published: 1,
        modules: [
          { title: 'Модуль 1', lessons: [{ title: '1.1', type: 'lesson', content: 'т', prerequisite_type: 'none' }] },
          { title: 'Модуль 2', lessons: [{ title: '2.1', type: 'lesson', content: 'т', prerequisite_type: 'none' }] },
        ],
      });
    const courseId = res.body.id;
    const lessons = db.prepare(`
      SELECT l.id FROM custom_lessons l JOIN custom_modules m ON m.id = l.module_id
      WHERE m.course_id = ? ORDER BY m.order_num, l.order_num
    `).all(courseId);
    expect(lessons).toHaveLength(2);

    db.prepare("UPDATE custom_lessons SET prerequisite_type = 'mandatory', prerequisite_lesson_id = ? WHERE id = ?")
      .run(lessons[0].id, lessons[1].id);

    expect(() => hardDeleteCourse(courseId)).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) c FROM custom_courses WHERE id = ?').get(courseId).c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) c FROM custom_lessons WHERE id IN (?, ?)').get(lessons[0].id, lessons[1].id).c).toBe(0);
  });
});
