// Course/guide proposals: a tester can submit a full course or guide that
// only goes live once a lead approves it. See routes/courses.js and
// routes/knowledge.js for the implementation this exercises.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

// Mocked so the 2026-08-15 "notify the author on approve/reject" wiring
// (routes/courses.js, routes/knowledge.js) is actually verifiable —
// notifyUser is otherwise a silent no-op in tests (no bot token/SMTP
// configured), so without this mock a missing/broken call would pass
// unnoticed.
const notifyUserMock = vi.fn();
vi.mock('../src/telegram.js', () => ({
  notifyUser: (...args) => notifyUserMock(...args),
  notifyUserConfirmed: async () => 'none',
}));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let fixtures, leadToken, testerToken, otherTesterToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
  await request(app).post('/api/auth/register').send({ email: 'other-proposal-tester@test.local', password: 'otherpass123', name: 'Other Tester' });
  otherTesterToken = await loginAs(request, app, 'other-proposal-tester@test.local', 'otherpass123');
});

function validCourseBody(overrides = {}) {
  return {
    title: 'Proposed Course',
    modules: [{
      title: 'Module 1',
      lessons: [{ title: 'Lesson 1', type: 'lesson', content: 'intro', prerequisite_type: 'none' }],
    }],
    ...overrides,
  };
}

describe('course proposals', () => {
  it('rejects an incomplete proposal — unlike a lead\'s WIP draft, a submission must already be structurally valid', async () => {
    const res = await request(app)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ title: 'Half-finished', modules: [] });
    expect(res.status).toBe(400);
  });

  let proposalId;
  it('a tester submitting a valid course gets a pending, unpublished row', async () => {
    const res = await request(app).post('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`).send(validCourseBody());
    expect(res.status).toBe(200);
    proposalId = res.body.id;
    const row = db.prepare('SELECT is_published, proposal_status, created_by FROM custom_courses WHERE id = ?').get(proposalId);
    expect(row.is_published).toBe(0);
    expect(row.proposal_status).toBe('pending');
    expect(row.created_by).toBe(fixtures.testerId);
  });

  it('is invisible to an unrelated tester, visible to its own author, and visible in the lead\'s review queue', async () => {
    const otherList = await request(app).get('/api/custom-courses').set('Authorization', `Bearer ${otherTesterToken}`);
    expect(otherList.body.find(c => c.id === proposalId)).toBeUndefined();

    const ownList = await request(app).get('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`);
    expect(ownList.body.find(c => c.id === proposalId)).toBeTruthy();

    const leadList = await request(app).get('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`);
    const inLeadList = leadList.body.find(c => c.id === proposalId);
    expect(inLeadList).toBeTruthy();
    expect(inLeadList.author_name).toBe('Test Tester');

    const otherDetail = await request(app).get(`/api/custom-courses/${proposalId}`).set('Authorization', `Bearer ${otherTesterToken}`);
    expect(otherDetail.status).toBe(403);
  });

  it('a lead approving it publishes the course and credits the news event to the original author', async () => {
    const res = await request(app).patch(`/api/custom-courses/${proposalId}/publish`).set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    expect(res.body.is_published).toBe(1);

    const row = db.prepare('SELECT is_published, proposal_status FROM custom_courses WHERE id = ?').get(proposalId);
    expect(row.is_published).toBe(1);
    expect(row.proposal_status).toBe('approved');

    const event = db.prepare("SELECT user_id FROM team_events WHERE event_type = 'course_published' AND ref_id = ?").get(proposalId);
    expect(event.user_id).toBe(fixtures.testerId);

    // Now visible to everyone, like any other published course.
    const otherList = await request(app).get('/api/custom-courses').set('Authorization', `Bearer ${otherTesterToken}`);
    expect(otherList.body.find(c => c.id === proposalId)).toBeTruthy();

    // The author gets notified — used to be silent (2026-08-15 audit).
    const approveCall = notifyUserMock.mock.calls.find(c => c[1] === 'Курс одобрен!');
    expect(approveCall).toBeDefined();
    expect(approveCall[0].id).toBe(fixtures.testerId);
    expect(approveCall[2]).toContain('Proposed Course');
  });

  let declinedId;
  it('a lead declining a proposal soft-deletes it, stamps proposal_status=rejected, and notifies the author', async () => {
    notifyUserMock.mockClear();
    const created = await request(app).post('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`).send(validCourseBody({ title: 'To be declined' }));
    declinedId = created.body.id;

    const del = await request(app).delete(`/api/custom-courses/${declinedId}`).set('Authorization', `Bearer ${leadToken}`);
    expect(del.status).toBe(200);

    const row = db.prepare('SELECT deleted_at, proposal_status FROM custom_courses WHERE id = ?').get(declinedId);
    expect(row.deleted_at).not.toBeNull();
    expect(row.proposal_status).toBe('rejected');

    // Gone from every list, including the author's own.
    const ownList = await request(app).get('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`);
    expect(ownList.body.find(c => c.id === declinedId)).toBeUndefined();

    const declineCall = notifyUserMock.mock.calls.find(c => c[1] === 'Курс отклонён');
    expect(declineCall).toBeDefined();
    expect(declineCall[0].id).toBe(fixtures.testerId);
    expect(declineCall[2]).toContain('To be declined');
  });

  it('a tester still cannot directly edit, delete, or publish a course — proposing is a one-shot submission', async () => {
    const created = await request(app).post('/api/custom-courses').set('Authorization', `Bearer ${testerToken}`).send(validCourseBody({ title: 'No self-edit' }));
    const id = created.body.id;

    const put = await request(app).put(`/api/custom-courses/${id}`).set('Authorization', `Bearer ${testerToken}`).send(validCourseBody({ title: 'Edited by author' }));
    expect(put.status).toBe(403);

    const del = await request(app).delete(`/api/custom-courses/${id}`).set('Authorization', `Bearer ${testerToken}`);
    expect(del.status).toBe(403);
  });

  it('a lead still cannot manage another lead\'s ordinary (non-proposal) course they did not author', async () => {
    await request(app).post('/api/auth/register').send({ email: 'second-lead-proposals@test.local', password: 'leadpass123', name: 'Second Lead' });
    // Promote to lead directly — registration only ever creates testers.
    db.prepare("UPDATE users SET role = 'lead' WHERE email = 'second-lead-proposals@test.local'").run();
    const secondLeadToken = await loginAs(request, app, 'second-lead-proposals@test.local', 'leadpass123');

    const ownCourse = await request(app).post('/api/custom-courses').set('Authorization', `Bearer ${secondLeadToken}`).send(validCourseBody({ title: 'Second lead\'s own course' }));
    expect(ownCourse.status).toBe(200);

    const blocked = await request(app).delete(`/api/custom-courses/${ownCourse.body.id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(blocked.status).toBe(403);
  });
});

describe('guide proposals', () => {
  let guideId;
  it('a tester proposing a guide gets a pending, unpublished row; approving it publishes and credits the author', async () => {
    const created = await request(app)
      .post('/api/guides')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ title: 'Proposed Guide', category: 'Общее', content: 'Some content' });
    expect(created.status).toBe(200);
    guideId = created.body.id;

    const row = db.prepare('SELECT is_published, proposal_status, created_by FROM guides WHERE id = ?').get(guideId);
    expect(row.is_published).toBe(0);
    expect(row.proposal_status).toBe('pending');

    const otherDetail = await request(app).get(`/api/guides/${guideId}`).set('Authorization', `Bearer ${otherTesterToken}`);
    expect(otherDetail.status).toBe(403);

    const leadList = await request(app).get('/api/guides').set('Authorization', `Bearer ${leadToken}`);
    const inList = leadList.body.find(g => g.id === guideId);
    expect(inList).toBeTruthy();
    expect(inList.proposal_status).toBe('pending');

    const approve = await request(app).patch(`/api/guides/${guideId}/approve`).set('Authorization', `Bearer ${leadToken}`);
    expect(approve.status).toBe(200);

    const afterRow = db.prepare('SELECT is_published, proposal_status FROM guides WHERE id = ?').get(guideId);
    expect(afterRow.is_published).toBe(1);
    expect(afterRow.proposal_status).toBe('approved');

    const event = db.prepare("SELECT user_id FROM team_events WHERE event_type = 'guide_published' AND ref_id = ?").get(guideId);
    expect(event.user_id).toBe(fixtures.testerId);

    const nowVisible = await request(app).get(`/api/guides/${guideId}`).set('Authorization', `Bearer ${otherTesterToken}`);
    expect(nowVisible.status).toBe(200);

    // The author gets notified — used to be silent (2026-08-15 audit).
    const approveCall = notifyUserMock.mock.calls.find(c => c[1] === 'Гайд одобрен!');
    expect(approveCall).toBeDefined();
    expect(approveCall[0].id).toBe(fixtures.testerId);
    expect(approveCall[2]).toContain('Proposed Guide');
  });

  it('declining a guide proposal soft-deletes it, stamps proposal_status=rejected, and notifies the author', async () => {
    notifyUserMock.mockClear();
    const created = await request(app)
      .post('/api/guides')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ title: 'To decline', category: 'Общее', content: 'x' });
    const id = created.body.id;

    const del = await request(app).delete(`/api/guides/${id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(del.status).toBe(200);

    const row = db.prepare('SELECT deleted_at, proposal_status FROM guides WHERE id = ?').get(id);
    expect(row.deleted_at).not.toBeNull();
    expect(row.proposal_status).toBe('rejected');

    const declineCall = notifyUserMock.mock.calls.find(c => c[1] === 'Гайд отклонён');
    expect(declineCall).toBeDefined();
    expect(declineCall[0].id).toBe(fixtures.testerId);
    expect(declineCall[2]).toContain('To decline');
  });

  it('rejects approving something that is not a pending proposal', async () => {
    const res = await request(app).patch(`/api/guides/${guideId}/approve`).set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(400);
  });
});

describe('proposal counts on profile', () => {
  it('counts every proposal a tester has ever submitted, and separately how many were approved', async () => {
    const res = await request(app).get('/api/tester/profile-full').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    // From the tests above: 3 course proposals (1 approved, 1 declined, 1
    // left pending) + 2 guide proposals (1 approved, 1 declined).
    expect(res.body.coursesProposed).toBe(3);
    expect(res.body.coursesApproved).toBe(1);
    expect(res.body.guidesProposed).toBe(2);
    expect(res.body.guidesApproved).toBe(1);
  });

  // "Мои предложения" is an explicitly owner-only panel in MoyaNora
  // (matches bug_coins/purchased_items/bookmarks/premium-points in being
  // treated as personal, not "how's this person doing" — see the
  // stripping comment in profile.js) — a colleague's own view of someone
  // else's public profile should not include these counts at all.
  it('proposal counts are NOT visible to a colleague on the tester\'s public profile, but a lead still sees them', async () => {
    const colleagueView = await request(app).get(`/api/users/${fixtures.testerId}/profile`).set('Authorization', `Bearer ${otherTesterToken}`);
    expect(colleagueView.status).toBe(200);
    expect(colleagueView.body.coursesProposed).toBeUndefined();
    expect(colleagueView.body.guidesProposed).toBeUndefined();

    const leadView = await request(app).get(`/api/users/${fixtures.testerId}/profile`).set('Authorization', `Bearer ${leadToken}`);
    expect(leadView.status).toBe(200);
    expect(leadView.body.coursesProposed).toBe(3);
    expect(leadView.body.guidesProposed).toBe(2);
  });
});
