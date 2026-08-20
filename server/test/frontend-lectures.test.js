// The lead's three front-end lectures (see db/seedFrontendCourses.js).
// Opted into with SEED_LECTURES for the same reason the demo content is
// opted into with its own flag: no other test file should pay for forty quiz
// questions it never looks at.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.SEED_LECTURES = '1';

vi.mock('../src/telegram.js', () => ({
  notifyUser: () => {},
  notifyUserConfirmed: async () => 'none',
}));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedFrontendCourses } = await import('../db/seedFrontendCourses.js');
const { loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let leadId, testerToken;

const TITLES = [
  'Основы HTML для начинающих',
  'Основы CSS, адаптивная вёрстка и визуальные баги',
  'Введение в JavaScript для QA',
];

const coursesByTitle = () => {
  const rows = db.prepare(`SELECT * FROM custom_courses WHERE title IN (${TITLES.map(() => '?').join(',')})`).all(...TITLES);
  return new Map(rows.map(r => [r.title, r]));
};

const modulesOf = courseId =>
  db.prepare('SELECT * FROM custom_modules WHERE course_id = ? ORDER BY order_num').all(courseId);

const lessonsOf = moduleId =>
  db.prepare('SELECT * FROM custom_lessons WHERE module_id = ? ORDER BY order_num').all(moduleId);

beforeAll(async () => {
  leadId = db.prepare("SELECT id FROM users WHERE role = 'lead' ORDER BY id LIMIT 1").get().id;
  testerToken = await loginAs(request, server, 'nazar@qa.com', 'test123');
});

describe('front-end lectures', () => {
  it('ships all three, published, and every one of them written by the lead', () => {
    const found = coursesByTitle();
    expect([...found.keys()].sort()).toEqual([...TITLES].sort());
    for (const c of found.values()) {
      expect(c.is_published).toBe(1);
      expect(c.created_by).toBe(leadId);
      // Not a tester's suggestion awaiting review — a lead's own course.
      expect(c.proposal_status).toBe(null);
    }
  });

  it('tags each lecture with its own subject rather than a generic label', () => {
    const found = coursesByTitle();
    expect(found.get(TITLES[0]).tag).toBe('HTML');
    expect(found.get(TITLES[1]).tag).toBe('CSS');
    expect(found.get(TITLES[2]).tag).toBe('JS');
  });

  it('breaks each lecture into modules that each end in a test', () => {
    for (const course of coursesByTitle().values()) {
      const modules = modulesOf(course.id);
      expect(modules.length).toBeGreaterThanOrEqual(2);
      for (const m of modules) {
        const lessons = lessonsOf(m.id);
        expect(lessons.length).toBeGreaterThanOrEqual(2);
        // The test is the last thing in its module, and it is the only
        // quiz in it — an intermediate test, not a detour mid-module.
        expect(lessons[lessons.length - 1].type).toBe('quiz');
        expect(lessons.filter(l => l.type === 'quiz').length).toBe(1);
      }
    }
  });

  it('gives every question four options, a real answer index and an explanation', () => {
    const questions = db.prepare(`
      SELECT q.* FROM custom_quiz_questions q
      JOIN custom_lessons l ON l.id = q.lesson_id
      JOIN custom_modules m ON m.id = l.module_id
      JOIN custom_courses c ON c.id = m.course_id
      WHERE c.title IN (${TITLES.map(() => '?').join(',')})
    `).all(...TITLES);

    expect(questions.length).toBeGreaterThanOrEqual(30);
    for (const q of questions) {
      for (const opt of [q.option_a, q.option_b, q.option_c, q.option_d]) {
        expect(opt.trim()).not.toBe('');
      }
      expect(q.correct_idx).toBeGreaterThanOrEqual(0);
      expect(q.correct_idx).toBeLessThanOrEqual(3);
      // An answer key with no reasoning behind it teaches nothing on a
      // wrong answer, which is the only time anybody reads it.
      expect(q.explanation.trim()).not.toBe('');
    }
  });

  it('locks each module behind the previous module\'s test, and leaves the first one open', () => {
    for (const course of coursesByTitle().values()) {
      const modules = modulesOf(course.id);

      const firstLesson = lessonsOf(modules[0].id)[0];
      expect(firstLesson.prerequisite_type).toBe('none');

      for (let i = 1; i < modules.length; i++) {
        const opener = lessonsOf(modules[i].id)[0];
        expect(opener.prerequisite_type).toBe('mandatory');

        const previous = lessonsOf(modules[i - 1].id);
        expect(opener.prerequisite_lesson_id).toBe(previous[previous.length - 1].id);
      }
    }
  });

  it('writes every lesson body, so no lecture opens on an empty page', () => {
    const lessons = db.prepare(`
      SELECT l.* FROM custom_lessons l
      JOIN custom_modules m ON m.id = l.module_id
      JOIN custom_courses c ON c.id = m.course_id
      WHERE c.title IN (${TITLES.map(() => '?').join(',')}) AND l.type = 'lesson'
    `).all(...TITLES);

    expect(lessons.length).toBeGreaterThanOrEqual(12);
    for (const l of lessons) expect(l.content.trim().length).toBeGreaterThan(200);
  });

  it('closes every code fence it opens', () => {
    // Lesson bodies are written in the markdown-ish convention the reader's
    // side upgrades on read. An unclosed fence there is not a typo the
    // reader forgives — the code comes out as prose with ``` in the middle
    // of it. Counting is enough to catch that without restating the parser.
    const lessons = db.prepare(`
      SELECT l.title, l.content FROM custom_lessons l
      JOIN custom_modules m ON m.id = l.module_id
      JOIN custom_courses c ON c.id = m.course_id
      WHERE c.title IN (${TITLES.map(() => '?').join(',')}) AND l.type = 'lesson'
    `).all(...TITLES);

    for (const l of lessons) {
      const fences = (l.content.match(/^```/gm) || []).length;
      expect(fences % 2, `unclosed code fence in "${l.title}"`).toBe(0);
    }
  });

  it('shows a tester the lectures in the catalog', async () => {
    const res = await request(server).get('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    const titles = res.body.map(c => c.title);
    for (const t of TITLES) expect(titles).toContain(t);
  });

  it('does not hand the answer key to the browser with the lesson', async () => {
    const course = coursesByTitle().get(TITLES[0]);
    const res = await request(server).get(`/api/custom-courses/${course.id}`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    const questions = res.body.modules.flatMap(m => m.lessons).flatMap(l => l.questions || []);
    expect(questions.length).toBeGreaterThan(0);
    for (const q of questions) {
      expect(q.correct_idx).toBeUndefined();
      expect(q.explanation).toBeUndefined();
    }
  });

  it('inserts once, so a lead deleting a lecture does not get it back on the next boot', () => {
    const before = db.prepare('SELECT COUNT(*) AS c FROM custom_courses').get().c;
    seedFrontendCourses(db);
    seedFrontendCourses(db);
    expect(db.prepare('SELECT COUNT(*) AS c FROM custom_courses').get().c).toBe(before);
  });
});
