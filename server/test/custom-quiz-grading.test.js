// Grading a custom course's quiz, on the server.
//
// It used to happen in the browser and never leave it: /complete accepted a
// quiz lesson with no answers attached, the score lived in React state, and
// the completion coins, the pass/fail screen and the lead's dashboard all
// rested on a number nobody had checked.
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
const { COIN_REWARDS } = await import('../src/routeHelpers.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, leadToken, testerToken;

const coinsOf = userId =>
  db.prepare('SELECT bug_coins FROM user_profiles WHERE user_id = ?').get(userId)?.bug_coins || 0;

// Two questions, correct answers at index 0 and index 2.
async function makeQuizCourse(title = 'Курс с тестом') {
  const res = await request(server).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`)
    .send({
      title,
      is_published: 1,
      modules: [{
        title: 'Модуль',
        lessons: [{
          title: 'Тест', type: 'quiz', content: '', prerequisite_type: 'none',
          questions: [
            { question_text: 'Вопрос 1', option_a: 'верно', option_b: 'нет', option_c: 'нет', option_d: 'нет', correct_idx: 0, explanation: 'потому что' },
            { question_text: 'Вопрос 2', option_a: 'нет', option_b: 'нет', option_c: 'верно', option_d: 'нет', correct_idx: 2, explanation: 'вот так' },
          ],
        }],
      }],
    });
  expect(res.status).toBe(200);
  const lesson = db.prepare(`
    SELECT l.id FROM custom_lessons l JOIN custom_modules m ON m.id = l.module_id WHERE m.course_id = ?
  `).get(res.body.id);
  const questions = db.prepare('SELECT id, correct_idx FROM custom_quiz_questions WHERE lesson_id = ? ORDER BY order_num')
    .all(lesson.id);
  return { courseId: res.body.id, lessonId: lesson.id, questions };
}

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

describe('the answer key never reaches the person taking the test', () => {
  it('strips correct_idx and explanation from a tester\'s copy of the course', async () => {
    const { courseId } = await makeQuizCourse('Без ключа');
    const res = await request(server).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);

    const questions = res.body.modules[0].lessons[0].questions;
    expect(questions.length).toBe(2);
    for (const q of questions) {
      expect(q.question_text).toBeTruthy();   // still takeable
      expect(q.option_a).toBeTruthy();
      expect(q).not.toHaveProperty('correct_idx');
      expect(q).not.toHaveProperty('explanation');
    }
  });

  it('keeps them for someone who can edit the course — otherwise the builder could not show them', async () => {
    const { courseId } = await makeQuizCourse('С ключом для автора');
    const res = await request(server).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${leadToken}`);
    const q = res.body.modules[0].lessons[0].questions[0];
    expect(q).toHaveProperty('correct_idx');
    expect(q).toHaveProperty('explanation');
  });

  it('reveals one question at a time, only when asked', async () => {
    const { lessonId, questions } = await makeQuizCourse('Подсказка');
    const res = await request(server)
      .get(`/api/custom-lessons/${lessonId}/question/${questions[0].id}/explanation`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.correct_idx).toBe(0);
    expect(res.body.correctOption).toBe('верно');
    expect(res.body.explanation).toBe('потому что');
  });

  it('404s for a question that belongs to another lesson', async () => {
    const a = await makeQuizCourse('Курс A');
    const b = await makeQuizCourse('Курс B');
    const res = await request(server)
      .get(`/api/custom-lessons/${a.lessonId}/question/${b.questions[0].id}/explanation`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(404);
  });
});

describe('the server grades the attempt', () => {
  it('scores from its own answers and stores the result', async () => {
    const { lessonId, questions } = await makeQuizCourse('Оценка');
    const res = await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [questions[0].id]: 0, [questions[1].id]: 1 } }); // one right, one wrong

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(50);
    expect(res.body.correct).toBe(1);
    expect(res.body.total).toBe(2);
    expect(res.body.breakdown.map(b => b.isCorrect)).toEqual([true, false]);
    // The breakdown is where the client gets its recap, so it carries what
    // the payload no longer does.
    expect(res.body.breakdown[1].correct_idx).toBe(2);
    expect(res.body.breakdown[1].explanation).toBe('вот так');

    const stored = db.prepare('SELECT * FROM custom_quiz_results WHERE user_id = ? AND lesson_id = ?')
      .get(fixtures.testerId, lessonId);
    expect(stored.score).toBe(50);
  });

  it('grades by question id, so an unanswered question is simply wrong', async () => {
    const { lessonId, questions } = await makeQuizCourse('Пропуск');
    const res = await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [questions[0].id]: 0 } });
    expect(res.body.score).toBe(50);
    expect(res.body.breakdown[1].chosen).toBeNull();
  });

  it('keeps the best attempt and counts every one of them', async () => {
    const { lessonId, questions } = await makeQuizCourse('Пересдача');
    const all = { [questions[0].id]: 0, [questions[1].id]: 2 };

    await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: all });                                            // 100%
    const worse = await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [questions[0].id]: 1 } });                       // 0%

    expect(worse.body.score).toBe(0);       // this attempt
    expect(worse.body.best.score).toBe(100); // ...but the record stands
    expect(worse.body.best.attempts).toBe(2);
  });

  it('rejects a submission with no answers object rather than recording a zero', async () => {
    const { lessonId } = await makeQuizCourse('Пустая отправка');
    const res = await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`)
      .set('Authorization', `Bearer ${testerToken}`).send({});
    expect(res.status).toBe(400);
  });
});

describe('a quiz lesson is finished by answering it', () => {
  it('refuses to mark a quiz complete before it has been attempted', async () => {
    const { lessonId } = await makeQuizCourse('Без попытки');
    const res = await request(server).post(`/api/custom-lessons/${lessonId}/complete`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/тест/i);
    expect(db.prepare('SELECT 1 FROM custom_lesson_progress WHERE user_id = ? AND lesson_id = ?')
      .get(fixtures.testerId, lessonId)).toBeUndefined();
  });

  it('refuses to call a failed test finished, and says what the pass mark is', async () => {
    // Attempting used to be enough, so a failed test still counted towards
    // the course being finished and towards its coins.
    const { lessonId, questions } = await makeQuizCourse('Провал не засчитан');
    await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [questions[0].id]: 1, [questions[1].id]: 1 } });  // 0%

    const res = await request(server).post(`/api/custom-lessons/${lessonId}/complete`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/60%/);
    expect(db.prepare('SELECT 1 FROM custom_lesson_progress WHERE user_id = ? AND lesson_id = ?')
      .get(fixtures.testerId, lessonId)).toBeUndefined();
  });

  it('accepts it once the retake passes, since the best attempt is what is kept', async () => {
    const { lessonId, questions } = await makeQuizCourse('Пересдал');
    await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [questions[0].id]: 1, [questions[1].id]: 1 } });  // 0%
    await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [questions[0].id]: questions[0].correct_idx, [questions[1].id]: questions[1].correct_idx } });

    const res = await request(server).post(`/api/custom-lessons/${lessonId}/complete`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
  });

  it('leaves a reading-only lesson alone — nothing to attempt there', async () => {
    const created = await request(server).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Только текст', is_published: 1, modules: [{ title: 'M', lessons: [{ title: 'Урок', type: 'lesson', content: 'x', prerequisite_type: 'none' }] }] });
    const lesson = db.prepare('SELECT l.id FROM custom_lessons l JOIN custom_modules m ON m.id = l.module_id WHERE m.course_id = ?').get(created.body.id);
    const res = await request(server).post(`/api/custom-lessons/${lesson.id}/complete`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
  });
});

describe('the course result comes from the stored attempts', () => {
  it('averages them and decides pass/fail on the server', async () => {
    const { courseId, lessonId, questions } = await makeQuizCourse('Итог');
    await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [questions[0].id]: 0, [questions[1].id]: 2 } });

    const res = await request(server).get(`/api/custom-courses/${courseId}/my-result`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.body).toMatchObject({ score: 100, passed: true, gradedCount: 1, quizCount: 1 });
    expect(res.body.weakModules).toEqual([]);
  });

  it('names the modules to revisit when the attempt was failed', async () => {
    const { courseId, lessonId, questions } = await makeQuizCourse('Слабый модуль');
    await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [questions[0].id]: 1, [questions[1].id]: 1 } });

    const res = await request(server).get(`/api/custom-courses/${courseId}/my-result`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.body.score).toBe(0);
    expect(res.body.passed).toBe(false);
    expect(res.body.weakModules).toEqual(['Модуль']);
  });

  it('passes a course with nothing gradable rather than inventing a percentage', async () => {
    const created = await request(server).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Нечего оценивать', is_published: 1, modules: [{ title: 'M', lessons: [{ title: 'Урок', type: 'lesson', content: 'x', prerequisite_type: 'none' }] }] });
    const res = await request(server).get(`/api/custom-courses/${created.body.id}/my-result`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.body.score).toBeNull();
    expect(res.body.passed).toBe(true);
  });
});

describe('coins follow the real result', () => {
  it('pays nothing for a course finished by failing it', async () => {
    const { courseId, lessonId, questions } = await makeQuizCourse('Провален');
    await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [questions[0].id]: 1, [questions[1].id]: 1 } });
    await request(server).post(`/api/custom-lessons/${lessonId}/complete`).set('Authorization', `Bearer ${testerToken}`);

    const before = coinsOf(fixtures.testerId);
    await request(server).post('/api/courses/time-track').set('Authorization', `Bearer ${testerToken}`)
      .send({ course_id: courseId, seconds_spent: 60 });
    expect(coinsOf(fixtures.testerId)).toBe(before);
  });

  it('pays once for a course actually passed', async () => {
    const { courseId, lessonId, questions } = await makeQuizCourse('Сдан');
    await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [questions[0].id]: 0, [questions[1].id]: 2 } });
    await request(server).post(`/api/custom-lessons/${lessonId}/complete`).set('Authorization', `Bearer ${testerToken}`);

    const before = coinsOf(fixtures.testerId);
    await request(server).post('/api/courses/time-track').set('Authorization', `Bearer ${testerToken}`)
      .send({ course_id: courseId, seconds_spent: 60 });
    expect(coinsOf(fixtures.testerId)).toBe(before + COIN_REWARDS.courseCompleted);

    await request(server).post('/api/courses/time-track').set('Authorization', `Bearer ${testerToken}`)
      .send({ course_id: courseId, seconds_spent: 120 });
    expect(coinsOf(fixtures.testerId)).toBe(before + COIN_REWARDS.courseCompleted);
  });

  // The whole point of the change: a POST claiming the lesson is done is no
  // longer enough to reach the reward.
  it('cannot be farmed by claiming completion without answering', async () => {
    const { courseId, lessonId } = await makeQuizCourse('Попытка фарма');
    const before = coinsOf(fixtures.testerId);

    const claim = await request(server).post(`/api/custom-lessons/${lessonId}/complete`).set('Authorization', `Bearer ${testerToken}`);
    expect(claim.status).toBe(400);

    await request(server).post('/api/courses/time-track').set('Authorization', `Bearer ${testerToken}`)
      .send({ course_id: courseId, seconds_spent: 60 });
    expect(coinsOf(fixtures.testerId)).toBe(before);
  });
});

describe('the lead dashboard sees the track the team actually uses', () => {
  it('includes custom quiz scores in the team average', async () => {
    const { lessonId, questions } = await makeQuizCourse('В аналитику');
    await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [questions[0].id]: 0, [questions[1].id]: 2 } });

    const res = await request(server).get('/api/lead/team').set('Authorization', `Bearer ${leadToken}`);
    const me = res.body.find(m => m.id === fixtures.testerId);
    expect(me).toBeTruthy();
    // Before this change the average read test_results only, and a tester
    // who had only ever taken custom courses showed as 0.
    expect(me.avgScore).toBeGreaterThan(0);
  });
});

// The bug the tests above surfaced: 'course_completed' rows stashed a
// custom_courses id in activity_log.lecture_id, a column with a foreign key
// to lectures(id). It only worked while a lecture happened to share that
// number — on any database whose lectures table is empty, finishing a course
// raised a constraint error, time-track returned 500, and the coins were
// never awarded. Silently, because the client ignores that response.
describe('finishing a course does not depend on a lecture sharing its id', () => {
  it('records the completion and pays out for a course id no lecture has', async () => {
    const highest = db.prepare('SELECT MAX(id) m FROM lectures').get().m || 0;
    const { courseId, lessonId, questions } = await makeQuizCourse('Курс без парной лекции');
    expect(courseId).toBeGreaterThan(highest); // the case that used to break

    await request(server).post(`/api/custom-lessons/${lessonId}/submit-quiz`).set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [questions[0].id]: 0, [questions[1].id]: 2 } });
    await request(server).post(`/api/custom-lessons/${lessonId}/complete`).set('Authorization', `Bearer ${testerToken}`);

    const before = coinsOf(fixtures.testerId);
    const res = await request(server).post('/api/courses/time-track').set('Authorization', `Bearer ${testerToken}`)
      .send({ course_id: courseId, seconds_spent: 60 });

    expect(res.status).toBe(200);
    expect(coinsOf(fixtures.testerId)).toBe(before + COIN_REWARDS.courseCompleted);
    const row = db.prepare("SELECT * FROM activity_log WHERE user_id = ? AND action = 'course_completed' AND course_id = ?")
      .get(fixtures.testerId, courseId);
    expect(row).toBeTruthy();
    expect(row.lecture_id).toBeNull(); // its own column, not the lectures one
  });

  it('shows the course title in the lead\'s activity feed', async () => {
    const res = await request(server).get('/api/lead/activity').set('Authorization', `Bearer ${leadToken}`);
    const row = res.body.rows.find(r => r.action === 'course_completed' && r.course_title === 'Курс без парной лекции');
    expect(row).toBeTruthy();
    expect(row.lecture_title).toBeNull(); // and not a same-numbered lecture's
  });
});
