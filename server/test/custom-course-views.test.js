import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let leadToken, testerToken, testerId;

// Regression coverage for custom_course_views (the per-user "seen" tracking
// behind the courses page's NEW badge), added in commit f58e3f8. The
// existing course-delete-cascade test in audit-fixes.test.js never actually
// created a view row before deleting, so it never exercised the FK path this
// table introduced — this is what originally broke (SQLITE_CONSTRAINT_FOREIGNKEY)
// before custom_course_views was added to the cascade.
beforeAll(async () => {
  const ids = seedTestData(db);
  testerId = ids.testerId;
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
});

describe('custom_course_views — NEW badge view tracking', () => {
  let courseId;

  beforeAll(async () => {
    const created = await request(app)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Views Test Course', is_published: true, modules: [{ title: 'M1', lessons: [{ title: 'L1', type: 'lesson' }] }] });
    courseId = created.body.id;
  });

  it('is unviewed by default in the course list', async () => {
    const list = await request(app).get('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`);
    const row = list.body.find(c => c.id === courseId);
    expect(row.viewed).toBe(0);
  });

  it('viewing the course detail marks it viewed for that user only', async () => {
    const detail = await request(app)
      .get(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(detail.status).toBe(200);

    const viewRow = db.prepare(
      'SELECT * FROM custom_course_views WHERE user_id = ? AND course_id = ?'
    ).get(testerId, courseId);
    expect(viewRow).toBeDefined();

    const list = await request(app).get('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`);
    expect(list.body.find(c => c.id === courseId).viewed).toBe(1);

    // A different (unviewed) user still sees it as new.
    const leadList = await request(app).get('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`);
    expect(leadList.body.find(c => c.id === courseId).viewed).toBe(0);
  });

  it('viewing twice does not error or duplicate the view row (INSERT OR IGNORE)', async () => {
    await request(app).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${testerToken}`);
    const rows = db.prepare(
      'SELECT * FROM custom_course_views WHERE user_id = ? AND course_id = ?'
    ).all(testerId, courseId);
    expect(rows).toHaveLength(1);
  });

  it('deleting a course with an existing view row soft-deletes it — view row untouched, course hidden from normal routes', async () => {
    const del = await request(app)
      .delete(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(del.status).toBe(200);
    expect(db.prepare('SELECT * FROM custom_course_views WHERE course_id = ?').get(courseId)).toBeDefined();
    expect(db.prepare('SELECT deleted_at FROM custom_courses WHERE id = ?').get(courseId).deleted_at).not.toBeNull();

    const detail = await request(app).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${leadToken}`);
    expect(detail.status).toBe(404);
  });

  it('permanently purging a trashed course with an existing view row cascades cleanly (no FK constraint error — the original bug this covers)', async () => {
    const adminToken = await loginAs(request, app, 'admin@test.local', 'adminpass123');
    const purge = await request(app)
      .delete(`/api/admin/trash/custom_courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(purge.status).toBe(200);
    expect(db.prepare('SELECT * FROM custom_course_views WHERE course_id = ?').get(courseId)).toBeUndefined();
    expect(db.prepare('SELECT * FROM custom_courses WHERE id = ?').get(courseId)).toBeUndefined();
  });
});

describe('custom_course_views — purging a course with a deadline override (production-readiness audit)', () => {
  it('permanently purging a trashed course that has a per-user deadline override cascades cleanly (course_deadline_overrides FK previously blocked this forever)', async () => {
    const created = await request(app)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Deadline Override Purge Course', is_published: true, modules: [{ title: 'M1', lessons: [{ title: 'L1', type: 'lesson' }] }] });
    const courseId = created.body.id;

    const override = await request(app)
      .post(`/api/custom-courses/${courseId}/deadline-override`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ user_id: testerId, deadline_at: '2030-01-01', reason: 'was on vacation' });
    expect(override.status).toBe(200);
    expect(db.prepare('SELECT * FROM course_deadline_overrides WHERE course_id = ?').get(courseId)).toBeDefined();

    await request(app).delete(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${leadToken}`).expect(200);

    const adminToken = await loginAs(request, app, 'admin@test.local', 'adminpass123');
    const purge = await request(app)
      .delete(`/api/admin/trash/custom_courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(purge.status).toBe(200);
    expect(db.prepare('SELECT * FROM course_deadline_overrides WHERE course_id = ?').get(courseId)).toBeUndefined();
    expect(db.prepare('SELECT * FROM custom_courses WHERE id = ?').get(courseId)).toBeUndefined();
  });
});

describe('custom_course_views — purging a course with a tester lesson note (2026-08-15 audit)', () => {
  it('permanently purging a trashed course that has a tester lesson note cascades cleanly (custom_lesson_notes FK previously blocked this forever, same bug class as the deadline-override one above)', async () => {
    const created = await request(app)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Lesson Note Purge Course', is_published: true, modules: [{ title: 'M1', lessons: [{ title: 'L1', type: 'lesson' }] }] });
    const courseId = created.body.id;

    const note = await request(app)
      .post('/api/tester/notes')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ course_id: courseId, lesson_title: 'L1', text: 'Не забыть проверить эту форму на мобилке' });
    expect(note.status).toBe(200);
    expect(db.prepare('SELECT * FROM custom_lesson_notes WHERE course_id = ?').get(courseId)).toBeDefined();

    await request(app).delete(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${leadToken}`).expect(200);

    const adminToken = await loginAs(request, app, 'admin@test.local', 'adminpass123');
    const purge = await request(app)
      .delete(`/api/admin/trash/custom_courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(purge.status).toBe(200);
    expect(db.prepare('SELECT * FROM custom_lesson_notes WHERE course_id = ?').get(courseId)).toBeUndefined();
    expect(db.prepare('SELECT * FROM custom_courses WHERE id = ?').get(courseId)).toBeUndefined();
  });
});
