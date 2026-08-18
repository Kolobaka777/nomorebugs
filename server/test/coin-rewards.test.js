// Bug-coin awards beyond the original quiz ladder: approved proposals and
// finishing a whole course. See COIN_REWARDS/awardCoins in
// src/routeHelpers.js for the amounts these assert against.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

vi.mock('../src/telegram.js', () => ({
  notifyUser: () => {},
  notifyUserConfirmed: async () => 'none',
}));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { COIN_REWARDS } = await import('../src/routeHelpers.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, leadToken, testerToken;

const coinsOf = userId =>
  db.prepare('SELECT bug_coins FROM user_profiles WHERE user_id = ?').get(userId)?.bug_coins || 0;

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

describe('coins for approved proposals', () => {
  it('pays the author when a lead approves their course, and pays it once', async () => {
    const before = coinsOf(fixtures.testerId);
    const proposal = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({
        title: 'Coin Course',
        modules: [{ title: 'M', lessons: [{ title: 'L', type: 'lesson', content: 'x', prerequisite_type: 'none' }] }],
      });
    expect(proposal.status).toBe(200);

    await request(server).patch(`/api/custom-courses/${proposal.body.id}/publish`).set('Authorization', `Bearer ${leadToken}`);
    expect(coinsOf(fixtures.testerId)).toBe(before + COIN_REWARDS.proposalCourse);

    // Unpublishing and republishing is not a second approval — proposal_status
    // is already 'approved', so there's no pending transition left to pay for.
    await request(server).patch(`/api/custom-courses/${proposal.body.id}/publish`).set('Authorization', `Bearer ${leadToken}`);
    await request(server).patch(`/api/custom-courses/${proposal.body.id}/publish`).set('Authorization', `Bearer ${leadToken}`);
    expect(coinsOf(fixtures.testerId)).toBe(before + COIN_REWARDS.proposalCourse);
  });

  it('pays for an approved guide, bug example and glossary term', async () => {
    const before = coinsOf(fixtures.testerId);

    const guide = await request(server).post('/api/guides').set('Authorization', `Bearer ${testerToken}`)
      .send({ title: 'Coin Guide', category: 'Общее', content: 'body' });
    await request(server).patch(`/api/guides/${guide.body.id}/approve`).set('Authorization', `Bearer ${leadToken}`);

    const example = await request(server).post('/api/bug-examples').set('Authorization', `Bearer ${testerToken}`)
      .send({ tag: 'UI', tag_color: '#fff', problem: 'p', bad_text: 'bad', good_text: 'good' });
    await request(server).patch(`/api/bug-examples/${example.body.id}/approve`).set('Authorization', `Bearer ${leadToken}`);

    const term = await request(server).post('/api/glossary').set('Authorization', `Bearer ${testerToken}`)
      .send({ term: 'Coin Term', definition: 'd' });
    await request(server).patch(`/api/glossary/${term.body.id}/approve`).set('Authorization', `Bearer ${leadToken}`);

    expect(coinsOf(fixtures.testerId)).toBe(
      before + COIN_REWARDS.proposalGuide + COIN_REWARDS.proposalBugExample + COIN_REWARDS.proposalGlossary
    );
  });

  it('pays nothing when the approver is the author — otherwise the reward is self-serve for anyone holding the permission', async () => {
    const before = coinsOf(fixtures.leadId);
    const guide = await request(server).post('/api/guides').set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Self Guide', category: 'Общее', content: 'body' });
    // A lead's own guide publishes directly, so force it through the same
    // pending → approve path a tester's would take.
    db.prepare("UPDATE guides SET is_published = 0, proposal_status = 'pending' WHERE id = ?").run(guide.body.id);
    const res = await request(server).patch(`/api/guides/${guide.body.id}/approve`).set('Authorization', `Bearer ${leadToken}`);
    // Assert the approval actually went through, so "no coins" is a real
    // result and not this test quietly skipping the code path.
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT proposal_status FROM guides WHERE id = ?').get(guide.body.id).proposal_status).toBe('approved');
    expect(coinsOf(fixtures.leadId)).toBe(before);
  });
});

describe('coins for finishing a course', () => {
  async function makeCourse(lessonCount) {
    const res = await request(server).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`)
      .send({
        title: `Finish Course ${lessonCount}`,
        modules: [{
          title: 'M',
          lessons: Array.from({ length: lessonCount }, (_, i) => ({
            title: `L${i}`, type: 'lesson', content: 'x', prerequisite_type: 'none',
          })),
        }],
      });
    const lessonIds = db.prepare(`
      SELECT l.id FROM custom_lessons l JOIN custom_modules m ON m.id = l.module_id WHERE m.course_id = ?
    `).all(res.body.id).map(r => r.id);
    return { courseId: res.body.id, lessonIds };
  }

  it('pays once when every lesson is done', async () => {
    const { courseId, lessonIds } = await makeCourse(2);
    for (const id of lessonIds) {
      await request(server).post(`/api/custom-lessons/${id}/complete`).set('Authorization', `Bearer ${testerToken}`);
    }
    const before = coinsOf(fixtures.testerId);

    await request(server).post('/api/courses/time-track').set('Authorization', `Bearer ${testerToken}`)
      .send({ course_id: courseId, seconds_spent: 60 });
    expect(coinsOf(fixtures.testerId)).toBe(before + COIN_REWARDS.courseCompleted);

    // The route upserts, so it can legitimately be called again with an
    // updated time — that must not pay a second time.
    await request(server).post('/api/courses/time-track').set('Authorization', `Bearer ${testerToken}`)
      .send({ course_id: courseId, seconds_spent: 120 });
    expect(coinsOf(fixtures.testerId)).toBe(before + COIN_REWARDS.courseCompleted);
  });

  it('pays nothing when the lessons are not actually done — the request body cannot vouch for itself', async () => {
    const { courseId, lessonIds } = await makeCourse(3);
    await request(server).post(`/api/custom-lessons/${lessonIds[0]}/complete`).set('Authorization', `Bearer ${testerToken}`);
    const before = coinsOf(fixtures.testerId);

    const res = await request(server).post('/api/courses/time-track').set('Authorization', `Bearer ${testerToken}`)
      .send({ course_id: courseId, seconds_spent: 60 });
    expect(res.status).toBe(200); // the time report itself is still recorded
    expect(coinsOf(fixtures.testerId)).toBe(before);
  });
});
