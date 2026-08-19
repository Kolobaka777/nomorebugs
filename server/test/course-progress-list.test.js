// The catalog had no notion of how far anyone had got. A course finished
// last month looked exactly like one nobody had opened, and the status
// filter next to it only ever applied to the fixed lecture track.
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
let threeLessons, emptyCourse;

const asLead = req => req.set('Authorization', `Bearer ${leadToken}`);
const asTester = req => req.set('Authorization', `Bearer ${testerToken}`);

// One module per entry in `lessonsPerModule`, with that many lessons in it.
async function makeCourse(title, lessonsPerModule) {
  const counts = Array.isArray(lessonsPerModule) ? lessonsPerModule : [lessonsPerModule];
  const res = await asLead(request(server).post('/api/custom-courses')).send({
    title,
    modules: counts.map((lessonCount, mIdx) => ({
      title: `M${mIdx}`,
      lessons: Array.from({ length: lessonCount }, (_, i) => ({
        title: `L${mIdx}-${i}`, type: 'lesson', content: 'тело', prerequisite_type: 'none',
      })),
    })),
  });
  expect(res.status).toBe(200);
  db.prepare('UPDATE custom_courses SET is_published = 1 WHERE id = ?').run(res.body.id);
  const lessonIds = db.prepare(`
    SELECT l.id FROM custom_lessons l JOIN custom_modules m ON m.id = l.module_id
    WHERE m.course_id = ? ORDER BY l.order_num
  `).all(res.body.id).map(r => r.id);
  return { id: res.body.id, lessonIds };
}

const listFor = async token => {
  const res = await request(server).get('/api/custom-courses').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return Object.fromEntries(res.body.map(c => [c.id, c]));
};

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
  threeLessons = await makeCourse('Курс из трёх уроков', 3);
  emptyCourse = await makeCourse('Пустой курс', 0);
});

describe('progress in the course list', () => {
  it('counts modules as well as lessons, since that is what a card shows', async () => {
    // Three modules: two lessons, one lesson, one lesson.
    const c = await makeCourse('Курс из трёх модулей', [2, 1, 1]);
    let row = (await listFor(testerToken))[c.id];
    expect(row.modulesTotal).toBe(3);
    expect(row.modulesDone).toBe(0);
    expect(row.lessonsTotal).toBe(4);

    // Half of the first module is not a finished module.
    await asTester(request(server).post(`/api/custom-lessons/${c.lessonIds[0]}/complete`));
    row = (await listFor(testerToken))[c.id];
    expect(row.modulesDone).toBe(0);
    expect(row.lessonsDone).toBe(1);

    // Its second lesson closes it.
    await asTester(request(server).post(`/api/custom-lessons/${c.lessonIds[1]}/complete`));
    row = (await listFor(testerToken))[c.id];
    expect(row.modulesDone).toBe(1);
    expect(row.isCompleted).toBe(false);
  });

  it('leaves an empty module out of the count rather than counting it unfinished', async () => {
    // A heading with nothing under it is not a unit of work, and counting
    // it made the card argue with itself: every lesson done, so the call
    // to action read КУРС ПРОЙДЕН! above a full bar, over a label saying
    // "1/2 модулей".
    const c = await makeCourse('Курс с пустым модулем', [2, 0]);
    for (const id of c.lessonIds) {
      await asTester(request(server).post(`/api/custom-lessons/${id}/complete`));
    }
    const row = (await listFor(testerToken))[c.id];
    expect(row.modulesTotal).toBe(1);
    expect(row.modulesDone).toBe(1);
    expect(row.isCompleted).toBe(true);
  });

  it('has nothing to count in a course that is all empty modules', async () => {
    const c = await makeCourse('Один каркас', [0, 0]);
    const row = (await listFor(testerToken))[c.id];
    expect(row.modulesTotal).toBe(0);
    expect(row.modulesDone).toBe(0);
    // Nothing to finish is not finished — the card falls back to its
    // descriptive label rather than showing 0/0.
    expect(row.isCompleted).toBe(false);
  });

  it('starts at nothing done, out of a real total', async () => {
    const c = (await listFor(testerToken))[threeLessons.id];
    expect(c.lessonsTotal).toBe(3);
    expect(c.lessonsDone).toBe(0);
    expect(c.isCompleted).toBe(false);
  });

  it('counts lessons as they are finished', async () => {
    await asTester(request(server).post(`/api/custom-lessons/${threeLessons.lessonIds[0]}/complete`));
    let c = (await listFor(testerToken))[threeLessons.id];
    expect(c.lessonsDone).toBe(1);
    expect(c.isCompleted).toBe(false);

    await asTester(request(server).post(`/api/custom-lessons/${threeLessons.lessonIds[1]}/complete`));
    await asTester(request(server).post(`/api/custom-lessons/${threeLessons.lessonIds[2]}/complete`));
    c = (await listFor(testerToken))[threeLessons.id];
    expect(c.lessonsDone).toBe(3);
    expect(c.isCompleted).toBe(true);
  });

  it('is one person\'s own progress, not the team\'s', async () => {
    // The tester has just finished it; the lead has not touched it.
    const forLead = (await listFor(leadToken))[threeLessons.id];
    expect(forLead.lessonsDone).toBe(0);
    expect(forLead.isCompleted).toBe(false);
    expect(forLead.lessonsTotal).toBe(3);
  });

  it('does not call an empty course finished', async () => {
    // Nothing done out of nothing is not an achievement — a shell someone
    // created and never filled would otherwise show as passed for everyone.
    const c = (await listFor(testerToken))[emptyCourse.id];
    expect(c.lessonsTotal).toBe(0);
    expect(c.isCompleted).toBe(false);
  });

  it('reports it for every course in one response, not one query per card', async () => {
    const list = await listFor(testerToken);
    for (const course of Object.values(list)) {
      expect(course).toHaveProperty('lessonsTotal');
      expect(course).toHaveProperty('lessonsDone');
      expect(course).toHaveProperty('isCompleted');
    }
  });
});
