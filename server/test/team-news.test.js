import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { todayMonthDayInTimezone, todayInTimezone } = await import('../src/presence.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let fixtures, testerToken, leadToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
});

describe('team news feed — stored events', () => {
  it('registering a new account produces a member_joined item', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'newsmember@test.local', password: 'password123', name: 'News Member',
    });
    expect(reg.status).toBe(201);

    const news = await request(app).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(news.status).toBe(200);
    const item = news.body.find(n => n.event_type === 'member_joined' && n.user_id === reg.body.user.id);
    expect(item).toBeTruthy();
    expect(item.name).toBe('News Member');
  });

  it('publishing a guide produces a guide_published item with the title', async () => {
    const create = await request(app)
      .post('/api/guides')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'News Guide', category: 'Общее', content: 'x' });
    expect(create.status).toBe(200);

    const news = await request(app).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    const item = news.body.find(n => n.event_type === 'guide_published' && n.ref_id === create.body.id);
    expect(item).toBeTruthy();
    expect(item.guide_title).toBe('News Guide');
  });

  it('is visible to a plain tester, not just leads (this is public news, not the private audit log)', async () => {
    const res = await request(app).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('publishing a course produces exactly one course_published item on the 0->1 transition, not on every edit', async () => {
    const create = await request(app)
      .post('/api/custom-courses')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'News Course', is_published: 0, modules: [] });
    expect(create.status).toBe(200);
    const courseId = create.body.id;

    let news = await request(app).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(news.body.find(n => n.event_type === 'course_published' && n.ref_id === courseId)).toBeFalsy();

    const publish = await request(app)
      .patch(`/api/custom-courses/${courseId}/publish`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(publish.status).toBe(200);
    expect(publish.body.is_published).toBe(1);

    news = await request(app).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(news.body.filter(n => n.event_type === 'course_published' && n.ref_id === courseId).length).toBe(1);

    // Editing the already-published course (a plain title change) must not
    // add a second event.
    const edit = await request(app)
      .put(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'News Course (edited)' });
    expect(edit.status).toBe(200);

    news = await request(app).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(news.body.filter(n => n.event_type === 'course_published' && n.ref_id === courseId).length).toBe(1);
  });
});

describe('team news feed — computed (birthday / leave) items', () => {
  it('surfaces a birthday item for a user whose birthday matches today, in their own timezone', async () => {
    const todayMD = todayMonthDayInTimezone('Europe/Moscow');
    await request(app)
      .patch('/api/me/presence')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ timezone: 'Europe/Moscow', birthday: todayMD });

    const news = await request(app).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    const item = news.body.find(n => n.event_type === 'birthday' && n.user_id === fixtures.testerId);
    expect(item).toBeTruthy();
  });

  it('does not surface a birthday item for a mismatched date', async () => {
    // A date guaranteed not to be "today" in MM-DD terms most of the year —
    // shift by 6 months from today to always land on a different day.
    const todayMD = todayMonthDayInTimezone('Europe/Moscow');
    const [mm] = todayMD.split('-').map(Number);
    const shiftedMonth = ((mm + 5) % 12) + 1; // +6 months, 1-indexed wraparound
    const otherMD = `${String(shiftedMonth).padStart(2, '0')}-01`;

    await request(app)
      .patch('/api/lead/team/' + fixtures.testerId + '/presence')
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ birthday: otherMD });

    const news = await request(app).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    const item = news.body.find(n => n.event_type === 'birthday' && n.user_id === fixtures.testerId);
    expect(item).toBeFalsy();
  });

  it('surfaces leave_started/leave_ended items on the exact start/end day', async () => {
    const today = todayInTimezone('Europe/Moscow');
    const create = await request(app)
      .post('/api/me/leave')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'vacation', start_date: today, end_date: today });

    const news = await request(app).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    expect(news.body.find(n => n.event_type === 'leave_started' && n.user_id === fixtures.testerId)).toBeTruthy();
    expect(news.body.find(n => n.event_type === 'leave_ended' && n.user_id === fixtures.testerId)).toBeTruthy();

    await request(app).delete(`/api/me/leave/${create.body.id}`).set('Authorization', `Bearer ${testerToken}`);
  });
});
