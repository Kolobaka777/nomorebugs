import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let leadToken, leadToken2, templateId, itemIds;

beforeAll(async () => {
  seedTestData(db);
  db.prepare("INSERT INTO users (email, password, name, role, avatar_initials) VALUES ('lead2@test.local', ?, 'Lead Two', 'lead', 'L2')")
    .run(db.prepare('SELECT password FROM users WHERE email = ?').get('lead@test.local').password);
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
  leadToken2 = await loginAs(request, app, 'lead2@test.local', 'leadpass123');

  const create = await request(app)
    .post('/api/checklists/templates')
    .set('Authorization', `Bearer ${leadToken}`)
    .send({ name: 'MVT Lock Test', items: [{ category: 'Общее', text: 'Item 1' }, { category: 'Общее', text: 'Item 2' }] });
  templateId = create.body.id;
  itemIds = db.prepare('SELECT id FROM checklist_items WHERE template_id = ? ORDER BY order_num').all(templateId).map(r => r.id);
});

// Production-readiness audit (deferred item resolved): two leads opening the
// same template's MVT editor used to silently lose whichever save happened
// first — the PATCH route now requires the caller to echo back the
// mvt_updated_at stamp it loaded, and 409s if someone else has saved since.
describe('MVT editor optimistic locking', () => {
  it('a fresh save (expected_mvt_updated_at: null, matching a never-touched template) succeeds and returns a new stamp', async () => {
    const res = await request(app)
      .patch(`/api/checklists/templates/${templateId}/mvt`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ items: [{ id: itemIds[0], in_mvt: 0 }, { id: itemIds[1], in_mvt: 1 }], expected_mvt_updated_at: null });
    expect(res.status).toBe(200);
    expect(typeof res.body.mvt_updated_at).toBe('string');
  });

  it('two leads loading the same template concurrently: first save wins, second is rejected with 409 instead of overwriting', async () => {
    // Both "loaded" the template at the same (now-current) stamp.
    const loaded = db.prepare('SELECT mvt_updated_at FROM checklist_templates WHERE id = ?').get(templateId).mvt_updated_at;

    const first = await request(app)
      .patch(`/api/checklists/templates/${templateId}/mvt`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ items: [{ id: itemIds[0], in_mvt: 1 }, { id: itemIds[1], in_mvt: 1 }], expected_mvt_updated_at: loaded });
    expect(first.status).toBe(200);

    const second = await request(app)
      .patch(`/api/checklists/templates/${templateId}/mvt`)
      .set('Authorization', `Bearer ${leadToken2}`)
      .send({ items: [{ id: itemIds[0], in_mvt: 0 }, { id: itemIds[1], in_mvt: 0 }], expected_mvt_updated_at: loaded });
    expect(second.status).toBe(409);

    // The first lead's save survived — the second lead's stale write never landed.
    const items = db.prepare('SELECT id, in_mvt FROM checklist_items WHERE template_id = ? ORDER BY id').all(templateId);
    expect(items.find(i => i.id === itemIds[0]).in_mvt).toBe(1);
    expect(items.find(i => i.id === itemIds[1]).in_mvt).toBe(1);
  });

  it('rejects a missing/malformed items array with 400 regardless of locking', async () => {
    const res = await request(app)
      .patch(`/api/checklists/templates/${templateId}/mvt`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ items: 'not-an-array' });
    expect(res.status).toBe(400);
  });
});
