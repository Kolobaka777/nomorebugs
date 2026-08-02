import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let fixtures, testerToken, leadToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
});

describe('suggestions board — submission', () => {
  it('rejects an unknown type', async () => {
    const res = await request(app)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'rant', text: 'x', is_anonymous: false });
    expect(res.status).toBe(400);
  });

  it('rejects empty text', async () => {
    const res = await request(app)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'idea', text: '   ', is_anonymous: false });
    expect(res.status).toBe(400);
  });

  it('creates a public suggestion, visible with the real author to everyone', async () => {
    const create = await request(app)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'idea', text: 'Add dark mode', is_anonymous: false });
    expect(create.status).toBe(201);

    const asTester = await request(app).get('/api/suggestions').set('Authorization', `Bearer ${testerToken}`);
    const row = asTester.body.find(s => s.id === create.body.id);
    expect(row.author_name).toBe('Test Tester');
    expect(row.user_id).toBe(fixtures.testerId);
    expect(row.status).toBe('new');
  });
});

describe('suggestions board — anonymity', () => {
  let anonId;

  it('an anonymous suggestion hides the author from a regular tester', async () => {
    const create = await request(app)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'complaint', text: 'The coffee machine is broken', is_anonymous: true });
    anonId = create.body.id;

    const otherReg = await request(app).post('/api/auth/register').send({
      email: 'suggestionviewer@test.local', password: 'password123', name: 'Suggestion Viewer',
    });
    const otherToken = otherReg.body.token;

    const asViewer = await request(app).get('/api/suggestions').set('Authorization', `Bearer ${otherToken}`);
    const row = asViewer.body.find(s => s.id === anonId);
    expect(row.author_name).toBeNull();
    expect(row.user_id).toBeNull();
    expect(row.is_anonymous).toBe(true);
  });

  it('a lead still sees the real author of an anonymous suggestion, plus the anonymity flag', async () => {
    const res = await request(app).get('/api/suggestions').set('Authorization', `Bearer ${leadToken}`);
    const row = res.body.find(s => s.id === anonId);
    expect(row.author_name).toBe('Test Tester');
    expect(row.user_id).toBe(fixtures.testerId);
    expect(row.is_anonymous).toBe(true);
  });
});

describe('suggestions board — likes and triage', () => {
  let suggestionId;

  beforeAll(async () => {
    const create = await request(app)
      .post('/api/suggestions')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'suggestion', text: 'Move standup to 11am', is_anonymous: false });
    suggestionId = create.body.id;
  });

  it('likes toggle and are reflected per-viewer', async () => {
    const like = await request(app).post(`/api/suggestions/${suggestionId}/like`).set('Authorization', `Bearer ${leadToken}`);
    expect(like.status).toBe(200);

    let list = await request(app).get('/api/suggestions').set('Authorization', `Bearer ${leadToken}`);
    let row = list.body.find(s => s.id === suggestionId);
    expect(row.likeCount).toBe(1);
    expect(row.likedByMe).toBe(true);

    list = await request(app).get('/api/suggestions').set('Authorization', `Bearer ${testerToken}`);
    row = list.body.find(s => s.id === suggestionId);
    expect(row.likeCount).toBe(1);
    expect(row.likedByMe).toBe(false);

    const unlike = await request(app).delete(`/api/suggestions/${suggestionId}/like`).set('Authorization', `Bearer ${leadToken}`);
    expect(unlike.status).toBe(200);
    list = await request(app).get('/api/suggestions').set('Authorization', `Bearer ${leadToken}`);
    expect(list.body.find(s => s.id === suggestionId).likeCount).toBe(0);
  });

  it('only a lead can change status', async () => {
    const asTester = await request(app)
      .patch(`/api/suggestions/${suggestionId}/status`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ status: 'reviewed' });
    expect(asTester.status).toBe(403);

    const asLead = await request(app)
      .patch(`/api/suggestions/${suggestionId}/status`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ status: 'implemented' });
    expect(asLead.status).toBe(200);

    const list = await request(app).get('/api/suggestions').set('Authorization', `Bearer ${testerToken}`);
    expect(list.body.find(s => s.id === suggestionId).status).toBe('implemented');
  });

  it('only a lead can delete, and it soft-deletes (no longer listed)', async () => {
    const asTester = await request(app).delete(`/api/suggestions/${suggestionId}`).set('Authorization', `Bearer ${testerToken}`);
    expect(asTester.status).toBe(403);

    const asLead = await request(app).delete(`/api/suggestions/${suggestionId}`).set('Authorization', `Bearer ${leadToken}`);
    expect(asLead.status).toBe(200);

    const list = await request(app).get('/api/suggestions').set('Authorization', `Bearer ${testerToken}`);
    expect(list.body.find(s => s.id === suggestionId)).toBeUndefined();
  });
});
