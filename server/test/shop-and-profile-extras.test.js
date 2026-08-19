// Regression coverage for the 2026-08-15 audit finding: the shop (spends
// bug_coins, a real money-adjacent balance), favorites, notes, and avatar
// gallery routes (all added in commit dcbbb43, "Магазин, избранное,
// заметки и аккаунт в профиле") shipped with zero server tests. See
// routes/tester.js (shop) and routes/profile.js (favorites/notes/gallery).
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, testerToken, otherTesterToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
  await request(server).post('/api/auth/register').send({ email: 'other-extras-tester@test.local', password: 'otherpass123', name: 'Other Tester' });
  otherTesterToken = await loginAs(request, server, 'other-extras-tester@test.local', 'otherpass123');
});

describe('POST /api/tester/shop/buy', () => {
  it('rejects an unknown item', async () => {
    const res = await request(server).post('/api/tester/shop/buy').set('Authorization', `Bearer ${testerToken}`).send({ item_id: 'not_a_real_item' });
    expect(res.status).toBe(400);
  });

  it('rejects a purchase with insufficient coins (fresh tester has 0)', async () => {
    const res = await request(server).post('/api/tester/shop/buy').set('Authorization', `Bearer ${otherTesterToken}`).send({ item_id: 'bg_hive' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Недостаточно/);
  });

  it('a purchase succeeds, deducts the exact cost, and marks the item purchased', async () => {
    // seedTestData never creates a user_profiles row — upsert one so this
    // test can assert an exact starting/resulting balance.
    db.prepare(
      'INSERT INTO user_profiles (user_id, bug_coins) VALUES (?, 200) ON CONFLICT(user_id) DO UPDATE SET bug_coins = 200'
    ).run(fixtures.testerId);

    const res = await request(server).post('/api/tester/shop/buy').set('Authorization', `Bearer ${testerToken}`).send({ item_id: 'bg_hive' }); // cost 150
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.newCoins).toBe(50);

    const row = db.prepare('SELECT bug_coins, purchased_items FROM user_profiles WHERE user_id = ?').get(fixtures.testerId);
    expect(row.bug_coins).toBe(50);
    expect(JSON.parse(row.purchased_items)).toContain('bg_hive');
  });

  it('rejects buying the same item twice, without charging coins again', async () => {
    const before = db.prepare('SELECT bug_coins FROM user_profiles WHERE user_id = ?').get(fixtures.testerId).bug_coins;
    const res = await request(server).post('/api/tester/shop/buy').set('Authorization', `Bearer ${testerToken}`).send({ item_id: 'bg_hive' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Уже куплено/);
    const after = db.prepare('SELECT bug_coins FROM user_profiles WHERE user_id = ?').get(fixtures.testerId).bug_coins;
    expect(after).toBe(before);
  });

  it('a second, different item is charged independently and both stay in purchased_items', async () => {
    // Balance is 50 from the earlier test — top up so this one (cost 120) can afford it.
    db.prepare('UPDATE user_profiles SET bug_coins = 170 WHERE user_id = ?').run(fixtures.testerId);
    expect(db.prepare('SELECT bug_coins FROM user_profiles WHERE user_id = ?').get(fixtures.testerId).bug_coins).toBe(170);
    const res = await request(server).post('/api/tester/shop/buy').set('Authorization', `Bearer ${testerToken}`).send({ item_id: 'avatar_frog1' }); // cost 120
    expect(res.status).toBe(200);
    expect(res.body.newCoins).toBe(50);
    const purchased = JSON.parse(db.prepare('SELECT purchased_items FROM user_profiles WHERE user_id = ?').get(fixtures.testerId).purchased_items);
    expect(purchased).toEqual(expect.arrayContaining(['bg_hive', 'avatar_frog1']));
  });
});

describe('favorites', () => {
  it('starts empty', async () => {
    const res = await request(server).get('/api/tester/favorites').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('rejects an invalid course_type', async () => {
    const res = await request(server).post('/api/tester/favorites').set('Authorization', `Bearer ${testerToken}`).send({ course_type: 'nonsense', course_id: fixtures.lec1Id });
    expect(res.status).toBe(400);
  });

  it('rejects favoriting a lecture that does not exist', async () => {
    const res = await request(server).post('/api/tester/favorites').set('Authorization', `Bearer ${testerToken}`).send({ course_type: 'lecture', course_id: 999999 });
    expect(res.status).toBe(404);
  });

  it('adds a real lecture to favorites and it shows up enriched with title/tag', async () => {
    const add = await request(server).post('/api/tester/favorites').set('Authorization', `Bearer ${testerToken}`).send({ course_type: 'lecture', course_id: fixtures.lec1Id });
    expect(add.status).toBe(200);

    const list = await request(server).get('/api/tester/favorites').set('Authorization', `Bearer ${testerToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ course_type: 'lecture', course_id: fixtures.lec1Id, title: 'Lecture One' });
  });

  it('adding the same favorite twice does not duplicate it (INSERT OR IGNORE)', async () => {
    await request(server).post('/api/tester/favorites').set('Authorization', `Bearer ${testerToken}`).send({ course_type: 'lecture', course_id: fixtures.lec1Id });
    const list = await request(server).get('/api/tester/favorites').set('Authorization', `Bearer ${testerToken}`);
    expect(list.body).toHaveLength(1);
  });

  it('is per-user — another tester\'s favorites list stays empty', async () => {
    const list = await request(server).get('/api/tester/favorites').set('Authorization', `Bearer ${otherTesterToken}`);
    expect(list.body).toEqual([]);
  });

  it('removes a favorite', async () => {
    const del = await request(server).delete(`/api/tester/favorites/lecture/${fixtures.lec1Id}`).set('Authorization', `Bearer ${testerToken}`);
    expect(del.status).toBe(200);
    const list = await request(server).get('/api/tester/favorites').set('Authorization', `Bearer ${testerToken}`);
    expect(list.body).toEqual([]);
  });
});

describe('lesson notes', () => {
  let courseId;

  beforeAll(async () => {
    const leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
    const created = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Notes Fixture Course', is_published: true, modules: [{ title: 'M1', lessons: [{ title: 'L1', type: 'lesson' }] }] });
    courseId = created.body.id;
  });

  it('rejects an empty note', async () => {
    const res = await request(server).post('/api/tester/notes').set('Authorization', `Bearer ${testerToken}`).send({ course_id: courseId, lesson_title: 'L1', text: '   ' });
    expect(res.status).toBe(400);
  });

  it('rejects a note against a nonexistent course', async () => {
    const res = await request(server).post('/api/tester/notes').set('Authorization', `Bearer ${testerToken}`).send({ course_id: 999999, lesson_title: 'L1', text: 'hi' });
    expect(res.status).toBe(404);
  });

  it('adds a note and lists it grouped under its course', async () => {
    const add = await request(server).post('/api/tester/notes').set('Authorization', `Bearer ${testerToken}`).send({ course_id: courseId, lesson_title: 'L1', text: 'Проверить кнопку на мобилке' });
    expect(add.status).toBe(200);

    const list = await request(server).get('/api/tester/notes').set('Authorization', `Bearer ${testerToken}`);
    expect(list.status).toBe(200);
    const group = list.body.find(g => g.course_id === courseId);
    expect(group).toBeDefined();
    expect(group.notes).toHaveLength(1);
    expect(group.notes[0].text).toBe('Проверить кнопку на мобилке');
  });

  it('another tester cannot see or delete someone else\'s note', async () => {
    const otherList = await request(server).get('/api/tester/notes').set('Authorization', `Bearer ${otherTesterToken}`);
    expect(otherList.body.find(g => g.course_id === courseId)).toBeUndefined();

    const noteRow = db.prepare('SELECT id FROM custom_lesson_notes WHERE course_id = ?').get(courseId);
    const del = await request(server).delete(`/api/tester/notes/${noteRow.id}`).set('Authorization', `Bearer ${otherTesterToken}`);
    expect(del.status).toBe(404); // scoped by user_id in the DELETE's own WHERE, not just a 403
    expect(db.prepare('SELECT id FROM custom_lesson_notes WHERE id = ?').get(noteRow.id)).toBeDefined();
  });

  it('the owner can delete their own note', async () => {
    const noteRow = db.prepare('SELECT id FROM custom_lesson_notes WHERE course_id = ?').get(courseId);
    const del = await request(server).delete(`/api/tester/notes/${noteRow.id}`).set('Authorization', `Bearer ${testerToken}`);
    expect(del.status).toBe(200);
    expect(db.prepare('SELECT id FROM custom_lesson_notes WHERE id = ?').get(noteRow.id)).toBeUndefined();
  });
});

describe('avatar gallery', () => {
  const TINY_IMAGE = 'data:image/png;base64,iVBORw0KGgo='; // well under the 2.8MB cap, content not otherwise validated server-side

  it('starts empty', async () => {
    const res = await request(server).get('/api/avatars/gallery').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rows: [], hasMore: false });
  });

  it('rejects a non-string/missing image', async () => {
    const res = await request(server).post('/api/tester/avatar/gallery').set('Authorization', `Bearer ${testerToken}`).send({});
    expect(res.status).toBe(400);
  });

  it('rejects an oversized image', async () => {
    const huge = 'x'.repeat(2.9 * 1024 * 1024);
    const res = await request(server).post('/api/tester/avatar/gallery').set('Authorization', `Bearer ${testerToken}`).send({ image: huge });
    expect(res.status).toBe(400);
  });

  let galleryId;
  it('publishes an avatar to the shared gallery, visible to any authenticated user', async () => {
    const add = await request(server).post('/api/tester/avatar/gallery').set('Authorization', `Bearer ${testerToken}`).send({ image: TINY_IMAGE });
    expect(add.status).toBe(200);
    galleryId = add.body.id;

    const list = await request(server).get('/api/avatars/gallery').set('Authorization', `Bearer ${otherTesterToken}`);
    expect(list.status).toBe(200);
    const row = list.body.rows.find(g => g.id === galleryId);
    expect(row).toBeDefined();
    // The listing deliberately carries no image data — it used to send every
    // avatar's full base64 inline, unpaginated, so twenty of them meant tens
    // of megabytes in one response every time the picker opened.
    expect(row).not.toHaveProperty('image');
    expect(row.uploader_name).toBeTruthy();
    expect(row.uploader_name).toBe('Test Tester');
  });

  it('another user cannot delete someone else\'s gallery entry', async () => {
    const del = await request(server).delete(`/api/tester/avatar/gallery/${galleryId}`).set('Authorization', `Bearer ${otherTesterToken}`);
    expect(del.status).toBe(403);
    expect(db.prepare('SELECT id FROM custom_avatars WHERE id = ?').get(galleryId)).toBeDefined();
  });

  it('deleting an unknown gallery entry 404s', async () => {
    const del = await request(server).delete('/api/tester/avatar/gallery/999999').set('Authorization', `Bearer ${testerToken}`);
    expect(del.status).toBe(404);
  });

  it('the uploader can delete their own gallery entry', async () => {
    const del = await request(server).delete(`/api/tester/avatar/gallery/${galleryId}`).set('Authorization', `Bearer ${testerToken}`);
    expect(del.status).toBe(200);
    expect(db.prepare('SELECT id FROM custom_avatars WHERE id = ?').get(galleryId)).toBeUndefined();
  });
});
// The bytes, served one at a time so the browser can cache them, and worn
// by id so the picker never has to hold them at all.
describe('gallery images are fetched per avatar', () => {
  const TINY_PNG = 'data:image/png;base64,iVBORw0KGgo=';
  let imageId;

  beforeAll(async () => {
    const add = await request(server).post('/api/tester/avatar/gallery')
      .set('Authorization', `Bearer ${testerToken}`).send({ image: TINY_PNG });
    imageId = add.body.id;
  });

  it('serves one avatar as a real image, cacheable', async () => {
    const res = await request(server).get(`/api/avatars/gallery/${imageId}/image`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^image\/png/);
    expect(res.headers['cache-control']).toMatch(/immutable/);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('404s for an avatar that is not there', async () => {
    const res = await request(server).get('/api/avatars/gallery/999999/image')
      .set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(404);
  });

  it('wears one by id, copying the bytes server-side', async () => {
    const res = await request(server).post(`/api/tester/avatar/gallery/${imageId}/equip`)
      .set('Authorization', `Bearer ${otherTesterToken}`);
    expect(res.status).toBe(200);

    const profile = await request(server).get('/api/tester/profile-full')
      .set('Authorization', `Bearer ${otherTesterToken}`);
    expect(profile.body.avatar_id).toBe('custom');
    expect(profile.body.custom_avatar).toBe(TINY_PNG);
  });

  it('404s when equipping something that no longer exists', async () => {
    const res = await request(server).post('/api/tester/avatar/gallery/999999/equip')
      .set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(404);
  });
});
