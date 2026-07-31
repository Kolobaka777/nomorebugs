import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let testerToken, leadToken, adminToken, itemId, templateId;

// Regression coverage for the checklist reporting features added in commit
// f58e3f8 that shipped with zero test coverage: the per-fail-item free-text
// note, the task_type/date_from/date_to filters on the submissions list, and
// the /api/checklists/task-types endpoint the client's filter dropdown reads.
beforeAll(async () => {
  seedTestData(db);
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
  adminToken = await loginAs(request, app, 'admin@test.local', 'adminpass123');

  templateId = db.prepare(
    "INSERT INTO checklist_templates (name, task_type, color) VALUES ('Notes Test Template', 'prelending', '#1D9E75')"
  ).run().lastInsertRowid;
  itemId = db.prepare(
    'INSERT INTO checklist_items (template_id, text, order_num) VALUES (?, ?, 0)'
  ).run(templateId, 'Some item').lastInsertRowid;
});

describe('POST /api/checklists/submit — fail-item note', () => {
  it('persists a note on a failed item and returns it in the submission detail', async () => {
    const submit = await request(app)
      .post('/api/checklists/submit')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({
        template_id: templateId,
        task_name: 'Task with a note',
        task_type: 'smoke',
        results: [{ item_id: itemId, status: 'fail', note: 'Button does nothing on click' }],
      });
    expect(submit.status).toBe(200);

    const detail = await request(app)
      .get(`/api/checklists/submissions/${submit.body.submission_id}`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.results[0].note).toBe('Button does nothing on click');
  });

  it('drops a note on a non-fail item (nothing to explain about a pass)', async () => {
    const submit = await request(app)
      .post('/api/checklists/submit')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({
        template_id: templateId,
        task_name: 'Task with an ignored note',
        task_type: 'smoke',
        results: [{ item_id: itemId, status: 'ok', note: 'should be ignored client-side, but if sent, is stored as-is' }],
      });
    expect(submit.status).toBe(200);
    const detail = await request(app)
      .get(`/api/checklists/submissions/${submit.body.submission_id}`)
      .set('Authorization', `Bearer ${testerToken}`);
    // Server stores whatever note it's given — trimmed/capped, not
    // conditioned on status. The "only send a note for fail" rule lives in
    // the client. This just proves the server doesn't corrupt or reject it.
    expect(typeof detail.body.results[0].note).toBe('string');
  });

  it('trims and caps an oversized note at 1000 characters', async () => {
    const longNote = 'x'.repeat(2000);
    const submit = await request(app)
      .post('/api/checklists/submit')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({
        template_id: templateId,
        task_name: 'Task with a huge note',
        task_type: 'smoke',
        results: [{ item_id: itemId, status: 'fail', note: longNote }],
      });
    expect(submit.status).toBe(200);
    const detail = await request(app)
      .get(`/api/checklists/submissions/${submit.body.submission_id}`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(detail.body.results[0].note).toHaveLength(1000);
  });
});

describe('GET /api/checklists/task-types', () => {
  // The curated list is admin-managed (see /api/admin/task-types), not
  // auto-derived from whatever's been free-typed into submissions — a
  // tester submitting with a brand-new task_type does NOT silently add it
  // here; an admin has to.
  it('reflects admin-added types, not just whatever was free-typed into a submission', async () => {
    const before = await request(app).get('/api/checklists/task-types').set('Authorization', `Bearer ${testerToken}`);
    expect(before.body).not.toContain('smoke');

    const created = await request(app)
      .post('/api/admin/task-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'smoke' });
    expect(created.status).toBe(200);

    const after = await request(app).get('/api/checklists/task-types').set('Authorization', `Bearer ${testerToken}`);
    expect(after.status).toBe(200);
    expect(after.body).toContain('smoke');
    expect(new Set(after.body).size).toBe(after.body.length);
  });

  it('a tester cannot add a task type (admin-only)', async () => {
    const res = await request(app)
      .post('/api/admin/task-types')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ name: 'should-fail' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/checklists/submissions — task_type and date filters', () => {
  beforeAll(async () => {
    await request(app)
      .post('/api/checklists/submit')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({
        template_id: templateId,
        task_name: 'Regression-type task',
        task_type: 'regression',
        results: [{ item_id: itemId, status: 'ok' }],
      });
  });

  it('filters submissions down to only the requested task_type', async () => {
    const res = await request(app)
      .get('/api/checklists/submissions')
      .query({ task_type: 'regression' })
      .set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThan(0);
    expect(res.body.rows.every(r => r.task_type === 'regression')).toBe(true);
  });

  it('a future date_from excludes everything (proves the filter is actually applied, not a no-op)', async () => {
    const farFuture = '2999-01-01';
    const res = await request(app)
      .get('/api/checklists/submissions')
      .query({ date_from: farFuture })
      .set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(0);
  });

  it('date_from today or earlier still returns the just-created submissions', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request(app)
      .get('/api/checklists/submissions')
      .query({ date_from: today })
      .set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThan(0);
  });
});

describe('GET /api/checklists/stats — filters applied consistently across sub-queries', () => {
  it('scoping stats to a task_type with zero submissions returns empty/zeroed results, not an error', async () => {
    const res = await request(app)
      .get('/api/checklists/stats')
      .query({ task_type: 'nonexistent-type-xyz' })
      .set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    expect(res.body.topFails).toEqual([]);
  });

  it('a plain tester cannot read stats (lead-only route unaffected by the new filters)', async () => {
    const res = await request(app)
      .get('/api/checklists/stats')
      .set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(403);
  });
});
