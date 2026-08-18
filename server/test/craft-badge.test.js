import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let testerToken, testerId;

beforeAll(async () => {
  const fixtures = seedTestData(db);
  testerId = fixtures.testerId;
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

// Production-readiness audit: total(0) < collected(0) is false, so a
// skill_area matching zero real lectures used to grant a badge for free —
// reachable by a direct API call bypassing the client's dropdown of real
// skill_area values.
describe('POST /api/tester/craft-badge', () => {
  it('rejects a skill_area that matches no real lecture block (would have been a free badge)', async () => {
    const res = await request(server)
      .post('/api/tester/craft-badge')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ skill_area: 'Totally Made Up Skill' });
    expect(res.status).toBe(400);
    expect(db.prepare('SELECT * FROM user_badges WHERE user_id = ? AND badge_id = ?').get(testerId, 'Totally Made Up Skill')).toBeUndefined();
  });

  it('rejects a real skill_area when the tester has not actually collected all its cards', async () => {
    // Fixtures seed 3 lectures under 'Skill A' — tester has 0 cards.
    const res = await request(server)
      .post('/api/tester/craft-badge')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ skill_area: 'Skill A' });
    expect(res.status).toBe(400);
  });

  it('grants the badge once every card for that skill_area is actually collected', async () => {
    const lectures = db.prepare("SELECT id FROM lectures WHERE skill_area = 'Skill A'").all();
    for (const l of lectures) {
      db.prepare('INSERT INTO user_cards (user_id, lecture_id, skill_area) VALUES (?, ?, ?)').run(testerId, l.id, 'Skill A');
    }

    const res = await request(server)
      .post('/api/tester/craft-badge')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ skill_area: 'Skill A' });
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT * FROM user_badges WHERE user_id = ? AND badge_id = ?').get(testerId, 'Skill A')).toBeTruthy();
  });
});
