import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let fixtures, testerToken, leadToken, courseId;

beforeAll(async () => {
  fixtures = seedTestData(db);
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');

  const create = await request(app)
    .post('/api/custom-courses')
    .set('Authorization', `Bearer ${leadToken}`)
    .send({ title: 'Deadline Course', is_published: 1, deadline_at: '2030-06-01', modules: [{ title: 'M1', lessons: [{ title: 'L1', type: 'lesson' }] }] });
  courseId = create.body.id;
});

describe('course deadlines — default', () => {
  it('a course carries its default deadline through to effectiveDeadline when no override exists', async () => {
    const res = await request(app).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.effectiveDeadline).toBe('2030-06-01');
  });

  it('the course list also carries effectiveDeadline', async () => {
    const res = await request(app).get('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`);
    const course = res.body.find(c => c.id === courseId);
    expect(course.effectiveDeadline).toBe('2030-06-01');
  });

  it('PUT can change the default deadline', async () => {
    const put = await request(app)
      .put(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ deadline_at: '2030-07-01' });
    expect(put.status).toBe(200);

    const res = await request(app).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.body.effectiveDeadline).toBe('2030-07-01');
  });
});

describe('course deadlines — per-user override', () => {
  it('an override takes precedence over the course default for that user only', async () => {
    const override = await request(app)
      .post(`/api/custom-courses/${courseId}/deadline-override`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ user_id: fixtures.testerId, deadline_at: '2030-12-25', reason: 'vacation' });
    expect(override.status).toBe(200);

    const asTester = await request(app).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${testerToken}`);
    expect(asTester.body.effectiveDeadline).toBe('2030-12-25');

    // The lead's own effective deadline (no override for the lead) is
    // untouched — this needs the lead to have permission over their own view.
    const asLead = await request(app).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${leadToken}`);
    expect(asLead.body.effectiveDeadline).toBe('2030-07-01');
  });

  it('the lead view lists all deadlineOverrides for the course', async () => {
    const res = await request(app).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${leadToken}`);
    const entry = res.body.deadlineOverrides.find(o => o.user_id === fixtures.testerId);
    expect(entry).toBeTruthy();
    expect(entry.deadline_at).toBe('2030-12-25');
    expect(entry.name).toBe('Test Tester');
  });

  it('setting an override twice upserts rather than duplicating', async () => {
    await request(app)
      .post(`/api/custom-courses/${courseId}/deadline-override`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ user_id: fixtures.testerId, deadline_at: '2031-01-01' });

    const res = await request(app).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${leadToken}`);
    const overrides = res.body.deadlineOverrides.filter(o => o.user_id === fixtures.testerId);
    expect(overrides.length).toBe(1);
    expect(overrides[0].deadline_at).toBe('2031-01-01');
  });

  it('removing an override reverts that user to the course default', async () => {
    const del = await request(app)
      .delete(`/api/custom-courses/${courseId}/deadline-override/${fixtures.testerId}`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(del.status).toBe(200);

    const res = await request(app).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.body.effectiveDeadline).toBe('2030-07-01');
  });

  it('a tester without manage_courses cannot set an override', async () => {
    const res = await request(app)
      .post(`/api/custom-courses/${courseId}/deadline-override`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ user_id: fixtures.testerId, deadline_at: '2030-01-01' });
    expect(res.status).toBe(403);
  });
});
