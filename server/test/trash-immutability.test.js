// Regression coverage for the 2026-08-15 audit finding: PUT/PATCH-publish
// on custom_courses/guides/bug_examples/glossary_terms loaded the target
// row without a `deleted_at IS NULL` filter, even though the matching
// GET/list routes already filtered it correctly. A trashed (soft-deleted)
// row could still be edited or re-published by anyone who already held
// edit rights and knew/guessed its id — undermining the trash feature's
// "frozen until restored" guarantee. Fixed by adding the same filter the
// read routes already used to the six write-path lookups.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let leadToken;

beforeAll(async () => {
  seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
});

describe('a trashed course can no longer be edited or republished', () => {
  let courseId;

  beforeAll(async () => {
    const created = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Trash Immutability Course', is_published: false, modules: [{ title: 'M1', lessons: [{ title: 'L1', type: 'lesson' }] }] });
    courseId = created.body.id;
    await request(server).delete(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${leadToken}`).expect(200);
  });

  it('PUT 404s instead of silently editing the trashed course', async () => {
    const res = await request(server)
      .put(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Edited while trashed' });
    expect(res.status).toBe(404);
    expect(db.prepare('SELECT title FROM custom_courses WHERE id = ?').get(courseId).title).toBe('Trash Immutability Course');
  });

  it('PATCH .../publish 404s instead of silently republishing the trashed course', async () => {
    const res = await request(server)
      .patch(`/api/custom-courses/${courseId}/publish`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(404);
    expect(db.prepare('SELECT is_published FROM custom_courses WHERE id = ?').get(courseId).is_published).toBe(0);
  });
});

describe('trashed knowledge-base content can no longer be edited', () => {
  it('PUT /api/guides/:id 404s on a trashed guide', async () => {
    const created = await request(server)
      .post('/api/guides')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Trash Immutability Guide', category: 'Общее', content: 'x' });
    const id = created.body.id;
    await request(server).delete(`/api/guides/${id}`).set('Authorization', `Bearer ${leadToken}`).expect(200);

    const res = await request(server)
      .put(`/api/guides/${id}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Edited while trashed', category: 'Общее', content: 'x' });
    expect(res.status).toBe(404);
  });

  it('PUT /api/bug-examples/:id 404s on a trashed bug example', async () => {
    const created = await request(server)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ problem: 'Trash Immutability Example', bad_text: 'bad', good_text: 'good' });
    const id = created.body.id;
    await request(server).delete(`/api/bug-examples/${id}`).set('Authorization', `Bearer ${leadToken}`).expect(200);

    const res = await request(server)
      .put(`/api/bug-examples/${id}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ problem: 'Edited while trashed', bad_text: 'bad', good_text: 'good' });
    expect(res.status).toBe(404);
  });

  it('PUT /api/glossary/:id 404s on a trashed glossary term', async () => {
    const created = await request(server)
      .post('/api/glossary')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ term: 'Trash Immutability Term', definition: 'x' });
    const id = created.body.id;
    await request(server).delete(`/api/glossary/${id}`).set('Authorization', `Bearer ${leadToken}`).expect(200);

    const res = await request(server)
      .put(`/api/glossary/${id}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ term: 'Edited while trashed', definition: 'x' });
    expect(res.status).toBe(404);
  });
});