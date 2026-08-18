import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, testerToken, leadToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
});

describe('optional gender field — used only to conjugate activity-feed text correctly', () => {
  it('defaults to null, is settable via PUT /api/tester/profile, and round-trips through GET /api/tester/profile-full', async () => {
    const before = await request(server).get('/api/tester/profile-full').set('Authorization', `Bearer ${testerToken}`);
    expect(before.body.gender).toBeNull();

    const save = await request(server)
      .put('/api/tester/profile')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ gender: 'female' });
    expect(save.status).toBe(200);

    const after = await request(server).get('/api/tester/profile-full').set('Authorization', `Bearer ${testerToken}`);
    expect(after.body.gender).toBe('female');
  });

  it('rejects an invalid value', async () => {
    const res = await request(server)
      .put('/api/tester/profile')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ gender: 'robot' });
    expect(res.status).toBe(400);
  });

  it('accepts null (explicitly clearing it back to "not specified")', async () => {
    await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`).send({ gender: 'male' }).expect(200);
    const cleared = await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`).send({ gender: null }).expect(200);
    expect(cleared.status).toBe(200);
    const check = await request(server).get('/api/tester/profile-full').set('Authorization', `Bearer ${testerToken}`);
    expect(check.body.gender).toBeNull();
  });

  it('is included in the login response, so the client has it without an extra fetch', async () => {
    await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`).send({ gender: 'male' }).expect(200);
    const login = await request(server).post('/api/auth/login').send({ email: 'tester@test.local', password: 'testerpass123' });
    expect(login.body.user.gender).toBe('male');
  });

  it('is included per-member in /api/lead/team', async () => {
    await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`).send({ gender: 'male' }).expect(200);
    const res = await request(server).get('/api/lead/team').set('Authorization', `Bearer ${leadToken}`);
    const member = res.body.find(m => m.id === fixtures.testerId);
    expect(member.gender).toBe('male');
  });
});

describe('gender can also be set at registration time, not just via profile edit', () => {
  it('accepts a gender at signup and returns it immediately in the register response', async () => {
    const res = await request(server).post('/api/auth/register').send({
      email: 'genderatreg@test.local', password: 'password123', name: 'Gender At Reg', gender: 'female',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.gender).toBe('female');

    const login = await request(server).post('/api/auth/login').send({ email: 'genderatreg@test.local', password: 'password123' });
    expect(login.body.user.gender).toBe('female');
  });

  it('registering with no gender at all still works and defaults to null', async () => {
    const res = await request(server).post('/api/auth/register').send({
      email: 'nogenderatreg@test.local', password: 'password123', name: 'No Gender At Reg',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.gender).toBeNull();
  });

  it('rejects an invalid gender at registration', async () => {
    const res = await request(server).post('/api/auth/register').send({
      email: 'badgenderatreg@test.local', password: 'password123', name: 'Bad Gender At Reg', gender: 'robot',
    });
    expect(res.status).toBe(400);
  });
});

// Regression coverage for the "Предложил(а)"/"Выдал(а)" hedge fix — every
// place that displays a *proposal's* or *grant's* author now gets that
// author's real gender plumbed through, instead of leaving the client to
// hedge with a suffix hack.
describe('author gender is plumbed through proposal-authoring endpoints', () => {
  it('bug-examples: author_gender is returned once the author sets a gender', async () => {
    await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`).send({ gender: 'female' }).expect(200);
    const create = await request(server)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ problem: 'P', bad_text: 'bad', good_text: 'good' });
    const list = await request(server).get('/api/bug-examples').set('Authorization', `Bearer ${leadToken}`);
    const row = list.body.find(r => r.id === create.body.id);
    expect(row.author_gender).toBe('female');
  });

  it('glossary: author_gender is returned once the author sets a gender', async () => {
    await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`).send({ gender: 'male' }).expect(200);
    const create = await request(server)
      .post('/api/glossary')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ term: 'DOM', definition: 'Document Object Model' });
    const list = await request(server).get('/api/glossary').set('Authorization', `Bearer ${leadToken}`);
    const row = list.body.find(r => r.id === create.body.id);
    expect(row.author_gender).toBe('male');
  });

  it('guides: author_gender is returned on both the list and detail routes', async () => {
    await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`).send({ gender: 'female' }).expect(200);
    const create = await request(server)
      .post('/api/guides')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ title: 'Gender Guide', category: 'Общее', content: '' });
    const list = await request(server).get('/api/guides').set('Authorization', `Bearer ${leadToken}`);
    expect(list.body.find(r => r.id === create.body.id).author_gender).toBe('female');
    const detail = await request(server).get(`/api/guides/${create.body.id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(detail.body.author_gender).toBe('female');
  });

  it('custom-courses: author_gender is returned on both the list and detail routes', async () => {
    await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`).send({ gender: 'male' }).expect(200);
    const create = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({
        title: 'Gender Course',
        modules: [{ title: 'M1', lessons: [{ title: 'L1', type: 'lesson', content: 'x' }] }],
      });
    const list = await request(server).get('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`);
    expect(list.body.find(r => r.id === create.body.id).author_gender).toBe('male');
    const detail = await request(server).get(`/api/custom-courses/${create.body.id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(detail.body.author_gender).toBe('male');
  });

  it('permission grants: granted_by_gender reflects the granting lead\'s own gender', async () => {
    await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${leadToken}`).send({ gender: 'female' }).expect(200);
    await request(server)
      .post('/api/lead/permissions')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ user_id: fixtures.testerId, permission: 'manage_guides' });
    const list = await request(server).get('/api/lead/permissions').set('Authorization', `Bearer ${leadToken}`);
    const grant = list.body.find(g => g.user_id === fixtures.testerId && g.permission === 'manage_guides');
    expect(grant.granted_by_gender).toBe('female');
  });
});

describe('birthday is collected once, at registration — not editable afterward (see presence.test.js for the lock itself)', () => {
  it('accepts a birthday (MM-DD) at signup and it shows up in /api/team/presence', async () => {
    const res = await request(server).post('/api/auth/register').send({
      email: 'birthdayatreg@test.local', password: 'password123', name: 'Birthday At Reg', birthday: '03-21',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.birthday).toBe('03-21');

    const token = await loginAs(request, server, 'birthdayatreg@test.local', 'password123');
    const presence = await request(server).get('/api/team/presence').set('Authorization', `Bearer ${token}`);
    const me = presence.body.find(p => p.id === res.body.user.id);
    expect(me.birthday).toBe('03-21');
  });

  it('registering with no birthday at all still works and defaults to null', async () => {
    const res = await request(server).post('/api/auth/register').send({
      email: 'nobirthdayatreg@test.local', password: 'password123', name: 'No Birthday At Reg',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.birthday).toBeNull();
  });

  it('rejects an invalid birthday format at registration', async () => {
    const res = await request(server).post('/api/auth/register').send({
      email: 'badbirthdayatreg@test.local', password: 'password123', name: 'Bad Birthday At Reg', birthday: '2024-08-15',
    });
    expect(res.status).toBe(400);
  });
});
