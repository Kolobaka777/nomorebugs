// Three routes address a lesson by its id and nothing else. Each one loaded
// its lesson, 404'd when it was missing, and never asked which course the
// lesson belonged to — so a lesson id, which is a small integer anyone can
// count through, was enough to reach a course the caller could not open.
//
// The worst of the three was submit-quiz: it answers with `correct_idx` and
// the explanation for every question, so posting an empty answer set to a
// draft course returned its whole answer key. The stripping added to
// GET /api/custom-courses/:id was simply walked around.
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
let fixtures, leadToken, testerToken;
let draft, published;

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

async function makeCourse(title, publish) {
  const res = await auth(request(server).post('/api/custom-courses'), leadToken).send({
    title,
    modules: [{
      title: 'M',
      lessons: [
        { title: 'Текст', type: 'lesson', content: 'тело', prerequisite_type: 'none' },
        {
          title: 'Тест', type: 'quiz', content: '', prerequisite_type: 'none',
          questions: [{ text: 'Сколько?', options: ['一', 'два', 'три', 'четыре'], correct_idx: 1, explanation: 'потому что два' }],
        },
      ],
    }],
  });
  expect(res.status).toBe(200);
  if (publish) db.prepare('UPDATE custom_courses SET is_published = 1 WHERE id = ?').run(res.body.id);

  const lessons = db.prepare(`
    SELECT l.id, l.type FROM custom_lessons l
    JOIN custom_modules m ON m.id = l.module_id
    WHERE m.course_id = ? ORDER BY l.order_num
  `).all(res.body.id);
  const quizLesson = lessons.find(l => l.type === 'quiz');
  const questionId = db.prepare('SELECT id FROM custom_quiz_questions WHERE lesson_id = ?').get(quizLesson.id).id;
  return { courseId: res.body.id, textLessonId: lessons.find(l => l.type === 'lesson').id, quizLessonId: quizLesson.id, questionId };
}

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
  draft = await makeCourse('Черновик лида', false);
  published = await makeCourse('Опубликованный курс', true);
});

describe('a draft course is out of reach for a tester', () => {
  it('will not hand over the answer key through the grader', async () => {
    const res = await auth(request(server).post(`/api/custom-lessons/${draft.quizLessonId}/submit-quiz`), testerToken)
      .send({ answers: {} });
    expect(res.status).toBe(404);
    // Not just "not 200" — nothing about the questions may come back.
    expect(JSON.stringify(res.body)).not.toContain('correct_idx');
    expect(JSON.stringify(res.body)).not.toContain('потому что два');
  });

  it('will not reveal a single question either', async () => {
    const res = await auth(
      request(server).get(`/api/custom-lessons/${draft.quizLessonId}/question/${draft.questionId}/explanation`),
      testerToken,
    );
    expect(res.status).toBe(404);
    expect(res.body.correct_idx).toBeUndefined();
  });

  it('will not let progress be accrued on it', async () => {
    const res = await auth(request(server).post(`/api/custom-lessons/${draft.textLessonId}/complete`), testerToken);
    expect(res.status).toBe(404);
    const progress = db.prepare('SELECT 1 FROM custom_lesson_progress WHERE user_id = ? AND lesson_id = ?')
      .get(fixtures.testerId, draft.textLessonId);
    expect(progress).toBeUndefined();
  });

  it('will not accept time tracked against it', async () => {
    const res = await auth(request(server).post('/api/courses/time-track'), testerToken)
      .send({ course_id: draft.courseId, seconds_spent: 60 });
    expect(res.status).toBe(404);
  });

  // 404, not 403: whether a draft exists at all is not the caller's
  // business, and 403 answers that question.
  it('says "not found" rather than "not allowed"', async () => {
    const res = await auth(request(server).post(`/api/custom-lessons/${draft.textLessonId}/complete`), testerToken);
    expect(res.status).toBe(404);
    expect(res.body.error).not.toMatch(/доступ/i);
  });
});

describe('the author still has full access to their own draft', () => {
  it('grades it, reveals it and completes it', async () => {
    const graded = await auth(request(server).post(`/api/custom-lessons/${draft.quizLessonId}/submit-quiz`), leadToken)
      .send({ answers: { [draft.questionId]: 1 } });
    expect(graded.status).toBe(200);
    expect(graded.body.score).toBe(100);

    const reveal = await auth(
      request(server).get(`/api/custom-lessons/${draft.quizLessonId}/question/${draft.questionId}/explanation`),
      leadToken,
    );
    expect(reveal.status).toBe(200);
    expect(reveal.body.correct_idx).toBe(1);

    const done = await auth(request(server).post(`/api/custom-lessons/${draft.textLessonId}/complete`), leadToken);
    expect(done.status).toBe(200);
  });
});

describe('a published course is unaffected', () => {
  it('grades a tester and records their progress', async () => {
    const graded = await auth(request(server).post(`/api/custom-lessons/${published.quizLessonId}/submit-quiz`), testerToken)
      .send({ answers: { [published.questionId]: 1 } });
    expect(graded.status).toBe(200);
    expect(graded.body.score).toBe(100);

    const done = await auth(request(server).post(`/api/custom-lessons/${published.textLessonId}/complete`), testerToken);
    expect(done.status).toBe(200);

    const tracked = await auth(request(server).post('/api/courses/time-track'), testerToken)
      .send({ course_id: published.courseId, seconds_spent: 60 });
    expect(tracked.status).toBe(200);
  });
});

describe('a note cannot be hung on a course the author cannot see', () => {
  it('refuses the note rather than leaking the draft through the notes list', async () => {
    const res = await auth(request(server).post('/api/tester/notes'), testerToken)
      .send({ course_id: draft.courseId, lesson_title: 'Тест', text: 'заметка' });
    expect(res.status).toBe(404);

    // The leak was indirect: the notes list heads each group with the
    // course's own title, tag and colour, so accepting the note is what
    // would have handed the draft over.
    const notes = await auth(request(server).get('/api/tester/notes'), testerToken);
    expect(JSON.stringify(notes.body)).not.toContain('Черновик лида');
  });

  it('still takes a note on a published course', async () => {
    const res = await auth(request(server).post('/api/tester/notes'), testerToken)
      .send({ course_id: published.courseId, lesson_title: 'Текст', text: 'нормальная заметка' });
    expect(res.status).toBe(200);
  });
});

describe('a deleted course closes the same way', () => {
  it('stops answering once it is in the trash', async () => {
    db.prepare('UPDATE custom_courses SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(published.courseId);
    const res = await auth(request(server).post(`/api/custom-lessons/${published.quizLessonId}/submit-quiz`), testerToken)
      .send({ answers: {} });
    expect(res.status).toBe(404);
    db.prepare('UPDATE custom_courses SET deleted_at = NULL WHERE id = ?').run(published.courseId);
  });
});
