import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, testerToken, leadToken, otherTesterId, otherTesterToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');

  const reg = await request(server).post('/api/auth/register').send({
    email: 'otherprofile@test.local', password: 'password123', name: 'Other Profile',
  });
  otherTesterId = reg.body.user.id;
  otherTesterToken = reg.body.token;
});

describe('GET /api/users/:id/profile', () => {
  it('a public profile (default) shows the full read-only view to anyone', async () => {
    const res = await request(server).get(`/api/users/${otherTesterId}/profile`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Other Profile');
    expect(res.body).toHaveProperty('stats');
    expect(res.body).toHaveProperty('cards');
    expect(res.body.is_public).not.toBe(false);
  });

  it('a private profile only shows avatar/name + is_public:false to a stranger', async () => {
    await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${otherTesterToken}`).send({ is_public: false }).expect(200);

    const res = await request(server).get(`/api/users/${otherTesterId}/profile`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.is_public).toBe(false);
    expect(res.body.name).toBe('Other Profile');
    expect(res.body).not.toHaveProperty('stats');
    expect(res.body).not.toHaveProperty('cards');
  });

  it('the owner can always see their own profile in full, even when private', async () => {
    const res = await request(server).get(`/api/users/${otherTesterId}/profile`).set('Authorization', `Bearer ${otherTesterToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stats');
  });

  it('a lead can always see the full profile, even when private', async () => {
    const res = await request(server).get(`/api/users/${otherTesterId}/profile`).set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('stats');
  });

  it('never exposes activity_log history, public or private', async () => {
    const res = await request(server).get(`/api/users/${otherTesterId}/profile`).set('Authorization', `Bearer ${leadToken}`);
    expect(res.body).not.toHaveProperty('activity');
    expect(res.body).not.toHaveProperty('activity_log');
  });

  it('includes presence/working-hours fields when visible', async () => {
    await request(server)
      .patch('/api/me/presence')
      .set('Authorization', `Bearer ${otherTesterToken}`)
      .send({ work_start: '09:00', work_end: '18:00', timezone: 'Europe/Moscow' });
    await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${otherTesterToken}`).send({ is_public: true }).expect(200);

    const res = await request(server).get(`/api/users/${otherTesterId}/profile`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.body.workStart).toBe('09:00');
    expect(res.body.workEnd).toBe('18:00');
  });

  it('404s for a nonexistent or archived user', async () => {
    const missing = await request(server).get('/api/users/999999/profile').set('Authorization', `Bearer ${testerToken}`);
    expect(missing.status).toBe(404);

    await request(server).post(`/api/admin/users/${otherTesterId}/archive`).set('Authorization', `Bearer ${leadToken}`).expect(200);
    const archived = await request(server).get(`/api/users/${otherTesterId}/profile`).set('Authorization', `Bearer ${testerToken}`);
    expect(archived.status).toBe(404);
  });
});
