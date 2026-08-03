import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let leadToken, testerId, courseId, moduleId, lessonId;

beforeAll(async () => {
  const ids = seedTestData(db);
  testerId = ids.testerId;
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');

  const create = await request(app)
    .post('/api/custom-courses')
    .set('Authorization', `Bearer ${leadToken}`)
    .send({
      title: 'Race Course', is_published: false,
      modules: [{ title: 'M1', lessons: [{ title: 'L1', type: 'lesson', content: 'hi' }] }],
    });
  courseId = create.body.id;
  moduleId = db.prepare('SELECT id FROM custom_modules WHERE course_id = ?').get(courseId).id;
  lessonId = db.prepare('SELECT id FROM custom_lessons WHERE module_id = ?').get(moduleId).id;
});

// Production-readiness audit (deferred item resolved): two leads editing the
// same course from a stale module tree used to let the second save silently
// delete whatever the first save had added — including any tester progress
// already recorded against that lesson — with no error at all. PUT now
// requires the caller to echo back the course's updated_at it loaded and
// 409s instead of applying the diff if it's stale.
describe('course module-tree edits — optimistic locking', () => {
  it('a metadata-only save (no modules array) is not gated on expected_updated_at', async () => {
    const res = await request(app)
      .put(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Race Course (renamed)' });
    expect(res.status).toBe(200);
  });

  it('two "leads" loading the same course: first save (with modules) wins, second is rejected with 409 and the first lesson survives', async () => {
    const loaded = db.prepare('SELECT updated_at FROM custom_courses WHERE id = ?').get(courseId).updated_at;

    // Simulate a tester having already completed the original lesson.
    db.prepare('INSERT INTO custom_lesson_progress (user_id, lesson_id, completed_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
      .run(testerId, lessonId);

    const first = await request(app)
      .put(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({
        expected_updated_at: loaded,
        modules: [{ _id: String(moduleId), title: 'M1', lessons: [
          { _id: String(lessonId), title: 'L1', type: 'lesson', content: 'hi' },
          { _id: 'new-lesson', title: 'L2 (added by first save)', type: 'lesson', content: 'new' },
        ] }],
      });
    expect(first.status).toBe(200);

    // Second save was built against the same stale `loaded` stamp, and its
    // module tree has no idea L2 now exists — this is exactly the payload
    // that would otherwise silently delete L2 and the tester's progress on L1.
    const second = await request(app)
      .put(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({
        expected_updated_at: loaded,
        modules: [{ _id: String(moduleId), title: 'M1 (renamed by second, stale, save)', lessons: [
          { _id: String(lessonId), title: 'L1', type: 'lesson', content: 'hi' },
        ] }],
      });
    expect(second.status).toBe(409);

    // First save's new lesson and the tester's progress both survived.
    const lessons = db.prepare('SELECT title FROM custom_lessons WHERE module_id = ?').all(moduleId);
    expect(lessons.map(l => l.title)).toContain('L2 (added by first save)');
    expect(db.prepare('SELECT * FROM custom_lesson_progress WHERE user_id = ? AND lesson_id = ?').get(testerId, lessonId)).toBeTruthy();
    const module = db.prepare('SELECT title FROM custom_modules WHERE id = ?').get(moduleId);
    expect(module.title).toBe('M1');
  });

  it('omitting expected_updated_at entirely (e.g. an old client) still saves — the lock only engages when the field is sent', async () => {
    const res = await request(app)
      .put(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ modules: [{ _id: String(moduleId), title: 'M1', lessons: [{ _id: String(lessonId), title: 'L1', type: 'lesson', content: 'hi' }] }] });
    expect(res.status).toBe(200);
  });
});
