import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let leadId, testerId, leadToken, testerToken, adminToken;

beforeAll(async () => {
  const ids = seedTestData(db);
  leadId = ids.leadId; testerId = ids.testerId;
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
  adminToken = await loginAs(request, server, 'admin@test.local', 'adminpass123');
});

describe('user archiving (deactivation) — soft, not delete', () => {
  it('a lead can archive a tester; archived user cannot log in', async () => {
    const archive = await request(server)
      .post(`/api/admin/users/${testerId}/archive`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(archive.status).toBe(200);

    const login = await request(server).post('/api/auth/login').send({ email: 'tester@test.local', password: 'testerpass123' });
    expect(login.status).toBe(403);
  });

  it('an archived user\'s already-issued access token stops working immediately (not just at next login)', async () => {
    // testerToken was issued before the archive above.
    const res = await request(server).get('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(403);
  });

  it('archiving preserves all historical data — nothing about the user is deleted', async () => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(testerId);
    expect(user).toBeDefined();
    expect(user.archived_at).not.toBeNull();
  });

  it('a lead can restore the tester, who can then log in again', async () => {
    const restore = await request(server)
      .post(`/api/admin/users/${testerId}/restore`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(restore.status).toBe(200);

    const login = await request(server).post('/api/auth/login').send({ email: 'tester@test.local', password: 'testerpass123' });
    expect(login.status).toBe(200);
  });

  it('a lead cannot archive another lead or admin (tester-only)', async () => {
    const res = await request(server)
      .post(`/api/admin/users/${leadId}/archive`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(403);
  });

  it('the last remaining admin cannot be archived (even by another admin)', async () => {
    const soleAdminId = db.prepare("SELECT id FROM users WHERE role = 'admin'").get().id;
    const res = await request(server)
      .post(`/api/admin/users/${soleAdminId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('archived testers no longer appear in the active team list', async () => {
    await request(server).post(`/api/admin/users/${testerId}/archive`).set('Authorization', `Bearer ${leadToken}`);
    const team = await request(server).get('/api/lead/team').set('Authorization', `Bearer ${leadToken}`);
    expect(team.body.find(m => m.id === testerId)).toBeUndefined();

    const archivedList = await request(server).get('/api/lead/archived-testers').set('Authorization', `Bearer ${leadToken}`);
    expect(archivedList.body.find(m => m.id === testerId)).toBeDefined();

    // restore for any later tests in this file
    await request(server).post(`/api/admin/users/${testerId}/restore`).set('Authorization', `Bearer ${leadToken}`);
  });
});

describe('trash — restore and purge for a non-course entity', () => {
  it('a soft-deleted glossary term can be restored by an admin', async () => {
    const term = await request(server)
      .post('/api/glossary')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ term: 'Regression', definition: 'A bug that returns after being fixed once.' });
    const id = term.body.id;

    await request(server).delete(`/api/glossary/${id}`).set('Authorization', `Bearer ${leadToken}`);
    const trash = await request(server).get('/api/admin/trash').set('Authorization', `Bearer ${adminToken}`);
    const entry = trash.body.find(t => t.type === 'glossary_terms' && t.id === id);
    expect(entry).toBeDefined();

    const restore = await request(server).post(`/api/admin/trash/glossary_terms/${id}/restore`).set('Authorization', `Bearer ${adminToken}`);
    expect(restore.status).toBe(200);
    const list = await request(server).get('/api/glossary').set('Authorization', `Bearer ${leadToken}`);
    expect(list.body.find(t => t.id === id)).toBeDefined();
  });

  it('rejects an unknown trash type', async () => {
    const res = await request(server).get('/api/admin/trash').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const bad = await request(server).post('/api/admin/trash/not_a_real_table/1/restore').set('Authorization', `Bearer ${adminToken}`);
    expect(bad.status).toBe(400);
  });

  it('trash is admin-only', async () => {
    const res = await request(server).get('/api/admin/trash').set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(403);
  });
});
