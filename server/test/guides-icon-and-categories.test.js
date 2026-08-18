// Guide icon field + bulk category rename — added alongside the Tiptap
// block editor (content itself is opaque JSON to the server, so it isn't
// re-tested here beyond round-tripping; see client/src/utils/guideContent.ts
// for the parse/fallback logic that actually interprets it).
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

describe('guide icon', () => {
  it('is stored on create and returned on the list + detail routes', async () => {
    const create = await request(server)
      .post('/api/guides')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Гайд с иконкой', category: 'Общее', content: '{"type":"doc","content":[]}', icon: '📘' });
    expect(create.status).toBe(200);
    const id = create.body.id;

    const list = await request(server).get('/api/guides').set('Authorization', `Bearer ${testerToken}`);
    expect(list.body.find((g) => g.id === id)?.icon).toBe('📘');

    const detail = await request(server).get(`/api/guides/${id}`).set('Authorization', `Bearer ${testerToken}`);
    expect(detail.body.icon).toBe('📘');
  });

  it('can be changed on update, and cleared by omitting it', async () => {
    const create = await request(server)
      .post('/api/guides')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Гайд без иконки сначала', category: 'Общее', content: '' });
    const id = create.body.id;

    await request(server)
      .put(`/api/guides/${id}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Гайд без иконки сначала', category: 'Общее', content: '', icon: '🐛' });
    expect(db.prepare('SELECT icon FROM guides WHERE id = ?').get(id).icon).toBe('🐛');

    await request(server)
      .put(`/api/guides/${id}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Гайд без иконки сначала', category: 'Общее', content: '' });
    expect(db.prepare('SELECT icon FROM guides WHERE id = ?').get(id).icon).toBeNull();
  });

  it('is capped in length rather than rejected outright', async () => {
    const longIcon = '🎉'.repeat(20); // way past MAX_ICON_LENGTH
    const create = await request(server)
      .post('/api/guides')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Гайд с длинной иконкой', category: 'Общее', content: '', icon: longIcon });
    expect(create.status).toBe(200);
    const stored = db.prepare('SELECT icon FROM guides WHERE id = ?').get(create.body.id).icon;
    expect(stored.length).toBeLessThan(longIcon.length);
  });
});

describe('guide content accepts non-JSON strings without erroring', () => {
  // The server never parses guides.content — only the client's
  // parseGuideContent does, tolerating non-JSON as a fallback. A direct API
  // call (or an older client) sending plain text must still succeed.
  it('accepts a plain-text content string', async () => {
    const res = await request(server)
      .post('/api/guides')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Старый текстовый гайд', category: 'Общее', content: 'просто текст, не JSON' });
    expect(res.status).toBe(200);
  });
});

describe('guide category rename', () => {
  let guideId;

  beforeAll(async () => {
    const create = await request(server)
      .post('/api/guides')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Гайд для переименования категории', category: 'Старая категория', content: '' });
    guideId = create.body.id;
  });

  it('a plain tester cannot rename a category', async () => {
    const res = await request(server)
      .patch('/api/guides/categories/rename')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ from: 'Старая категория', to: 'Новая категория' });
    expect(res.status).toBe(403);
  });

  it('a lead renames a category across every guide that has it', async () => {
    const res = await request(server)
      .patch('/api/guides/categories/rename')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ from: 'Старая категория', to: 'Новая категория' });
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT category FROM guides WHERE id = ?').get(guideId).category).toBe('Новая категория');
  });

  it('rejects an empty target name', async () => {
    const res = await request(server)
      .patch('/api/guides/categories/rename')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ from: 'Новая категория', to: '   ' });
    expect(res.status).toBe(400);
  });
});
