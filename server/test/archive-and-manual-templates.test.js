import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcryptjs from 'bcryptjs';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let leadId, testerId, leadToken, testerToken, adminToken;

beforeAll(async () => {
  const ids = seedTestData(db);
  leadId = ids.leadId; testerId = ids.testerId;
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
  adminToken = await loginAs(request, app, 'admin@test.local', 'adminpass123');
});

describe('user archiving (deactivation) — soft, not delete', () => {
  it('a lead can archive a tester; archived user cannot log in', async () => {
    const archive = await request(app)
      .post(`/api/admin/users/${testerId}/archive`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(archive.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: 'tester@test.local', password: 'testerpass123' });
    expect(login.status).toBe(403);
  });

  it('an archived user\'s already-issued access token stops working immediately (not just at next login)', async () => {
    // testerToken was issued before the archive above.
    const res = await request(app).get('/api/tester/profile').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(403);
  });

  it('archiving preserves all historical data — nothing about the user is deleted', async () => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(testerId);
    expect(user).toBeDefined();
    expect(user.archived_at).not.toBeNull();
  });

  it('a lead can restore the tester, who can then log in again', async () => {
    const restore = await request(app)
      .post(`/api/admin/users/${testerId}/restore`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(restore.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: 'tester@test.local', password: 'testerpass123' });
    expect(login.status).toBe(200);
  });

  it('a lead cannot archive another lead or admin (tester-only)', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${leadId}/archive`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(403);
  });

  it('the last remaining admin cannot be archived (even by another admin)', async () => {
    const soleAdminId = db.prepare("SELECT id FROM users WHERE role = 'admin'").get().id;
    const res = await request(app)
      .post(`/api/admin/users/${soleAdminId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('archived testers no longer appear in the active team list', async () => {
    await request(app).post(`/api/admin/users/${testerId}/archive`).set('Authorization', `Bearer ${leadToken}`);
    const team = await request(app).get('/api/lead/team').set('Authorization', `Bearer ${leadToken}`);
    expect(team.body.find(m => m.id === testerId)).toBeUndefined();

    const archivedList = await request(app).get('/api/lead/archived-testers').set('Authorization', `Bearer ${leadToken}`);
    expect(archivedList.body.find(m => m.id === testerId)).toBeDefined();

    // restore for any later tests in this file
    await request(app).post(`/api/admin/users/${testerId}/restore`).set('Authorization', `Bearer ${leadToken}`);
  });
});

describe('manual checklist template creation', () => {
  it('a tester without manage_checklists is rejected', async () => {
    const res = await request(app)
      .post('/api/checklists/templates')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ name: 'Should fail', color: '#1D9E75', items: [{ category: 'Общее', text: 'x' }] });
    expect(res.status).toBe(403);
  });

  it('rejects a template with no items', async () => {
    const res = await request(app)
      .post('/api/checklists/templates')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ name: 'Empty template', color: '#1D9E75', items: [] });
    expect(res.status).toBe(400);
  });

  it('a lead can create a template manually and immediately submit against it', async () => {
    const created = await request(app)
      .post('/api/checklists/templates')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({
        name: 'Manual Template Test',
        color: '#7F77DD',
        items: [{ category: 'Функционал', text: 'Форма отправляется' }, { category: '', text: 'Кнопка кликабельна' }],
      });
    expect(created.status).toBe(200);
    expect(created.body.item_count).toBe(2);

    const items = db.prepare('SELECT * FROM checklist_items WHERE template_id = ?').all(created.body.id);
    expect(items).toHaveLength(2);
    expect(items[1].category).toBe('Общее'); // blank category defaults sensibly

    const submit = await request(app)
      .post('/api/checklists/submit')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ template_id: created.body.id, task_name: 'Test task', results: items.map(i => ({ item_id: i.id, status: 'ok' })) });
    expect(submit.status).toBe(200);
  });

  it('rejects a duplicate template name (same constraint as import)', async () => {
    const res = await request(app)
      .post('/api/checklists/templates')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ name: 'Manual Template Test', color: '#1D9E75', items: [{ category: 'Общее', text: 'x' }] });
    expect(res.status).toBe(409);
  });
});

describe('trash — restore and purge for a non-course entity', () => {
  it('a soft-deleted glossary term can be restored by an admin', async () => {
    const term = await request(app)
      .post('/api/glossary')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ term: 'Regression', definition: 'A bug that returns after being fixed once.' });
    const id = term.body.id;

    await request(app).delete(`/api/glossary/${id}`).set('Authorization', `Bearer ${leadToken}`);
    const trash = await request(app).get('/api/admin/trash').set('Authorization', `Bearer ${adminToken}`);
    const entry = trash.body.find(t => t.type === 'glossary_terms' && t.id === id);
    expect(entry).toBeDefined();

    const restore = await request(app).post(`/api/admin/trash/glossary_terms/${id}/restore`).set('Authorization', `Bearer ${adminToken}`);
    expect(restore.status).toBe(200);
    const list = await request(app).get('/api/glossary').set('Authorization', `Bearer ${leadToken}`);
    expect(list.body.find(t => t.id === id)).toBeDefined();
  });

  it('rejects an unknown trash type', async () => {
    const res = await request(app).get('/api/admin/trash').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const bad = await request(app).post('/api/admin/trash/not_a_real_table/1/restore').set('Authorization', `Bearer ${adminToken}`);
    expect(bad.status).toBe(400);
  });

  it('trash is admin-only', async () => {
    const res = await request(app).get('/api/admin/trash').set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(403);
  });
});
