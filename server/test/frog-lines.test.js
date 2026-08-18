// The mascot's copy: corner tips, loading phrases and first-run tour steps,
// all lead-editable. See src/routes/frogLines.js.
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
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let leadToken, testerToken;

beforeAll(async () => {
  seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

describe('frog lines', () => {
  it('ships seeded copy for all three kinds, so nobody starts with a mute mascot', async () => {
    const res = await request(server).get('/api/frog-lines').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    for (const kind of ['tip', 'loader', 'tour']) {
      expect(res.body.filter(l => l.kind === kind).length).toBeGreaterThan(0);
    }
  });

  it('gives every seeded tour step a title and a target that resolves to a real element', async () => {
    const { FROG_LINE_TARGETS } = await import('../src/routes/frogLines.js');
    const res = await request(server).get('/api/frog-lines?kind=tour').set('Authorization', `Bearer ${testerToken}`);
    expect(res.body.length).toBeGreaterThan(0);
    for (const step of res.body) {
      expect(step.title).toBeTruthy();
      expect(FROG_LINE_TARGETS).toContain(step.target);
    }
  });

  it('lets a lead add, edit and delete a line', async () => {
    const created = await request(server).post('/api/frog-lines').set('Authorization', `Bearer ${leadToken}`)
      .send({ kind: 'tip', text: 'Свежий совет' });
    expect(created.status).toBe(200);
    expect(created.body.text).toBe('Свежий совет');

    const edited = await request(server).put(`/api/frog-lines/${created.body.id}`).set('Authorization', `Bearer ${leadToken}`)
      .send({ text: 'Совет получше' });
    expect(edited.body.text).toBe('Совет получше');

    const removed = await request(server).delete(`/api/frog-lines/${created.body.id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(removed.status).toBe(200);
    const after = await request(server).get('/api/frog-lines?kind=tip').set('Authorization', `Bearer ${leadToken}`);
    expect(after.body.find(l => l.id === created.body.id)).toBeUndefined();
  });

  it('reads for everyone, writes for a lead only', async () => {
    expect((await request(server).get('/api/frog-lines').set('Authorization', `Bearer ${testerToken}`)).status).toBe(200);
    const write = await request(server).post('/api/frog-lines').set('Authorization', `Bearer ${testerToken}`)
      .send({ kind: 'tip', text: 'От тестировщика' });
    expect(write.status).toBe(403);
  });

  it('refuses a tour step with no title or an unknown target — a step pointing at nothing silently skips itself', async () => {
    const noTitle = await request(server).post('/api/frog-lines').set('Authorization', `Bearer ${leadToken}`)
      .send({ kind: 'tour', text: 'Текст', target: 'nav-home' });
    expect(noTitle.status).toBe(400);

    const badTarget = await request(server).post('/api/frog-lines').set('Authorization', `Bearer ${leadToken}`)
      .send({ kind: 'tour', text: 'Текст', title: 'Шаг', target: '.some-css-selector' });
    expect(badTarget.status).toBe(400);
  });

  it('drops title/target when they are set on a kind that has no use for them', async () => {
    const res = await request(server).post('/api/frog-lines').set('Authorization', `Bearer ${leadToken}`)
      .send({ kind: 'loader', text: 'гружусь', title: 'Заголовок', target: 'nav-home' });
    expect(res.body.title).toBeNull();
    expect(res.body.target).toBeNull();
  });

  it('will not let the last tip or loader phrase be deleted', async () => {
    db.prepare("DELETE FROM frog_lines WHERE kind = 'loader'").run();
    const only = await request(server).post('/api/frog-lines').set('Authorization', `Bearer ${leadToken}`)
      .send({ kind: 'loader', text: 'единственная' });
    const res = await request(server).delete(`/api/frog-lines/${only.body.id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(400);

    // Tour steps have no such floor — a team should be able to turn the
    // first-run tour off entirely by emptying it.
    const steps = await request(server).get('/api/frog-lines?kind=tour').set('Authorization', `Bearer ${leadToken}`);
    for (const s of steps.body) {
      expect((await request(server).delete(`/api/frog-lines/${s.id}`).set('Authorization', `Bearer ${leadToken}`)).status).toBe(200);
    }
  });
});
