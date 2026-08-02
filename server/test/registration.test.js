import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let adminToken;

beforeAll(async () => {
  seedTestData(db);
  adminToken = await loginAs(request, app, 'admin@test.local', 'adminpass123');
});

describe('POST /api/auth/register', () => {
  it('creates a new account at the default (tester) role and logs it in', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'newperson@test.local',
      password: 'a-real-password',
      name: 'New Person',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('tester');
    expect(res.body.user.avatar_initials).toBe('NP');
    expect(res.body.needsBaselineSurvey).toBe(true);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.refreshToken).toBeUndefined(); // travels as an httpOnly cookie instead
    const cookie = (res.headers['set-cookie'] || []).find(c => c.startsWith('refreshToken='));
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('cannot be used to self-grant a privileged role — role is not a client-supplied field', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'sneaky@test.local',
      password: 'a-real-password',
      name: 'Sneaky Person',
      role: 'admin',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('tester');
  });

  it('rejects a duplicate email with 409, not a raw 500', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'dupe@test.local', password: 'a-real-password', name: 'First',
    });
    const res = await request(app).post('/api/auth/register').send({
      email: 'dupe@test.local', password: 'another-password', name: 'Second',
    });
    expect(res.status).toBe(409);
  });

  it('rejects a malformed email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'not-an-email', password: 'a-real-password', name: 'Someone',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a password under 8 characters', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'shortpw@test.local', password: 'short', name: 'Someone',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a missing name', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'noname@test.local', password: 'a-real-password',
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/users/:id/role', () => {
  it('promotes a tester to lead', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'promoteme@test.local', password: 'a-real-password', name: 'Promote Me',
    });
    const userId = db.prepare('SELECT id FROM users WHERE email = ?').get('promoteme@test.local').id;

    const res = await request(app)
      .patch(`/api/admin/users/${userId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'lead' });

    expect(res.status).toBe(200);
    const updated = db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
    expect(updated.role).toBe('lead');
    void reg;
  });

  it('rejects an unknown role', async () => {
    const testerId = db.prepare("SELECT id FROM users WHERE email = 'tester@test.local'").get().id;
    const res = await request(app)
      .patch(`/api/admin/users/${testerId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'super-mega-admin' });
    expect(res.status).toBe(400);
  });

  it('refuses to demote the last remaining admin away from admin', async () => {
    const adminId = db.prepare("SELECT id FROM users WHERE email = 'admin@test.local'").get().id;
    const res = await request(app)
      .patch(`/api/admin/users/${adminId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'tester' });
    expect(res.status).toBe(400);
    const stillAdmin = db.prepare('SELECT role FROM users WHERE id = ?').get(adminId);
    expect(stillAdmin.role).toBe('admin');
  });

  it('allows demoting an admin when another admin still exists', async () => {
    const secondAdmin = await request(app).post('/api/auth/register').send({
      email: 'secondadmin@test.local', password: 'a-real-password', name: 'Second Admin',
    });
    const secondAdminId = secondAdmin.body.user.id;
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(secondAdminId);

    const firstAdminId = db.prepare("SELECT id FROM users WHERE email = 'admin@test.local'").get().id;
    const res = await request(app)
      .patch(`/api/admin/users/${firstAdminId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'lead' });

    expect(res.status).toBe(200);
    // Restore for any tests that run after this one in the same file.
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(firstAdminId);
  });

  it('rejects a non-admin caller with 403', async () => {
    const leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
    const testerId = db.prepare("SELECT id FROM users WHERE email = 'tester@test.local'").get().id;
    const res = await request(app)
      .patch(`/api/admin/users/${testerId}/role`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ role: 'lead' });
    expect(res.status).toBe(403);
  });
});
