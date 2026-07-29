import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let leadToken;

// Submission history is shared, team-visible, and grows without bound —
// it must page rather than silently truncate past some hardcoded cap.
beforeAll(async () => {
  const { testerId } = seedTestData(db);
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');

  const tplId = db.prepare(
    "INSERT INTO checklist_templates (name, task_type, color) VALUES ('Pagination Test Template', 'prelending', '#1D9E75')"
  ).run().lastInsertRowid;
  const itemId = db.prepare(
    'INSERT INTO checklist_items (template_id, text, order_num) VALUES (?, ?, 0)'
  ).run(tplId, 'Single item').lastInsertRowid;

  const insSub = db.prepare(
    'INSERT INTO checklist_submissions (user_id, template_id, task_name) VALUES (?, ?, ?)'
  );
  const insResult = db.prepare(
    'INSERT INTO checklist_item_results (submission_id, item_id, status) VALUES (?, ?, ?)'
  );
  for (let i = 0; i < 55; i++) {
    const subId = insSub.run(testerId, tplId, `Task ${i}`).lastInsertRowid;
    insResult.run(subId, itemId, 'ok');
  }
});

describe('GET /api/checklists/submissions — pagination', () => {
  it('caps the first page at 50 and reports hasMore', async () => {
    const res = await request(app)
      .get('/api/checklists/submissions')
      .set('Authorization', `Bearer ${leadToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(50);
    expect(res.body.hasMore).toBe(true);
  });

  it('offset fetches the remainder and reports hasMore=false once exhausted', async () => {
    const res = await request(app)
      .get('/api/checklists/submissions')
      .query({ offset: 50 })
      .set('Authorization', `Bearer ${leadToken}`);

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(5);
    expect(res.body.hasMore).toBe(false);
  });

  it('first page and second page contain no overlapping submissions', async () => {
    const first = await request(app)
      .get('/api/checklists/submissions')
      .set('Authorization', `Bearer ${leadToken}`);
    const second = await request(app)
      .get('/api/checklists/submissions')
      .query({ offset: 50 })
      .set('Authorization', `Bearer ${leadToken}`);

    const firstIds = new Set(first.body.rows.map(r => r.id));
    const overlap = second.body.rows.filter(r => firstIds.has(r.id));
    expect(overlap).toHaveLength(0);
  });
});
