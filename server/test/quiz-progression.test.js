import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let fixtures;
let token;

beforeAll(async () => {
  fixtures = seedTestData(db);
  token = await loginAs(request, app, 'tester@test.local', 'testerpass123');
});

describe('lecture unlock progression (before any submission)', () => {
  it('only the first lecture is active, the rest are locked', async () => {
    const res = await request(app).get('/api/tester/lectures').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.map(l => [l.id, l.status]));
    expect(byId[fixtures.lec1Id]).toBe('active');
    expect(byId[fixtures.lec2Id]).toBe('locked');
    expect(byId[fixtures.lec3Id]).toBe('locked');
  });
});

describe('POST /api/lectures/:id/submit-test — scoring', () => {
  it('rejects a request with no answers field as 400, not a raw 500 crash', async () => {
    const res = await request(app)
      .post(`/api/lectures/${fixtures.lec1Id}/submit-test`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects a non-object answers field (e.g. an array) as 400', async () => {
    const res = await request(app)
      .post(`/api/lectures/${fixtures.lec1Id}/submit-test`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: ['b', 'a'] });
    expect(res.status).toBe(400);
  });

  it('scores 100 and passes when every answer is correct', async () => {
    const res = await request(app)
      .post(`/api/lectures/${fixtures.lec1Id}/submit-test`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { [fixtures.q1Id]: 'b', [fixtures.q2Id]: 'a' } });

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(100);
    expect(res.body.passed).toBe(true);
    expect(res.body.coinsEarned).toBeGreaterThan(0);
  });

  it('unlocks the next lecture only after the previous one is passed', async () => {
    const res = await request(app).get('/api/tester/lectures').set('Authorization', `Bearer ${token}`);
    const byId = Object.fromEntries(res.body.map(l => [l.id, l.status]));
    expect(byId[fixtures.lec1Id]).toBe('passed');
    expect(byId[fixtures.lec2Id]).toBe('active');
    expect(byId[fixtures.lec3Id]).toBe('locked');
  });

  it('scores 0 (fail): stays "active" (not "passed"), and does not unlock the following lecture', async () => {
    const res = await request(app)
      .post(`/api/lectures/${fixtures.lec2Id}/submit-test`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: { [fixtures.q3Id]: 'a' } }); // correct is 'c'

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(0);
    expect(res.body.passed).toBe(false);

    const lecturesRes = await request(app).get('/api/tester/lectures').set('Authorization', `Bearer ${token}`);
    const byId = Object.fromEntries(lecturesRes.body.map(l => [l.id, l.status]));
    // A failed attempt must not be labeled "passed" (regression test for a
    // fixed bug — see audit "New Findings"), and stays "active" so the
    // tester can retry it, since its own prerequisite (lecture 1) was passed.
    expect(byId[fixtures.lec2Id]).toBe('active');
    // The next lecture correctly stays locked either way.
    expect(byId[fixtures.lec3Id]).toBe('locked');
  });

  it('rejects submission without a valid token', async () => {
    const res = await request(app)
      .post(`/api/lectures/${fixtures.lec1Id}/submit-test`)
      .send({ answers: {} });
    expect(res.status).toBe(401);
  });

  it('rejects submitting a lecture out of order via direct API call (server-side prerequisite enforcement)', async () => {
    // Fresh tester who hasn't passed lecture 1 — the UI would hide the
    // button for lecture 3, but this checks the API itself refuses it too.
    const insUser = db.prepare(
      'INSERT INTO users (email, password, name, role, avatar_initials) VALUES (?, ?, ?, ?, ?)'
    );
    const freshId = insUser.run('skipper@test.local', '$2a$04$abcdefghijklmnopqrstuv', 'Skipper', 'tester', 'SK').lastInsertRowid;
    const bcryptjs = (await import('bcryptjs')).default;
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcryptjs.hashSync('skipperpass123', 4), freshId);
    const freshToken = await loginAs(request, app, 'skipper@test.local', 'skipperpass123');

    const res = await request(app)
      .post(`/api/lectures/${fixtures.lec3Id}/submit-test`)
      .set('Authorization', `Bearer ${freshToken}`)
      .send({ answers: {} });
    expect(res.status).toBe(403);
  });
});
