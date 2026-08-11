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

describe('gender can also be set at registration time, not just via profile edit', () => {
  it('accepts a gender at signup and returns it immediately in the register response', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'genderatreg@test.local', password: 'password123', name: 'Gender At Reg', gender: 'female',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.gender).toBe('female');

    const login = await request(app).post('/api/auth/login').send({ email: 'genderatreg@test.local', password: 'password123' });
    expect(login.body.user.gender).toBe('female');
  });

  it('registering with no gender at all still works and defaults to null', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'nogenderatreg@test.local', password: 'password123', name: 'No Gender At Reg',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.gender).toBeNull();
  });

  it('rejects an invalid gender at registration', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'badgenderatreg@test.local', password: 'password123', name: 'Bad Gender At Reg', gender: 'robot',
    });
    expect(res.status).toBe(400);
  });
});

describe('birthday is collected once, at registration — not editable afterward (see presence.test.js for the lock itself)', () => {
  it('accepts a birthday (MM-DD) at signup and it shows up in /api/team/presence', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'birthdayatreg@test.local', password: 'password123', name: 'Birthday At Reg', birthday: '03-21',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.birthday).toBe('03-21');

    const token = await loginAs(request, app, 'birthdayatreg@test.local', 'password123');
    const presence = await request(app).get('/api/team/presence').set('Authorization', `Bearer ${token}`);
    const me = presence.body.find(p => p.id === res.body.user.id);
    expect(me.birthday).toBe('03-21');
  });

  it('registering with no birthday at all still works and defaults to null', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'nobirthdayatreg@test.local', password: 'password123', name: 'No Birthday At Reg',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.birthday).toBeNull();
  });

  it('rejects an invalid birthday format at registration', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'badbirthdayatreg@test.local', password: 'password123', name: 'Bad Birthday At Reg', birthday: '2024-08-15',
    });
    expect(res.status).toBe(400);
  });
});
