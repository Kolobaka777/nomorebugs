import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let leadToken;

beforeAll(async () => {
  seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
});

// Production-readiness audit: a course/lesson/quiz used to be publishable
// with no real content (zero modules, an empty module, a quiz with zero
// questions) — a tester reaching it hit a permanent dead end with no way to
// complete it or move past it. Publishing now validates the structure.
describe('publishing a course requires real content', () => {
  it('POST rejects publishing with zero modules', async () => {
    const res = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Empty Course', is_published: true, modules: [] });
    expect(res.status).toBe(400);
  });

  it('POST rejects publishing with a module that has zero lessons', async () => {
    const res = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Empty Module Course', is_published: true, modules: [{ title: 'M1', lessons: [] }] });
    expect(res.status).toBe(400);
  });

  it('POST rejects publishing a quiz-type lesson with zero questions', async () => {
    const res = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({
        title: 'Empty Quiz Course', is_published: true,
        modules: [{ title: 'M1', lessons: [{ title: 'Quiz', type: 'quiz', questions: [] }] }],
      });
    expect(res.status).toBe(400);
  });

  it('POST allows saving the same broken structure as an unpublished draft', async () => {
    const res = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Draft Course', is_published: false, modules: [] });
    expect(res.status).toBe(200);
  });

  it('PATCH .../publish rejects turning on publish for a course with no real content', async () => {
    const create = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Draft Then Publish', is_published: false, modules: [{ title: 'M1', lessons: [] }] });
    const courseId = create.body.id;

    const publish = await request(server)
      .patch(`/api/custom-courses/${courseId}/publish`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(publish.status).toBe(400);

    expect(db.prepare('SELECT is_published FROM custom_courses WHERE id = ?').get(courseId).is_published).toBe(0);
  });

  it('POST/PATCH allow publishing once real content exists', async () => {
    const res = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({
        title: 'Real Course', is_published: true,
        modules: [{ title: 'M1', lessons: [
          { title: 'Intro', type: 'lesson', content: 'hi' },
          { title: 'Quiz', type: 'quiz', questions: [{ question_text: 'Q?', option_a: 'a', option_b: 'b', option_c: 'c', option_d: 'd', correct_idx: 0 }] },
        ] }],
      });
    expect(res.status).toBe(200);
  });
});
