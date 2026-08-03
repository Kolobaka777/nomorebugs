import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { computeIsWorkingNow } = await import('../src/presence.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let fixtures, testerToken, leadToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
});

describe('computeIsWorkingNow — pure function, deterministic Date inputs', () => {
  it('returns null when hours are not configured', () => {
    expect(computeIsWorkingNow({ work_start: null, work_end: null })).toBeNull();
  });

  it('returns true inside configured hours on a working day', () => {
    // 2024-01-08 is a Monday. 12:00 UTC = 15:00 Europe/Moscow (UTC+3).
    const now = new Date('2024-01-08T12:00:00Z');
    const profile = { work_start: '09:00', work_end: '18:00', work_days: '1,2,3,4,5', timezone: 'Europe/Moscow' };
    expect(computeIsWorkingNow(profile, now)).toBe(true);
  });

  it('returns false outside configured hours', () => {
    const now = new Date('2024-01-08T02:00:00Z'); // 05:00 Moscow
    const profile = { work_start: '09:00', work_end: '18:00', work_days: '1,2,3,4,5', timezone: 'Europe/Moscow' };
    expect(computeIsWorkingNow(profile, now)).toBe(false);
  });

  it('returns false on a non-working day even inside the hour range', () => {
    const now = new Date('2024-01-06T12:00:00Z'); // Saturday, 15:00 Moscow
    const profile = { work_start: '09:00', work_end: '18:00', work_days: '1,2,3,4,5', timezone: 'Europe/Moscow' };
    expect(computeIsWorkingNow(profile, now)).toBe(false);
  });

  it('handles an overnight shift that crosses midnight (start > end)', () => {
    // Europe/Moscow is UTC+3, no DST.
    const profile = { work_start: '22:00', work_end: '06:00', work_days: '1,2,3,4,5', timezone: 'Europe/Moscow' };
    // 20:00 UTC Mon = 23:00 Moscow Mon — inside the overnight window, pre-midnight half.
    expect(computeIsWorkingNow(profile, new Date('2024-01-08T20:00:00Z'))).toBe(true);
    // 23:00 UTC Mon = 02:00 Moscow Tue — inside the overnight window, post-midnight half.
    expect(computeIsWorkingNow(profile, new Date('2024-01-08T23:00:00Z'))).toBe(true);
    // 09:00 UTC Mon = 12:00 Moscow Mon — well outside the overnight window.
    expect(computeIsWorkingNow(profile, new Date('2024-01-08T09:00:00Z'))).toBe(false);
  });

  it('returns null (not a throw) for an invalid/corrupt stored timezone, instead of crashing the caller', () => {
    const profile = { work_start: '09:00', work_end: '18:00', work_days: '1,2,3,4,5', timezone: 'Not/A_Real_Zone' };
    expect(computeIsWorkingNow(profile, new Date('2024-01-08T12:00:00Z'))).toBeNull();
  });
});

describe('presence — self-service', () => {
  it('GET /api/team/presence includes every active user, unconfigured by default', async () => {
    const res = await request(app).get('/api/team/presence').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    const me = res.body.find(p => p.id === fixtures.testerId);
    expect(me).toBeTruthy();
    expect(me.isWorkingNow).toBeNull();
    expect(me.currentLeave).toBeNull();
  });

  it('PATCH /api/me/presence sets hours/status/birthday, reflected in the team list', async () => {
    const save = await request(app)
      .patch('/api/me/presence')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ work_start: '09:00', work_end: '18:00', work_days: '1,2,3,4,5', timezone: 'Europe/Moscow', status: 'remote', birthday: '08-15' });
    expect(save.status).toBe(200);

    const res = await request(app).get('/api/team/presence').set('Authorization', `Bearer ${testerToken}`);
    const me = res.body.find(p => p.id === fixtures.testerId);
    expect(me.workStart).toBe('09:00');
    expect(me.workEnd).toBe('18:00');
    expect(me.status).toBe('remote');
    expect(me.birthday).toBe('08-15');
  });

  it('rejects an invalid time format', async () => {
    const res = await request(app)
      .patch('/api/me/presence')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ work_start: '9am' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid status', async () => {
    const res = await request(app)
      .patch('/api/me/presence')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ status: 'on_the_moon' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid birthday format', async () => {
    const res = await request(app)
      .patch('/api/me/presence')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ birthday: '2024-08-15' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid timezone (a bogus one used to reach the DB and crash the whole team feed on the next read)', async () => {
    const res = await request(app)
      .patch('/api/me/presence')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ timezone: 'Not/A_Real_Zone' });
    expect(res.status).toBe(400);

    // Confirm the team feed is still healthy (didn't get corrupted by a
    // request that should have been rejected).
    const team = await request(app).get('/api/team/presence').set('Authorization', `Bearer ${testerToken}`);
    expect(team.status).toBe(200);
  });
});

describe('presence — leave (self-service)', () => {
  it('POST /api/me/leave creates a leave period visible as currentLeave when active today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const create = await request(app)
      .post('/api/me/leave')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'vacation', start_date: today, end_date: null, note: 'test' });
    expect(create.status).toBe(201);
    const leaveId = create.body.id;

    const res = await request(app).get('/api/team/presence').set('Authorization', `Bearer ${testerToken}`);
    const me = res.body.find(p => p.id === fixtures.testerId);
    expect(me.currentLeave).toMatchObject({ id: leaveId, type: 'vacation' });

    const del = await request(app).delete(`/api/me/leave/${leaveId}`).set('Authorization', `Bearer ${testerToken}`);
    expect(del.status).toBe(200);

    const after = await request(app).get('/api/team/presence').set('Authorization', `Bearer ${testerToken}`);
    expect(after.body.find(p => p.id === fixtures.testerId).currentLeave).toBeNull();
  });

  it('rejects an unknown leave type', async () => {
    const res = await request(app)
      .post('/api/me/leave')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'nap', start_date: '2024-01-01' });
    expect(res.status).toBe(400);
  });

  it('rejects an end_date before start_date', async () => {
    const res = await request(app)
      .post('/api/me/leave')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'vacation', start_date: '2024-06-10', end_date: '2024-06-01' });
    expect(res.status).toBe(400);
  });

  it('cannot delete another user\'s leave', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const create = await request(app)
      .post('/api/me/leave')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ type: 'sick', start_date: today });
    const leaveId = create.body.id;

    // A second tester tries to delete the first tester's leave.
    const otherReg = await request(app).post('/api/auth/register').send({
      email: 'otherpresence@test.local', password: 'password123', name: 'Other Presence',
    });
    const otherToken = otherReg.body.token;

    const del = await request(app).delete(`/api/me/leave/${leaveId}`).set('Authorization', `Bearer ${otherToken}`);
    expect(del.status).toBe(403);
  });
});

describe('presence — lead-managed', () => {
  it('PATCH /api/lead/team/:id/presence is lead-only', async () => {
    const asTester = await request(app)
      .patch(`/api/lead/team/${fixtures.testerId}/presence`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ status: 'remote' });
    expect(asTester.status).toBe(403);

    const asLead = await request(app)
      .patch(`/api/lead/team/${fixtures.testerId}/presence`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ work_start: '10:00', work_end: '19:00', status: 'active' });
    expect(asLead.status).toBe(200);
  });

  it('lead can schedule and cancel leave for someone else', async () => {
    const create = await request(app)
      .post(`/api/lead/team/${fixtures.testerId}/leave`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ type: 'day_off', start_date: '2030-01-01', end_date: '2030-01-01' });
    expect(create.status).toBe(201);

    const del = await request(app)
      .delete(`/api/lead/team/${fixtures.testerId}/leave/${create.body.id}`)
      .set('Authorization', `Bearer ${leadToken}`);
    expect(del.status).toBe(200);
  });
});
