import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let testerToken, leadToken;

beforeAll(async () => {
  seedTestData(db);
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
});

function courseBody(overrides = {}) {
  return {
    title: 'Prereq Test Course',
    is_published: true,
    modules: [{
      title: 'Module 1',
      lessons: [
        { _id: 'local-1', title: 'Lesson 1', type: 'lesson', content: 'intro', prerequisite_type: 'none' },
        {
          _id: 'local-2', title: 'Lesson 2', type: 'lesson', content: 'part two',
          prerequisite_type: 'mandatory', prerequisite_lesson_local_id: 'local-1',
        },
        {
          _id: 'local-3', title: 'Lesson 3 (optional prereq)', type: 'lesson', content: 'extra',
          prerequisite_type: 'optional', prerequisite_note: 'Почитай статью про X перед этим уроком',
        },
      ],
    }],
    ...overrides,
  };
}

async function createCourse(body = courseBody()) {
  const res = await request(server).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`).send(body);
  expect(res.status).toBe(200);
  return res.body.id;
}

async function getCourse(courseId, token) {
  const res = await request(server).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body;
}

describe('mandatory prerequisite resolution on create', () => {
  it('resolves prerequisite_lesson_local_id to a real lesson id', async () => {
    const courseId = await createCourse();
    const course = await getCourse(courseId, leadToken);
    const lessons = course.modules[0].lessons;
    const lesson1 = lessons.find(l => l.title === 'Lesson 1');
    const lesson2 = lessons.find(l => l.title === 'Lesson 2');

    expect(lesson2.prerequisite_type).toBe('mandatory');
    expect(lesson2.prerequisite_lesson_id).toBe(lesson1.id);
  });
});

describe('lock computation for a tester', () => {
  it('a mandatory-prerequisite lesson is locked until the prerequisite is completed', async () => {
    const courseId = await createCourse();
    let course = await getCourse(courseId, testerToken);
    let lessons = course.modules[0].lessons;
    const lesson1 = lessons.find(l => l.title === 'Lesson 1');
    const lesson2 = lessons.find(l => l.title === 'Lesson 2');
    expect(lesson1.locked).toBe(false);
    expect(lesson2.locked).toBe(true);

    // Direct API attempt to complete lesson 2 while locked must be rejected.
    const blocked = await request(server)
      .post(`/api/custom-lessons/${lesson2.id}/complete`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(blocked.status).toBe(403);

    // Complete lesson 1 first.
    const completeLesson1 = await request(server)
      .post(`/api/custom-lessons/${lesson1.id}/complete`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(completeLesson1.status).toBe(200);

    course = await getCourse(courseId, testerToken);
    lessons = course.modules[0].lessons;
    expect(lessons.find(l => l.title === 'Lesson 1').completed).toBe(true);
    expect(lessons.find(l => l.title === 'Lesson 2').locked).toBe(false);

    // Now lesson 2 can be completed.
    const completeLesson2 = await request(server)
      .post(`/api/custom-lessons/${lessons.find(l => l.title === 'Lesson 2').id}/complete`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(completeLesson2.status).toBe(200);
  });

  it('an optional prerequisite never locks access, and carries its note through', async () => {
    const courseId = await createCourse();
    const course = await getCourse(courseId, testerToken);
    const lesson3 = course.modules[0].lessons.find(l => l.title.includes('optional'));
    expect(lesson3.locked).toBe(false);
    expect(lesson3.prerequisite_type).toBe('optional');
    expect(lesson3.prerequisite_note).toContain('Почитай статью');
  });
});

describe('editing a course preserves lesson identity and progress', () => {
  it('re-saving with the real ids (as the course-builder does) keeps ids and progress intact', async () => {
    const courseId = await createCourse();
    let course = await getCourse(courseId, testerToken);
    const modBefore = course.modules[0];
    const lesson1Before = modBefore.lessons.find((l) => l.title === 'Lesson 1');

    await request(server)
      .post(`/api/custom-lessons/${lesson1Before.id}/complete`)
      .set('Authorization', `Bearer ${testerToken}`)
      .expect(200);

    // Build the save payload the way the real course-builder does on an
    // edit: existing rows carry their real DB id as _id (as a string).
    const editBody = {
      title: 'Prereq Test Course',
      is_published: true,
      modules: [{
        _id: String(modBefore.id),
        title: modBefore.title,
        lessons: modBefore.lessons.map((l) => ({
          _id: String(l.id),
          title: l.title,
          type: l.type,
          content: l.content,
          prerequisite_type: l.prerequisite_type,
          prerequisite_lesson_local_id: l.prerequisite_type === 'mandatory' ? String(l.prerequisite_lesson_id) : undefined,
          prerequisite_note: l.prerequisite_note,
        })),
      }],
    };

    const putRes = await request(server)
      .put(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send(editBody);
    expect(putRes.status).toBe(200);

    course = await getCourse(courseId, testerToken);
    const lesson1After = course.modules[0].lessons.find((l) => l.title === 'Lesson 1');
    const lesson2After = course.modules[0].lessons.find((l) => l.title === 'Lesson 2');
    expect(lesson1After.id).toBe(lesson1Before.id); // identity preserved
    expect(lesson1After.completed).toBe(true); // progress preserved
    expect(lesson2After.prerequisite_lesson_id).toBe(lesson1After.id); // prerequisite link survived re-resolution
  });

  it('removing a lesson from the payload deletes it and its progress; adding a new one just adds it', async () => {
    const courseId = await createCourse();
    let course = await getCourse(courseId, testerToken);
    const mod = course.modules[0];
    const lesson1 = mod.lessons.find((l) => l.title === 'Lesson 1');
    const lesson2 = mod.lessons.find((l) => l.title === 'Lesson 2');

    await request(server).post(`/api/custom-lessons/${lesson1.id}/complete`).set('Authorization', `Bearer ${testerToken}`).expect(200);

    // Drop Lesson 2, keep Lesson 1, add a brand-new Lesson 4.
    const editBody = {
      title: 'Prereq Test Course',
      is_published: true,
      modules: [{
        _id: String(mod.id),
        title: mod.title,
        lessons: [
          { _id: String(lesson1.id), title: 'Lesson 1', type: 'lesson', content: 'intro', prerequisite_type: 'none' },
          { _id: 'brand-new', title: 'Lesson 4', type: 'lesson', content: 'new stuff', prerequisite_type: 'none' },
        ],
      }],
    };
    await request(server).put(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${leadToken}`).send(editBody).expect(200);

    course = await getCourse(courseId, testerToken);
    const titles = course.modules[0].lessons.map((l) => l.title);
    expect(titles).toEqual(['Lesson 1', 'Lesson 4']);
    const lesson1After = course.modules[0].lessons.find((l) => l.title === 'Lesson 1');
    expect(lesson1After.id).toBe(lesson1.id);
    expect(lesson1After.completed).toBe(true); // untouched lesson keeps its progress

    // The dropped lesson's progress row should be gone too, not orphaned —
    // check indirectly via the DB since there's no direct API for it.
    const orphanCheck = db.prepare('SELECT COUNT(*) as c FROM custom_lesson_progress WHERE lesson_id = ?').get(lesson2.id);
    expect(orphanCheck.c).toBe(0);
  });
});

describe('role guard', () => {
  // Was a flat 403 — a tester posting to this route is now proposing a
  // course instead of being rejected outright (see routes/courses.js):
  // the server accepts it but forces it unpublished and pending review,
  // regardless of the is_published: true the body asks for.
  it('a tester creating a custom course gets a pending proposal, not a live course', async () => {
    const res = await request(server).post('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`).send(courseBody());
    expect(res.status).toBe(200);
    const row = db.prepare('SELECT is_published, proposal_status FROM custom_courses WHERE id = ?').get(res.body.id);
    expect(row.is_published).toBe(0);
    expect(row.proposal_status).toBe('pending');
  });
});
