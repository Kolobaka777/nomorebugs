import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let testerToken;
let leadToken;
let adminToken;

beforeAll(async () => {
  seedTestData(db);
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
  adminToken = await loginAs(request, app, 'admin@test.local', 'adminpass123');
});

describe('requireRole("lead") route protection', () => {
  it('rejects a tester with 403', async () => {
    const res = await request(app).get('/api/lead/team').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(403);
  });

  it('allows a lead through', async () => {
    const res = await request(app).get('/api/lead/team').set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('rejects an unauthenticated request with 401 before role is even checked', async () => {
    const res = await request(app).get('/api/lead/team');
    expect(res.status).toBe(401);
  });

  it('lets admin through too, without "admin" ever appearing in the route\'s allow-list', async () => {
    const res = await request(app).get('/api/lead/team').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('requireRole("admin") route protection', () => {
  it('rejects a lead with 403 — being lead does not imply admin', async () => {
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(403);
  });

  it('rejects a tester with 403', async () => {
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(403);
  });

  it('allows an admin through', async () => {
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
