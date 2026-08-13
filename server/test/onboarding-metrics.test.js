// GET /api/tester/metrics' onboardingCourseCompleted/onboardingCourseId —
// kept in its own file/DB (not onboarding-course.test.js) because these
// assertions depend on exactly which onboarding courses exist so far;
// starting from a guaranteed-clean slate matters here.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let leadToken, testerToken;

beforeAll(async () => {
  seedTestData(db);
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
});

describe('GET /api/tester/metrics — onboardingCourseCompleted/onboardingCourseId', () => {
  it('is false/null when no onboarding course is published yet', async () => {
    const res = await request(app).get('/api/tester/metrics').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.onboardingCourseCompleted).toBe(false);
    expect(res.body.onboardingCourseId).toBeNull();
  });

  let courseId, lesson1Id, lesson2Id;
  it('is false, with the course id, once one is published but not finished', async () => {
    const created = await request(app).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`).send({
      title: 'Real Onboarding Course',
      is_published: true,
      is_onboarding: true,
      modules: [{
        title: 'Module 1',
        lessons: [
          { title: 'Lesson 1', type: 'lesson', content: 'x', prerequisite_type: 'none' },
          { title: 'Lesson 2', type: 'lesson', content: 'y', prerequisite_type: 'mandatory', prerequisite_lesson_local_id: undefined },
        ],
      }],
    });
    courseId = created.body.id;

    const course = await request(app).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${testerToken}`);
    [lesson1Id, lesson2Id] = course.body.modules[0].lessons.map(l => l.id);

    await request(app).post(`/api/custom-lessons/${lesson1Id}/complete`).set('Authorization', `Bearer ${testerToken}`);

    const res = await request(app).get('/api/tester/metrics').set('Authorization', `Bearer ${testerToken}`);
    expect(res.body.onboardingCourseCompleted).toBe(false);
    expect(res.body.onboardingCourseId).toBe(courseId);
  });

  it('flips true (and the id back to null) once every lesson is completed', async () => {
    await request(app).post(`/api/custom-lessons/${lesson2Id}/complete`).set('Authorization', `Bearer ${testerToken}`);
    const res = await request(app).get('/api/tester/metrics').set('Authorization', `Bearer ${testerToken}`);
    expect(res.body.onboardingCourseCompleted).toBe(true);
    expect(res.body.onboardingCourseId).toBeNull();
  });

  it('a second tester who never touched it still sees it as incomplete', async () => {
    await request(app).post('/api/auth/register').send({ email: 'fresh-onboarding-tester@test.local', password: 'freshpass123', name: 'Fresh Tester' });
    const freshToken = await loginAs(request, app, 'fresh-onboarding-tester@test.local', 'freshpass123');
    const res = await request(app).get('/api/tester/metrics').set('Authorization', `Bearer ${freshToken}`);
    expect(res.body.onboardingCourseCompleted).toBe(false);
    expect(res.body.onboardingCourseId).toBe(courseId);
  });

  it('does not count a draft (unpublished) onboarding course', async () => {
    await request(app).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`).send({
      title: 'Draft Onboarding', is_published: false, is_onboarding: true,
      modules: [{ title: 'M', lessons: [{ title: 'L', type: 'lesson', content: 'x', prerequisite_type: 'none' }] }],
    });
    // Still true for the first tester — the already-published onboarding
    // course they completed is unaffected by a second, still-draft one.
    const res = await request(app).get('/api/tester/metrics').set('Authorization', `Bearer ${testerToken}`);
    expect(res.body.onboardingCourseCompleted).toBe(true);
  });
});
