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

describe('suggestions board — submission', () => {
  it('rejects an unknown type', async () => {
    const res = await request(server)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'rant', text: 'x', is_anonymous: false });
    expect(res.status).toBe(400);
  });

  // 'idea' and 'suggestion' were merged into one type — 'suggestion' is no
  // longer a valid value to submit.
  it('rejects the retired "suggestion" type', async () => {
    const res = await request(server)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'suggestion', text: 'x', is_anonymous: false });
    expect(res.status).toBe(400);
  });

  it('rejects empty text', async () => {
    const res = await request(server)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'idea', text: '   ', is_anonymous: false });
    expect(res.status).toBe(400);
  });

  it('creates a public suggestion, visible with the real author to everyone', async () => {
    const create = await request(server)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'idea', text: 'Add dark mode', is_anonymous: false });
    expect(create.status).toBe(201);

    const asTester = await request(server).get('/api/suggestions').set('Authorization', `Bearer ${testerToken}`);
    const row = asTester.body.rows.find(s => s.id === create.body.id);
    expect(row.author_name).toBe('Test Tester');
    expect(row.user_id).toBe(fixtures.testerId);
    expect(row.status).toBe('new');
  });
});

describe('suggestions board — anonymity', () => {
  let anonId;

  it('an anonymous suggestion hides the author from a regular tester', async () => {
    const create = await request(server)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'complaint', text: 'The coffee machine is broken', is_anonymous: true });
    anonId = create.body.id;

    const otherReg = await request(server).post('/api/auth/register').send({
      email: 'suggestionviewer@test.local', password: 'password123', name: 'Suggestion Viewer',
    });
    const otherToken = otherReg.body.token;

    const asViewer = await request(server).get('/api/suggestions').set('Authorization', `Bearer ${otherToken}`);
    const row = asViewer.body.rows.find(s => s.id === anonId);
    expect(row.author_name).toBeNull();
    expect(row.user_id).toBeNull();
    expect(row.is_anonymous).toBe(true);
  });

  it('a lead still sees the real author of an anonymous suggestion, plus the anonymity flag', async () => {
    const res = await request(server).get('/api/suggestions').set('Authorization', `Bearer ${leadToken}`);
    const row = res.body.rows.find(s => s.id === anonId);
    expect(row.author_name).toBe('Test Tester');
    expect(row.user_id).toBe(fixtures.testerId);
    expect(row.is_anonymous).toBe(true);
  });
});

describe('suggestions board — likes and triage', () => {
  let suggestionId;

  beforeAll(async () => {
    const create = await request(server)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'idea', text: 'Move standup to 11am', is_anonymous: false });
    suggestionId = create.body.id;
  });

  it('likes toggle and are reflected per-viewer', async () => {
    const like = await request(server).post(`/api/suggestions/${suggestionId}/like`).set('Authorization', `Bearer ${leadToken}`);
    expect(like.status).toBe(200);

    let list = await request(server).get('/api/suggestions').set('Authorization', `Bearer ${leadToken}`);
    let row = list.body.rows.find(s => s.id === suggestionId);
    expect(row.likeCount).toBe(1);
    expect(row.likedByMe).toBe(true);

    list = await request(server).get('/api/suggestions').set('Authorization', `Bearer ${testerToken}`);
    row = list.body.rows.find(s => s.id === suggestionId);
    expect(row.likeCount).toBe(1);
    expect(row.likedByMe).toBe(false);

    const unlike = await request(server).delete(`/api/suggestions/${suggestionId}/like`).set('Authorization', `Bearer ${leadToken}`);
    expect(unlike.status).toBe(200);
    list = await request(server).get('/api/suggestions').set('Authorization', `Bearer ${leadToken}`);
    expect(list.body.rows.find(s => s.id === suggestionId).likeCount).toBe(0);
  });

  it('only a lead can change status', async () => {
    const asTester = await request(server)
      .patch(`/api/suggestions/${suggestionId}/status`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ status: 'reviewed' });
    expect(asTester.status).toBe(403);

    const asLead = await request(server)
      .patch(`/api/suggestions/${suggestionId}/status`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ status: 'implemented' });
    expect(asLead.status).toBe(200);

    const list = await request(server).get('/api/suggestions').set('Authorization', `Bearer ${testerToken}`);
    expect(list.body.rows.find(s => s.id === suggestionId).status).toBe('implemented');
  });

  it('a stranger (not the author, not a lead) cannot delete', async () => {
    const otherReg = await request(server).post('/api/auth/register').send({
      email: 'suggestiondeletestranger@test.local', password: 'password123', name: 'Stranger',
    });
    const res = await request(server).delete(`/api/suggestions/${suggestionId}`).set('Authorization', `Bearer ${otherReg.body.token}`);
    expect(res.status).toBe(403);
  });

  it('the author can delete their own within the edit window, and it soft-deletes (no longer listed)', async () => {
    const asAuthor = await request(server).delete(`/api/suggestions/${suggestionId}`).set('Authorization', `Bearer ${testerToken}`);
    expect(asAuthor.status).toBe(200);

    const list = await request(server).get('/api/suggestions').set('Authorization', `Bearer ${testerToken}`);
    expect(list.body.rows.find(s => s.id === suggestionId)).toBeUndefined();
  });

  it('a lead can always delete, regardless of author or window', async () => {
    const create = await request(server)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'idea', text: 'Lead-deletable idea', is_anonymous: false });
    const res = await request(server).delete(`/api/suggestions/${create.body.id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
  });
});

describe('suggestions board — 24h author edit/delete window', () => {
  let ownId;

  beforeAll(async () => {
    const create = await request(server)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'idea', text: 'Original text', is_anonymous: false });
    ownId = create.body.id;
  });

  it('the author can edit within the window', async () => {
    const res = await request(server)
      .put(`/api/suggestions/${ownId}`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'complaint', text: 'Edited text', is_anonymous: true });
    expect(res.status).toBe(200);

    const list = await request(server).get('/api/suggestions').set('Authorization', `Bearer ${leadToken}`);
    const row = list.body.rows.find(s => s.id === ownId);
    expect(row.text).toBe('Edited text');
    expect(row.type).toBe('complaint');
    expect(row.is_anonymous).toBe(true);
  });

  it('nobody else can edit it, including a lead', async () => {
    const res = await request(server)
      .put(`/api/suggestions/${ownId}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ type: 'idea', text: 'Hijacked', is_anonymous: false });
    expect(res.status).toBe(403);
  });

  it('rejects an edit past the 24h window', async () => {
    db.prepare("UPDATE suggestions SET created_at = datetime('now', '-25 hours') WHERE id = ?").run(ownId);
    const res = await request(server)
      .put(`/api/suggestions/${ownId}`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'idea', text: 'Too late', is_anonymous: false });
    expect(res.status).toBe(403);

    const del = await request(server).delete(`/api/suggestions/${ownId}`).set('Authorization', `Bearer ${testerToken}`);
    expect(del.status).toBe(403);
  });
});

describe('suggestions board — lead-only folders', () => {
  let folderId, suggestionId;

  beforeAll(async () => {
    const create = await request(server)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'idea', text: 'Needs a folder', is_anonymous: false });
    suggestionId = create.body.id;
  });

  it('is lead-only to create/list', async () => {
    const asTester = await request(server).post('/api/lead/suggestion-folders').set('Authorization', `Bearer ${testerToken}`).send({ name: 'x' });
    expect(asTester.status).toBe(403);

    const create = await request(server).post('/api/lead/suggestion-folders').set('Authorization', `Bearer ${leadToken}`).send({ name: 'Доработка сервисов' });
    expect(create.status).toBe(201);
    folderId = create.body.id;

    const list = await request(server).get('/api/lead/suggestion-folders').set('Authorization', `Bearer ${leadToken}`);
    expect(list.body.find(f => f.id === folderId)).toBeTruthy();
  });

  it('assigning a suggestion to a folder is visible to the lead but never to a tester', async () => {
    const assign = await request(server)
      .patch(`/api/suggestions/${suggestionId}/folder`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ folder_id: folderId });
    expect(assign.status).toBe(200);

    const asLead = await request(server).get('/api/suggestions').set('Authorization', `Bearer ${leadToken}`);
    const leadRow = asLead.body.rows.find(s => s.id === suggestionId);
    expect(leadRow.folder_id).toBe(folderId);
    expect(leadRow.folder_name).toBe('Доработка сервисов');

    const asTester = await request(server).get('/api/suggestions').set('Authorization', `Bearer ${testerToken}`);
    const testerRow = asTester.body.rows.find(s => s.id === suggestionId);
    expect(testerRow.folder_id).toBeUndefined();
    expect(testerRow.folder_name).toBeUndefined();
  });

  it('deleting a folder un-files its suggestions instead of deleting them', async () => {
    const del = await request(server).delete(`/api/lead/suggestion-folders/${folderId}`).set('Authorization', `Bearer ${leadToken}`);
    expect(del.status).toBe(200);

    const list = await request(server).get('/api/suggestions').set('Authorization', `Bearer ${leadToken}`);
    const row = list.body.rows.find(s => s.id === suggestionId);
    expect(row.folder_id).toBeNull();
  });
});
