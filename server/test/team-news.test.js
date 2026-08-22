import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { todayMonthDayInTimezone, todayInTimezone } = await import('../src/presence.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, testerToken, leadToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
});

describe('team news feed — stored events', () => {
  it('registering a new account produces a member_joined item', async () => {
    const reg = await request(server).post('/api/auth/register').send({
      email: 'newsmember@test.local', password: 'password123', name: 'News Member',
    });
    expect(reg.status).toBe(201);

    const news = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(news.status).toBe(200);
    const item = news.body.rows.find(n => n.event_type === 'member_joined' && n.user_id === reg.body.user.id);
    expect(item).toBeTruthy();
    expect(item.name).toBe('News Member');
  });

  it('publishing a guide produces a guide_published item with the title', async () => {
    const create = await request(server)
      .post('/api/guides')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'News Guide', category: 'Общее', content: 'x' });
    expect(create.status).toBe(200);

    const news = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    const item = news.body.rows.find(n => n.event_type === 'guide_published' && n.ref_id === create.body.id);
    expect(item).toBeTruthy();
    expect(item.guide_title).toBe('News Guide');
  });

  it('is visible to a plain tester, not just leads (this is public news, not the private audit log)', async () => {
    const res = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  it('publishing a course produces exactly one course_published item on the 0->1 transition, not on every edit', async () => {
    const create = await request(server)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'News Course', is_published: 0, modules: [{ title: 'M1', lessons: [{ title: 'L1', type: 'lesson' }] }] });
    expect(create.status).toBe(200);
    const courseId = create.body.id;

    let news = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(news.body.rows.find(n => n.event_type === 'course_published' && n.ref_id === courseId)).toBeFalsy();

    const publish = await request(server)
      .patch(`/api/custom-courses/${courseId}/publish`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(publish.status).toBe(200);
    expect(publish.body.is_published).toBe(1);

    news = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(news.body.rows.filter(n => n.event_type === 'course_published' && n.ref_id === courseId).length).toBe(1);

    // Editing the already-published course (a plain title change) must not
    // add a second event.
    const edit = await request(server)
      .put(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'News Course (edited)' });
    expect(edit.status).toBe(200);

    news = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(news.body.rows.filter(n => n.event_type === 'course_published' && n.ref_id === courseId).length).toBe(1);
  });

  it('pasting a lecture video link for the first time produces a lecture_video_added item, but re-saving it does not duplicate', async () => {
    const first = await request(server)
      .patch(`/api/admin/lectures/${fixtures.lec3Id}/video`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ video_url: 'https://www.youtube.com/watch?v=abcdefghijk' });
    expect(first.status).toBe(200);

    let news = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(news.body.rows.filter(n => n.event_type === 'lecture_video_added' && n.ref_id === fixtures.lec3Id).length).toBe(1);
    expect(news.body.rows.find(n => n.event_type === 'lecture_video_added' && n.ref_id === fixtures.lec3Id).lecture_title).toBe('Lecture Three');

    const second = await request(server)
      .patch(`/api/admin/lectures/${fixtures.lec3Id}/video`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ video_url: 'https://www.youtube.com/watch?v=zzzzzzzzzzz' });
    expect(second.status).toBe(200);

    news = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(news.body.rows.filter(n => n.event_type === 'lecture_video_added' && n.ref_id === fixtures.lec3Id).length).toBe(1);
  });

  it('supports offset-based pagination with hasMore, like /api/lead/activity', async () => {
    // Generate enough stored events to guarantee more than one page.
    for (let i = 0; i < 35; i++) {
      await request(server).post('/api/guides').set('Authorization', `Bearer ${leadToken}`).send({ title: `Bulk Guide ${i}`, content: 'x' });
    }

    const first = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(first.body.rows.length).toBe(30);
    expect(first.body.hasMore).toBe(true);
    expect(first.body.storedCount).toBe(30);

    const second = await request(server).get('/api/team/news').query({ offset: 30 }).set('Authorization', `Bearer ${testerToken}`);
    expect(second.body.rows.length).toBeGreaterThan(0);
    // No overlap between the two pages.
    const firstIds = new Set(first.body.rows.map(r => r.id));
    expect(second.body.rows.every(r => !firstIds.has(r.id))).toBe(true);
  });
});

describe('team news feed — computed (birthday / leave) items', () => {
  it('surfaces a birthday item for a user whose birthday matches today, in their own timezone', async () => {
    const todayMD = todayMonthDayInTimezone('Europe/Moscow');
    await request(server)
      .patch('/api/me/presence')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ timezone: 'Europe/Moscow', birthday: todayMD });

    const news = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    const item = news.body.rows.find(n => n.event_type === 'birthday' && n.user_id === fixtures.testerId);
    expect(item).toBeTruthy();
  });

  it('does not surface a birthday item for a mismatched date', async () => {
    // A date guaranteed not to be "today" in MM-DD terms most of the year —
    // shift by 6 months from today to always land on a different day.
    const todayMD = todayMonthDayInTimezone('Europe/Moscow');
    const [mm] = todayMD.split('-').map(Number);
    const shiftedMonth = ((mm + 5) % 12) + 1; // +6 months, 1-indexed wraparound
    const otherMD = `${String(shiftedMonth).padStart(2, '0')}-01`;

    // A fresh user, not fixtures.testerId — that fixture's birthday was
    // already set (and locked, see presence.js's "set once" rule) by the
    // previous test, so setting a *different* value on it here would be
    // silently ignored rather than actually changing anything.
    const reg = await request(server).post('/api/auth/register').send({
      email: 'birthdaymismatch@test.local', password: 'password123', name: 'Birthday Mismatch',
    });
    await request(server)
      .patch('/api/lead/team/' + reg.body.user.id + '/presence')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ birthday: otherMD });

    const news = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    const item = news.body.rows.find(n => n.event_type === 'birthday' && n.user_id === reg.body.user.id);
    expect(item).toBeFalsy();
  });

  it('surfaces leave_started/leave_ended items on the exact start/end day', async () => {
    const today = todayInTimezone('Europe/Moscow');
    const create = await request(server)
      .post('/api/me/leave')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'vacation', start_date: today, end_date: today });

    const news = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(news.body.rows.find(n => n.event_type === 'leave_started' && n.user_id === fixtures.testerId)).toBeTruthy();
    expect(news.body.rows.find(n => n.event_type === 'leave_ended' && n.user_id === fixtures.testerId)).toBeTruthy();

    await request(server).delete(`/api/me/leave/${create.body.id}`).set('Authorization', `Bearer ${testerToken}`);
  });

  it('computed items only appear on the first page (offset 0), not when paging into older stored history', async () => {
    const news = await request(server).get('/api/team/news').query({ offset: 5 }).set('Authorization', `Bearer ${testerToken}`);
    expect(news.body.rows.find(n => n.event_type === 'birthday')).toBeFalsy();
  });

  it('paginating with storedCount as the next offset visits every stored event exactly once, even with a virtual item mixed into page 0', async () => {
    // A birthday virtual item on page 0 used to inflate the client's next
    // offset (it advanced by rows.length, which counted the virtual item
    // too) — that silently skipped one real stored event on the next page.
    const todayMD = todayMonthDayInTimezone('Europe/Moscow');
    await request(server)
      .patch('/api/me/presence')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ timezone: 'Europe/Moscow', birthday: todayMD });

    const totalStored = db.prepare('SELECT COUNT(*) as c FROM team_events').get().c;
    expect(totalStored).toBeGreaterThan(30); // guaranteed by the bulk guides created earlier in this file

    let offset = 0;
    let hasMore = true;
    let guard = 0;
    const seenStoredIds = new Set();
    while (hasMore) {
      if (++guard > 20) throw new Error('pagination loop did not terminate');
      const res = await request(server).get('/api/team/news').query({ offset }).set('Authorization', `Bearer ${testerToken}`);
      for (const row of res.body.rows) {
        if (typeof row.id === 'number') seenStoredIds.add(row.id);
      }
      offset += res.body.storedCount;
      hasMore = res.body.hasMore;
    }
    expect(seenStoredIds.size).toBe(totalStored);
  });
});

// A lead writing into the feed directly, and clearing items out of it.
// Everything else in the feed is a side effect of somebody doing something;
// an announcement is the one item a person writes.
describe('team news — a lead posting and deleting', () => {
  let announcementId;

  it('a lead can post an announcement, and everyone sees it with its text', async () => {
    const res = await request(server).post('/api/team/news').set('Authorization', `Bearer ${leadToken}`)
      .send({ text: '  В пятницу ретро в 15:00  ' });
    expect(res.status).toBe(200);
    announcementId = res.body.id;

    const news = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    const item = news.body.rows.find(n => n.id === announcementId);
    expect(item.event_type).toBe('announcement');
    expect(item.text).toBe('В пятницу ретро в 15:00'); // trimmed
    expect(item.user_id).toBe(fixtures.leadId);
  });

  it('refuses an empty or overlong announcement instead of posting a blank row', async () => {
    const empty = await request(server).post('/api/team/news').set('Authorization', `Bearer ${leadToken}`)
      .send({ text: '   ' });
    expect(empty.status).toBe(400);

    const long = await request(server).post('/api/team/news').set('Authorization', `Bearer ${leadToken}`)
      .send({ text: 'а'.repeat(1001) });
    expect(long.status).toBe(400);
  });

  it('a tester can neither post nor delete', async () => {
    const post = await request(server).post('/api/team/news').set('Authorization', `Bearer ${testerToken}`)
      .send({ text: 'Я тоже хочу' });
    expect(post.status).toBe(403);

    const del = await request(server).delete(`/api/team/news/${announcementId}`).set('Authorization', `Bearer ${testerToken}`);
    expect(del.status).toBe(403);
  });

  it('a lead can delete any stored event, not only their own announcements', async () => {
    const reg = await request(server).post('/api/auth/register').send({
      email: 'deleteme@test.local', password: 'password123', name: 'Delete Me',
    });
    const before = await request(server).get('/api/team/news').set('Authorization', `Bearer ${leadToken}`);
    const joined = before.body.rows.find(n => n.event_type === 'member_joined' && n.user_id === reg.body.user.id);
    expect(joined).toBeTruthy();

    const del = await request(server).delete(`/api/team/news/${joined.id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(del.status).toBe(200);

    const after = await request(server).get('/api/team/news').set('Authorization', `Bearer ${leadToken}`);
    expect(after.body.rows.find(n => n.id === joined.id)).toBeUndefined();
  });

  it('404s on an id that is not there, rather than reporting a silent success', async () => {
    const res = await request(server).delete('/api/team/news/999999').set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(404);
  });

  // Birthdays and leave are recomputed on every read, so there is no row to
  // remove — deleting one would look like it worked and the item would be
  // back on the next load. Say so instead.
  it('explains that a computed birthday/leave item cannot be deleted', async () => {
    const res = await request(server).delete(`/api/team/news/birthday-${fixtures.testerId}`).set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/нельзя удалить/);
  });

  it('deleting the announcement removes it for everyone', async () => {
    const del = await request(server).delete(`/api/team/news/${announcementId}`).set('Authorization', `Bearer ${leadToken}`);
    expect(del.status).toBe(200);

    const news = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(news.body.rows.find(n => n.id === announcementId)).toBeUndefined();
  });
});

