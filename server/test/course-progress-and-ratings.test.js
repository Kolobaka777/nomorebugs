import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, testerToken, leadToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
});

// These three were previously either missing entirely (progressByTester,
// completedCount) or computed-but-silently-dropped from the response
// (passedCount) — a lead had no real way to see who on the team had
// actually completed anything, anywhere in the app.

// The dev/test auto-seed in app.js (lead@qa.com + 4 demo testers) runs at
// import time against any fresh, non-production DB — including this one —
// before seedTestData adds its own fixtures on top. So "how many testers
// exist" is never just the one fixture tester; computed for real here
// rather than assumed, the same way the route itself computes it.
function activeTesterCount() {
  return db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'tester' AND archived_at IS NULL").get().c;
}

describe('GET /api/lead/lecture-stats — real completion counts', () => {
  it('reports how many testers actually passed, not just attempted', async () => {
    // Fixture correct answers: q1='b', q2='a' (see helpers.js/quiz-progression.test.js).
    const submit = await request(server)
      .post(`/api/lectures/${fixtures.lec1Id}/submit-test`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [fixtures.q1Id]: 'b', [fixtures.q2Id]: 'a' } });
    expect(submit.body.score).toBe(100);

    const res = await request(server).get('/api/lead/lecture-stats').set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    const lec1Stats = res.body.find(r => r.id === fixtures.lec1Id);
    const lec2Stats = res.body.find(r => r.id === fixtures.lec2Id);
    const totalTesters = activeTesterCount();
    expect(lec1Stats.passedCount).toBe(1); // only our fixture tester actually took and passed it
    expect(lec1Stats.totalTesters).toBe(totalTesters);
    expect(lec2Stats.passedCount).toBe(0); // never attempted
    expect(lec2Stats.totalTesters).toBe(totalTesters);
  });
});

describe('custom course completion — lead-facing counts and per-tester progress', () => {
  async function createPublishedCourse() {
    const res = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({
        title: 'Progress Test Course',
        is_published: true,
        modules: [{ title: 'M1', lessons: [
          { _id: 'l1', title: 'Lesson 1', type: 'lesson', content: 'a', prerequisite_type: 'none' },
          { _id: 'l2', title: 'Lesson 2', type: 'lesson', content: 'b', prerequisite_type: 'none' },
        ] }],
      });
    expect(res.status).toBe(200);
    return res.body.id;
  }

  it('completedCount is 0 and totalTesters is correct before anyone finishes it', async () => {
    const courseId = await createPublishedCourse();
    const list = await request(server).get('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`);
    const row = list.body.find(c => c.id === courseId);
    expect(row.completedCount).toBe(0);
    expect(row.totalTesters).toBe(activeTesterCount());
  });

  it('completedCount becomes 1 once the tester finishes every lesson and syncs time-track (what the real learning page does on the last lesson)', async () => {
    const courseId = await createPublishedCourse();
    const course = (await request(server).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${testerToken}`)).body;
    const [l1, l2] = course.modules[0].lessons;

    await request(server).post(`/api/custom-lessons/${l1.id}/complete`).set('Authorization', `Bearer ${testerToken}`).expect(200);
    await request(server).post(`/api/custom-lessons/${l2.id}/complete`).set('Authorization', `Bearer ${testerToken}`).expect(200);
    await request(server)
      .post('/api/courses/time-track')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ course_id: courseId, seconds_spent: 42 })
      .expect(200);

    const list = await request(server).get('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`);
    expect(list.body.find(c => c.id === courseId).completedCount).toBe(1);

    const detailAsLead = await request(server).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${leadToken}`);
    const testerProgress = detailAsLead.body.progressByTester.find(t => t.id === fixtures.testerId);
    expect(testerProgress.completedLessons).toBe(2);
    expect(testerProgress.totalLessons).toBe(2);
    expect(testerProgress.finished).toBe(true);

    // A tester viewing the same course never sees teammates' progress.
    const detailAsTester = await request(server).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${testerToken}`);
    expect(detailAsTester.body.progressByTester).toBeUndefined();
  });
});

describe('GET /api/lead/internal-ratings — recentEvents breakdown', () => {
  it('surfaces each event\'s own reason text, not just the aggregate score', async () => {
    db.prepare('INSERT INTO internal_score_events (user_id, points, reason, source) VALUES (?, ?, ?, ?)')
      .run(fixtures.testerId, 5, 'Отличный результат по лекции (95%), без признаков спешки', 'auto_quiz_excellence');
    db.prepare('INSERT INTO internal_score_events (user_id, points, reason, source) VALUES (?, ?, ?, ?)')
      .run(fixtures.testerId, 3, 'Чистый прогон чеклиста (7 пунктов, 0 ошибок)', 'auto_checklist_clean');

    const res = await request(server).get('/api/lead/internal-ratings').set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    const row = res.body.find(r => r.id === fixtures.testerId);
    expect(row.hiddenScore).toBe(8);
    expect(row.recentEvents).toHaveLength(2);
    expect(row.recentEvents.map(e => e.reason)).toEqual(expect.arrayContaining([
      'Отличный результат по лекции (95%), без признаков спешки',
      'Чистый прогон чеклиста (7 пунктов, 0 ошибок)',
    ]));
  });

  it('is lead-only', async () => {
    const res = await request(server).get('/api/lead/internal-ratings').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(403);
  });
});
