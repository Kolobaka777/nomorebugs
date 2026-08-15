import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import bcryptjs from 'bcryptjs';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let adminId, testerId;
let adminToken;

beforeAll(async () => {
  const ids = seedTestData(db);
  adminId = ids.adminId; testerId = ids.testerId;
  adminToken = await loginAs(request, app, 'admin@test.local', 'adminpass123');
});

describe('request id', () => {
  it('every response carries an X-Request-Id header, unique per request', async () => {
    const res1 = await request(app).get('/api/health');
    const res2 = await request(app).get('/api/health');
    expect(res1.headers['x-request-id']).toBeTruthy();
    expect(res2.headers['x-request-id']).toBeTruthy();
    expect(res1.headers['x-request-id']).not.toBe(res2.headers['x-request-id']);
  });
});

describe('login timing side-channel fix', () => {
  it('still pays the bcrypt cost for a nonexistent email (does not short-circuit)', async () => {
    const spy = vi.spyOn(bcryptjs, 'compareSync');
    spy.mockClear();
    await request(app).post('/api/auth/login').send({ email: 'nobody-at-all@test.local', password: 'whatever123' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a nonexistent email still returns the same 401/"Invalid credentials" shape as a wrong password', async () => {
    const nonexistent = await request(app).post('/api/auth/login').send({ email: 'nobody-at-all@test.local', password: 'whatever123' });
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: 'wrongpassword123' });
    expect(nonexistent.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(nonexistent.body.error).toBe(wrongPassword.body.error);
  });

  it('a correct login still succeeds (no regression from the constant-time change)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.local', password: 'adminpass123' });
    expect(res.status).toBe(200);
  });
});

describe('admin-action audit log', () => {
  it('records the acting admin, not just the target, on a role change', async () => {
    const before = db.prepare('SELECT COUNT(*) as c FROM activity_log WHERE user_id = ? AND action LIKE ?')
      .get(adminId, `admin_role_change:target=${testerId}:%`).c;

    const res = await request(app)
      .patch(`/api/admin/users/${testerId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'lead' });
    expect(res.status).toBe(200);

    const after = db.prepare('SELECT COUNT(*) as c FROM activity_log WHERE user_id = ? AND action LIKE ?')
      .get(adminId, `admin_role_change:target=${testerId}:%`).c;
    expect(after).toBe(before + 1);

    const row = db.prepare('SELECT action FROM activity_log WHERE user_id = ? AND action LIKE ? ORDER BY id DESC LIMIT 1')
      .get(adminId, `admin_role_change:target=${testerId}:%`);
    expect(row.action).toBe(`admin_role_change:target=${testerId}:new_role=lead`);

    // Restore for any tests that run after this one in the same file.
    db.prepare("UPDATE users SET role = 'tester' WHERE id = ?").run(testerId);
  });
});

