// The shared avatar gallery: the one place an ordinary tester puts megabytes
// into the database. Capping the size of a single picture was not enough —
// nothing capped how many of them there could be.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

vi.mock('../src/telegram.js', () => ({ notifyUser: () => {}, notifyUserConfirmed: async () => 'none' }));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, testerToken, leadToken;

const png = (size = 100) => 'data:image/png;base64,' + 'A'.repeat(size);
const publish = (token, image) =>
  request(server).post('/api/tester/avatar/gallery').set('Authorization', `Bearer ${token}`).send({ image });

beforeAll(async () => {
  fixtures = seedTestData(db);
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
});

beforeEach(() => { db.prepare('DELETE FROM custom_avatars').run(); });

describe('how many can be published', () => {
  it('stops accepting once one person has enough of their own', async () => {
    // This used to accept as many in a row as were offered. At 2.8 MB a
    // picture and 300 writes per fifteen minutes, that is hundreds of
    // megabytes onto the volume holding the live database and all 28 backup
    // rotations.
    let accepted = 0;
    for (let i = 0; i < 30; i++) {
      const res = await publish(testerToken, png());
      if (res.status !== 200) break;
      accepted++;
    }

    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThan(30);
    expect(db.prepare('SELECT COUNT(*) c FROM custom_avatars WHERE user_id = ?').get(fixtures.testerId).c).toBe(accepted);
  });

  it('explains the refusal rather than just refusing', async () => {
    let last;
    for (let i = 0; i < 30; i++) {
      last = await publish(testerToken, png());
      if (last.status !== 200) break;
    }
    expect(last.status).toBe(400);
    expect(last.body.error).toMatch(/не больше .* картинок/);
  });

  it('counts per person, so somebody else does not use up your room', async () => {
    for (let i = 0; i < 30; i++) {
      if ((await publish(testerToken, png())).status !== 200) break;
    }
    // The lead has published nothing.
    expect((await publish(leadToken, png())).status).toBe(200);
  });

  it('frees a slot when one of your own is deleted', async () => {
    let lastId = null;
    for (let i = 0; i < 30; i++) {
      const res = await publish(testerToken, png());
      if (res.status !== 200) break;
      lastId = res.body.id;
    }
    expect((await publish(testerToken, png())).status).toBe(400);

    await request(server).delete(`/api/tester/avatar/gallery/${lastId}`).set('Authorization', `Bearer ${testerToken}`);
    expect((await publish(testerToken, png())).status).toBe(200);
  });
});

describe('what counts as a picture', () => {
  it('refuses arbitrary text', async () => {
    // The serving route already answers 415 for a non-image, so such a
    // payload could never be displayed — it was pure stored weight and a
    // broken tile in the gallery for the whole team.
    const res = await publish(testerToken, 'not a picture at all, just text');
    expect(res.status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) c FROM custom_avatars').get().c).toBe(0);
  });

  it('refuses a data URI that is not an image', async () => {
    expect((await publish(testerToken, 'data:text/html;base64,PHNjcmlwdD4=')).status).toBe(400);
  });

  it('accepts a real image data URI', async () => {
    expect((await publish(testerToken, png())).status).toBe(200);
  });

  it('serves back as an image whatever it accepted', async () => {
    const { body } = await publish(testerToken, png());
    const res = await request(server).get(`/api/avatars/gallery/${body.id}/image`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\/png/);
  });
});
