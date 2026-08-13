// New-hire onboarding course: the is_onboarding flag on custom_courses
// (lead/admin-only). See onboarding-metrics.test.js for
// onboardingCourseCompleted/onboardingCourseId (kept in its own file/DB —
// those assertions depend on exactly which onboarding courses exist,
// which the flag tests below would otherwise pollute) and
// onboarding-skeleton-seed.test.js for the draft-skeleton seed.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let fixtures, leadToken, testerToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
});

function courseBody(overrides = {}) {
  return {
    title: 'Onboarding Test Course',
    is_published: true,
    modules: [{
      title: 'Module 1',
      lessons: [{ title: 'Lesson 1', type: 'lesson', content: 'x', prerequisite_type: 'none' }],
    }],
    ...overrides,
  };
}

describe('is_onboarding — lead/admin-only', () => {
  it('a lead can create a course flagged is_onboarding', async () => {
    const res = await request(app).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`).send(courseBody({ is_onboarding: true }));
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT is_onboarding FROM custom_courses WHERE id = ?').get(res.body.id);
    expect(row.is_onboarding).toBe(1);

    // Surfaced on the list route too.
    const list = await request(app).get('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`);
    expect(list.body.find(c => c.id === res.body.id).is_onboarding).toBe(1);
  });

  it('a proposing tester sending is_onboarding:true has it silently ignored', async () => {
    const res = await request(app).post('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`).send(courseBody({ is_onboarding: true }));
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT is_onboarding, proposal_status FROM custom_courses WHERE id = ?').get(res.body.id);
    expect(row.is_onboarding).toBe(0);
    expect(row.proposal_status).toBe('pending'); // still a normal proposal otherwise
  });

  it('a lead can toggle is_onboarding on an existing course via PUT', async () => {
    const created = await request(app).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`).send(courseBody({ title: 'Toggle me' }));
    const id = created.body.id;
    expect(db.prepare('SELECT is_onboarding FROM custom_courses WHERE id = ?').get(id).is_onboarding).toBe(0);

    await request(app).put(`/api/custom-courses/${id}`).set('Authorization', `Bearer ${leadToken}`).send({ is_onboarding: true });
    expect(db.prepare('SELECT is_onboarding FROM custom_courses WHERE id = ?').get(id).is_onboarding).toBe(1);

    await request(app).put(`/api/custom-courses/${id}`).set('Authorization', `Bearer ${leadToken}`).send({ is_onboarding: false });
    expect(db.prepare('SELECT is_onboarding FROM custom_courses WHERE id = ?').get(id).is_onboarding).toBe(0);
  });
});
