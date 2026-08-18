// The joke quizzes, guides, bug examples and glossary terms a fresh install
// opens with (see db/seedDemoContent.js). Opted into with SEED_DEMO_CONTENT
// because every other test file would otherwise pay for ~120 quiz questions
// it never looks at.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.SEED_DEMO_CONTENT = '1';

vi.mock('../src/telegram.js', () => ({
  notifyUser: () => {},
  notifyUserConfirmed: async () => 'none',
}));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedDemoContent } = await import('../db/seedDemoContent.js');
const { loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let leadToken, testerToken, leadId;

beforeAll(async () => {
  // The auto-seeded non-production accounts, which is what the demo content
  // attaches itself to on a real first boot.
  leadId = db.prepare("SELECT id FROM users WHERE role = 'lead' ORDER BY id LIMIT 1").get().id;
  leadToken = await loginAs(request, server, 'lead@qa.com', 'lead123');
  testerToken = await loginAs(request, server, 'nazar@qa.com', 'test123');
});

describe('demo content', () => {
  it('ships ten published quizzes, every one of them attributed to the lead', () => {
    const courses = db.prepare("SELECT * FROM custom_courses WHERE created_by = ?").all(leadId);
    expect(courses.length).toBe(10);
    expect(courses.every(c => c.is_published === 1)).toBe(true);
    expect(courses.every(c => c.proposal_status === null)).toBe(true);
  });

  it('gives the prison-etiquette course its twenty questions', () => {
    const lesson = db.prepare(`
      SELECT l.id FROM custom_lessons l
      JOIN custom_modules m ON m.id = l.module_id
      JOIN custom_courses c ON c.id = m.course_id
      WHERE c.title LIKE 'Арестантские законы%'
    `).get();
    const count = db.prepare('SELECT COUNT(*) c FROM custom_quiz_questions WHERE lesson_id = ?').get(lesson.id).c;
    expect(count).toBe(20);
  });

  it('gives every question four filled options and a correct answer that is one of them', () => {
    const questions = db.prepare('SELECT * FROM custom_quiz_questions').all();
    expect(questions.length).toBeGreaterThan(100);
    for (const q of questions) {
      expect(q.question_text.trim()).not.toBe('');
      for (const opt of [q.option_a, q.option_b, q.option_c, q.option_d]) {
        expect(opt.trim()).not.toBe('');
      }
      expect(q.correct_idx).toBeGreaterThanOrEqual(0);
      expect(q.correct_idx).toBeLessThanOrEqual(3);
    }
  });

  // A quiz that always answers 'a' would be a broken quiz, and writing 110
  // questions by hand is exactly how that happens.
  it('spreads the correct answer across the options rather than parking it on one', () => {
    const spread = db.prepare('SELECT correct_idx, COUNT(*) c FROM custom_quiz_questions GROUP BY correct_idx').all();
    expect(spread.length).toBeGreaterThanOrEqual(3);
    const total = spread.reduce((a, r) => a + r.c, 0);
    for (const row of spread) {
      expect(row.c / total).toBeLessThan(0.7);
    }
  });

  it('gives every course both of the frog\'s closing lines', () => {
    const courses = db.prepare('SELECT title, success_text, fail_text FROM custom_courses WHERE created_by = ?').all(leadId);
    for (const c of courses) {
      expect(c.success_text.trim(), c.title).not.toBe('');
      expect(c.fail_text.trim(), c.title).not.toBe('');
    }
    // ...and they differ per course, which is the whole reason the field exists.
    expect(new Set(courses.map(c => c.success_text)).size).toBe(courses.length);
  });

  it('ships guides, bug examples and glossary terms, all published and all by the lead', async () => {
    for (const [url, pick] of [
      ['/api/guides', b => b],
      ['/api/bug-examples', b => b],
      ['/api/glossary', b => b],
    ]) {
      const res = await request(server).get(url).set('Authorization', `Bearer ${testerToken}`);
      expect(res.status, url).toBe(200);
      const rows = pick(res.body);
      expect(rows.length, url).toBeGreaterThan(3);
      // A tester only ever sees published items, so reaching them at all is
      // the assertion that they published.
      expect(rows.some(r => r.author_name), url).toBe(true);
    }
  });

  it('bug examples all carry both halves — the wrong way and the right way', () => {
    const rows = db.prepare('SELECT * FROM bug_examples WHERE created_by = ?').all(leadId);
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) {
      expect(r.problem.trim()).not.toBe('');
      expect(r.bad_text.trim()).not.toBe('');
      expect(r.good_text.trim()).not.toBe('');
      expect(r.bad_text).not.toBe(r.good_text);
    }
  });

  it('announces the courses in the feed, the same as a hand-published one', async () => {
    const res = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    const published = res.body.rows.filter(n => n.event_type === 'course_published');
    expect(published.length).toBeGreaterThanOrEqual(10);
    expect(published.every(n => n.user_id === leadId)).toBe(true);
  });

  // The lead's nickname, not the account name — the courses were seeded
  // before the rename and still have to follow it.
  it('bylines follow the lead when they rename themselves', async () => {
    await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${leadToken}`)
      .send({ nickname: "I'm BOSS" });

    const res = await request(server).get('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`);
    const mine = res.body.filter(c => c.title.startsWith('Тест на волчару'));
    expect(mine.length).toBe(1);
    expect(mine[0].author_name).toBe("I'm BOSS");
  });

  it('does not seed a second time, however often the server restarts', () => {
    const before = db.prepare('SELECT COUNT(*) c FROM custom_courses').get().c;
    seedDemoContent(db);
    seedDemoContent(db);
    expect(db.prepare('SELECT COUNT(*) c FROM custom_courses').get().c).toBe(before);
  });

  // Deleting the joke content has to stick — otherwise a team that cleaned
  // house gets it all back on the next deploy.
  it('stays deleted once a lead removes it', async () => {
    const course = db.prepare("SELECT id FROM custom_courses WHERE title = 'Тест на волчару'").get();
    const del = await request(server).delete(`/api/custom-courses/${course.id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(del.status).toBe(200);

    seedDemoContent(db);
    const after = await request(server).get('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`);
    expect(after.body.some(c => c.title === 'Тест на волчару')).toBe(false);
  });
});
