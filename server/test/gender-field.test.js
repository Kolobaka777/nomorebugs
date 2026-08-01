import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let fixtures, testerToken, leadToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
});

describe('optional gender field — used only to conjugate activity-feed text correctly', () => {
  it('defaults to null, is settable via PUT /api/tester/profile, and round-trips through GET /api/tester/profile-full', async () => {
    const before = await request(app).get('/api/tester/profile-full').set('Authorization', `Bearer ${testerToken}`);
    expect(before.body.gender).toBeNull();

    const save = await request(app)
      .put('/api/tester/profile')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ gender: 'female' });
    expect(save.status).toBe(200);

    const after = await request(app).get('/api/tester/profile-full').set('Authorization', `Bearer ${testerToken}`);
    expect(after.body.gender).toBe('female');
  });

  it('rejects an invalid value', async () => {
    const res = await request(app)
      .put('/api/tester/profile')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ gender: 'robot' });
    expect(res.status).toBe(400);
  });

  it('accepts null (explicitly clearing it back to "not specified")', async () => {
    await request(app).put('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`).send({ gender: 'male' }).expect(200);
    const cleared = await request(app).put('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`).send({ gender: null }).expect(200);
    expect(cleared.status).toBe(200);
    const check = await request(app).get('/api/tester/profile-full').set('Authorization', `Bearer ${testerToken}`);
    expect(check.body.gender).toBeNull();
  });

  it('is included in the login response, so the client has it without an extra fetch', async () => {
    await request(app).put('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`).send({ gender: 'male' }).expect(200);
    const login = await request(app).post('/api/auth/login').send({ email: 'tester@test.local', password: 'testerpass123' });
    expect(login.body.user.gender).toBe('male');
  });

  it('is included per-member in /api/lead/team', async () => {
    await request(app).put('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`).send({ gender: 'male' }).expect(200);
    const res = await request(app).get('/api/lead/team').set('Authorization', `Bearer ${leadToken}`);
    const member = res.body.find(m => m.id === fixtures.testerId);
    expect(member.gender).toBe('male');
  });
});
