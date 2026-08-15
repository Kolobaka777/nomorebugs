// Two independent-but-related additions: (1) bug-example and glossary-term
// proposals for the Багодельня knowledge base, mirroring the course/guide
// proposal flow in proposals.test.js; (2) 'question' suggestions with a
// lead-answered reply on the ideas board. See routes/knowledge.js and
// routes/suggestions.js.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

// See proposals.test.js for why this is mocked rather than left as the
// real (silent-in-tests) implementation.
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
  await request(app).post('/api/auth/register').send({ email: 'other-kb-tester@test.local', password: 'otherpass123', name: 'Other Tester' });
  otherTesterToken = await loginAs(request, app, 'other-kb-tester@test.local', 'otherpass123');
});

describe('bug-example proposals', () => {
  let proposalId;
  it('a tester proposing a bug example gets a pending, unpublished row, invisible to an unrelated tester', async () => {
    const res = await request(app)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ tag: 'Визуал', problem: 'Кнопка не по макету', bad_text: 'bad', good_text: 'good' });
    expect(res.status).toBe(200);
    proposalId = res.body.id;

    const row = db.prepare('SELECT is_published, proposal_status, created_by FROM bug_examples WHERE id = ?').get(proposalId);
    expect(row.is_published).toBe(0);
    expect(row.proposal_status).toBe('pending');
    expect(row.created_by).toBe(fixtures.testerId);

    const otherList = await request(app).get('/api/bug-examples').set('Authorization', `Bearer ${otherTesterToken}`);
    expect(otherList.body.find(e => e.id === proposalId)).toBeUndefined();

    const ownList = await request(app).get('/api/bug-examples').set('Authorization', `Bearer ${testerToken}`);
    expect(ownList.body.find(e => e.id === proposalId)).toBeTruthy();

    const leadList = await request(app).get('/api/bug-examples').set('Authorization', `Bearer ${leadToken}`);
    const inLeadList = leadList.body.find(e => e.id === proposalId);
    expect(inLeadList).toBeTruthy();
    expect(inLeadList.author_name).toBe('Test Tester');
  });

  it('a lead approving it publishes the example for everyone', async () => {
    const res = await request(app).patch(`/api/bug-examples/${proposalId}/approve`).set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);

    const row = db.prepare('SELECT is_published, proposal_status FROM bug_examples WHERE id = ?').get(proposalId);
    expect(row.is_published).toBe(1);
    expect(row.proposal_status).toBe('approved');

    const otherList = await request(app).get('/api/bug-examples').set('Authorization', `Bearer ${otherTesterToken}`);
    expect(otherList.body.find(e => e.id === proposalId)).toBeTruthy();

    // The author gets notified — used to be silent (2026-08-15 audit).
    const approveCall = notifyUserMock.mock.calls.find(c => c[1] === 'Пример одобрен!');
    expect(approveCall).toBeDefined();
    expect(approveCall[0].id).toBe(fixtures.testerId);
  });

  it('a lead declining a proposal soft-deletes it, stamps proposal_status=rejected, and notifies the author', async () => {
    notifyUserMock.mockClear();
    const created = await request(app)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ problem: 'To decline', bad_text: 'bad', good_text: 'good' });
    const id = created.body.id;

    const del = await request(app).delete(`/api/bug-examples/${id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(del.status).toBe(200);

    const row = db.prepare('SELECT deleted_at, proposal_status FROM bug_examples WHERE id = ?').get(id);
    expect(row.deleted_at).not.toBeNull();
    expect(row.proposal_status).toBe('rejected');

    const declineCall = notifyUserMock.mock.calls.find(c => c[1] === 'Пример отклонён');
    expect(declineCall).toBeDefined();
    expect(declineCall[0].id).toBe(fixtures.testerId);
  });

  it('a tester cannot approve their own or anyone else\'s proposal', async () => {
    const created = await request(app)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ problem: 'No self-approve', bad_text: 'bad', good_text: 'good' });
    const res = await request(app).patch(`/api/bug-examples/${created.body.id}/approve`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(403);
  });

  it('approving something that is not a pending proposal is rejected', async () => {
    const created = await request(app)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ problem: 'Already live', bad_text: 'bad', good_text: 'good' });
    const res = await request(app).patch(`/api/bug-examples/${created.body.id}/approve`).set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(400);
  });

  it('seeded bug examples (created_by NULL) still appear in every list — a LEFT JOIN, not an inner join, on the author', async () => {
    // schema.js auto-seeds one bug example with created_by=NULL on a fresh DB.
    const seeded = db.prepare("SELECT id FROM bug_examples WHERE created_by IS NULL AND deleted_at IS NULL").get();
    expect(seeded).toBeTruthy();
    const list = await request(app).get('/api/bug-examples').set('Authorization', `Bearer ${otherTesterToken}`);
    expect(list.body.find(e => e.id === seeded.id)).toBeTruthy();
  });
});

describe('glossary-term proposals', () => {
  let proposalId;
  it('a tester proposing a term gets a pending, unpublished row; approving it publishes for everyone', async () => {
    const created = await request(app)
      .post('/api/glossary')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ term: 'Flaky', definition: 'Nondeterministic test result' });
    expect(created.status).toBe(200);
    proposalId = created.body.id;

    const row = db.prepare('SELECT is_published, proposal_status FROM glossary_terms WHERE id = ?').get(proposalId);
    expect(row.is_published).toBe(0);
    expect(row.proposal_status).toBe('pending');

    const otherList = await request(app).get('/api/glossary').set('Authorization', `Bearer ${otherTesterToken}`);
    expect(otherList.body.find(g => g.id === proposalId)).toBeUndefined();

    notifyUserMock.mockClear();
    const approve = await request(app).patch(`/api/glossary/${proposalId}/approve`).set('Authorization', `Bearer ${leadToken}`);
    expect(approve.status).toBe(200);

    const nowVisible = await request(app).get('/api/glossary').set('Authorization', `Bearer ${otherTesterToken}`);
    expect(nowVisible.body.find(g => g.id === proposalId)).toBeTruthy();

    // The author gets notified — used to be silent (2026-08-15 audit).
    const approveCall = notifyUserMock.mock.calls.find(c => c[1] === 'Термин одобрен!');
    expect(approveCall).toBeDefined();
    expect(approveCall[0].id).toBe(fixtures.testerId);
  });

  it('seeded glossary terms (created_by NULL) still appear in every list', async () => {
    const seeded = db.prepare("SELECT id FROM glossary_terms WHERE created_by IS NULL AND deleted_at IS NULL").get();
    expect(seeded).toBeTruthy();
    const list = await request(app).get('/api/glossary').set('Authorization', `Bearer ${otherTesterToken}`);
    expect(list.body.find(g => g.id === seeded.id)).toBeTruthy();
  });

  it('declining a term proposal soft-deletes it and stamps proposal_status=rejected', async () => {
    const created = await request(app)
      .post('/api/glossary')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ term: 'To decline', definition: 'x' });
    const id = created.body.id;
    const del = await request(app).delete(`/api/glossary/${id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(del.status).toBe(200);
    const row = db.prepare('SELECT deleted_at, proposal_status FROM glossary_terms WHERE id = ?').get(id);
    expect(row.deleted_at).not.toBeNull();
    expect(row.proposal_status).toBe('rejected');
  });
});

describe('questions on the suggestions board', () => {
  let questionId;
  it('a tester can post a question; it is visible to everyone, unanswered', async () => {
    const res = await request(app)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'question', text: 'Как сбросить пароль?', is_anonymous: false });
    expect(res.status).toBe(201);
    questionId = res.body.id;

    const list = await request(app).get('/api/suggestions').set('Authorization', `Bearer ${otherTesterToken}`);
    const row = list.body.rows.find(s => s.id === questionId);
    expect(row).toBeTruthy();
    expect(row.answer).toBeNull();
  });

  it('a plain tester cannot answer a question', async () => {
    const res = await request(app)
      .patch(`/api/suggestions/${questionId}/answer`)
      .set('Authorization', `Bearer ${otherTesterToken}`)
      .send({ answer: 'Not allowed' });
    expect(res.status).toBe(403);
  });

  it('a lead can answer, and the answer (with the answerer\'s name) becomes visible to everyone, including the asker', async () => {
    const res = await request(app)
      .patch(`/api/suggestions/${questionId}/answer`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ answer: 'Через "Забыли пароль" на странице входа' });
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/suggestions').set('Authorization', `Bearer ${otherTesterToken}`);
    const row = list.body.rows.find(s => s.id === questionId);
    expect(row.answer).toBe('Через "Забыли пароль" на странице входа');
    expect(row.answered_by_name).toBe('Test Lead');
  });

  it('answering a non-question suggestion is rejected', async () => {
    const idea = await request(app)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'idea', text: 'Add dark mode', is_anonymous: false });
    const res = await request(app)
      .patch(`/api/suggestions/${idea.body.id}/answer`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ answer: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects answering with empty text', async () => {
    const q = await request(app)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'question', text: 'Another question', is_anonymous: false });
    const res = await request(app)
      .patch(`/api/suggestions/${q.body.id}/answer`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ answer: '   ' });
    expect(res.status).toBe(400);
  });
});
