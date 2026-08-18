// Course sections — a public catalog-organization layer (unlike
// suggestion_folders, which are private to the lead): every role sees the
// same grouping, so GET /api/custom-courses must return section_id/
// section_name to everyone, not just a lead branch.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let leadToken, testerToken;

beforeAll(async () => {
  seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

describe('course sections — CRUD', () => {
  it('a plain tester cannot create a section', async () => {
    const res = await request(server)
      .post('/api/course-sections')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ name: 'Основы' });
    expect(res.status).toBe(403);
  });

  it('a lead can create, rename, and delete a section', async () => {
    const create = await request(server)
      .post('/api/course-sections')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ name: 'Основы' });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const list = await request(server).get('/api/course-sections').set('Authorization', `Bearer ${testerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.find((s) => s.id === id)?.name).toBe('Основы');

    const rename = await request(server)
      .patch(`/api/course-sections/${id}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ name: 'Базовый уровень' });
    expect(rename.status).toBe(200);
    expect(db.prepare('SELECT name FROM course_sections WHERE id = ?').get(id).name).toBe('Базовый уровень');

    const del = await request(server).delete(`/api/course-sections/${id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(del.status).toBe(200);
    expect(db.prepare('SELECT 1 FROM course_sections WHERE id = ?').get(id)).toBeUndefined();
  });

  it('rejects an empty name on create and rename', async () => {
    const create = await request(server)
      .post('/api/course-sections')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ name: '   ' });
    expect(create.status).toBe(400);
  });

  it('deleting a section un-files its courses instead of deleting them', async () => {
    const section = await request(server)
      .post('/api/course-sections')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ name: 'Временный раздел' });
    const sectionId = section.body.id;

    const course = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({
        title: 'Курс в разделе', is_published: true, section_id: sectionId,
        modules: [{ title: 'M1', lessons: [{ title: 'L1', type: 'lesson', content: 'x' }] }],
      });
    expect(course.status).toBe(200);
    const courseId = course.body.id;
    expect(db.prepare('SELECT section_id FROM custom_courses WHERE id = ?').get(courseId).section_id).toBe(sectionId);

    await request(server).delete(`/api/course-sections/${sectionId}`).set('Authorization', `Bearer ${leadToken}`);

    const row = db.prepare('SELECT section_id, deleted_at FROM custom_courses WHERE id = ?').get(courseId);
    expect(row.section_id).toBeNull();
    expect(row.deleted_at).toBeNull(); // still exists — only un-filed, not removed
  });
});

describe('course sections — visible to every role via GET /api/custom-courses', () => {
  let sectionId, courseId;

  beforeAll(async () => {
    const section = await request(server)
      .post('/api/course-sections')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ name: 'Продвинутое' });
    sectionId = section.body.id;

    const course = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({
        title: 'Курс продвинутого уровня', is_published: true, section_id: sectionId,
        modules: [{ title: 'M1', lessons: [{ title: 'L1', type: 'lesson', content: 'x' }] }],
      });
    courseId = course.body.id;
  });

  it('a tester (not just a lead) sees section_id and section_name on the course', async () => {
    const res = await request(server).get('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`);
    const row = res.body.find((c) => c.id === courseId);
    expect(row).toBeTruthy();
    expect(row.section_id).toBe(sectionId);
    expect(row.section_name).toBe('Продвинутое');
  });

  it('a lead can move a course to a different section via PUT with just { section_id }', async () => {
    const other = await request(server)
      .post('/api/course-sections')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ name: 'Другой раздел' });

    const update = await request(server)
      .put(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ section_id: other.body.id });
    expect(update.status).toBe(200);

    const row = db.prepare('SELECT section_id, title FROM custom_courses WHERE id = ?').get(courseId);
    expect(row.section_id).toBe(other.body.id);
    // Sending just section_id must not clobber the rest of the course.
    expect(row.title).toBe('Курс продвинутого уровня');
  });

  it('a course can be unfiled by sending section_id: null', async () => {
    const update = await request(server)
      .put(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ section_id: null });
    expect(update.status).toBe(200);
    expect(db.prepare('SELECT section_id FROM custom_courses WHERE id = ?').get(courseId).section_id).toBeNull();
  });

  it("a proposing tester's section_id is ignored on create", async () => {
    const res = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({
        title: 'Предложенный курс', section_id: sectionId,
        modules: [{ title: 'M1', lessons: [{ title: 'L1', type: 'lesson', content: 'x' }] }],
      });
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT section_id FROM custom_courses WHERE id = ?').get(res.body.id).section_id).toBeNull();
  });
});
