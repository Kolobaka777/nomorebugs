// Auto-awarded milestone badges (see routeHelpers.js's awardAchievement/
// ACHIEVEMENT_IDS) — one describe block per achievement, each exercising
// the real route that triggers it rather than calling awardAchievement
// directly, so this also proves the trigger is wired up correctly.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, leadToken, testerToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

function hasBadge(userId, badgeId) {
  return !!db.prepare('SELECT 1 FROM user_badges WHERE user_id = ? AND badge_id = ?').get(userId, badgeId);
}

describe('«Отличник» — last 5 completed lectures all ≥90%', () => {
  it('does not fire on 4 great scores, fires on the 5th', async () => {
    // Fixtures seed 3 lectures ('Skill A'); add 2 more so there are 5 to pass.
    const extra1 = db.prepare("INSERT INTO lectures (title, order_num, skill_area) VALUES ('Extra 1', 10, 'Skill A')").run().lastInsertRowid;
    const extra2 = db.prepare("INSERT INTO lectures (title, order_num, skill_area) VALUES ('Extra 2', 11, 'Skill A')").run().lastInsertRowid;
    db.prepare(`
      INSERT INTO questions (lecture_id, question_text, option_a, option_b, option_c, option_d, correct_answer, order_num)
      VALUES (?, 'Extra Q?', 'A', 'B', 'C', 'D', 'a', 1)
    `).run(extra2);
    const lectureIds = [fixtures.lec1Id, fixtures.lec2Id, fixtures.lec3Id, extra1, extra2];

    for (let i = 0; i < 4; i++) {
      db.prepare('INSERT INTO test_results (user_id, lecture_id, score, answers) VALUES (?, ?, ?, ?)')
        .run(fixtures.testerId, lectureIds[i], 95, '{}');
    }
    expect(hasBadge(fixtures.testerId, 'achievement_otlichnik')).toBe(false);

    // 5th, via the real submit route so the achievement check itself runs.
    const q = db.prepare('SELECT id, correct_answer FROM questions WHERE lecture_id = ?').get(extra2);
    const res = await request(server)
      .post(`/api/lectures/${extra2}/submit-test`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ answers: { [q.id]: q.correct_answer } });
    expect(res.status).toBe(200);

    expect(hasBadge(fixtures.testerId, 'achievement_otlichnik')).toBe(true);
  });
});

describe('«Автор» — first ever approved proposal, any kind', () => {
  it('fires the first time a lead approves this tester\'s bug-example proposal', async () => {
    expect(hasBadge(fixtures.testerId, 'achievement_avtor')).toBe(false);
    const created = await request(server)
      .post('/api/bug-examples')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ problem: 'Achievement test', bad_text: 'bad', good_text: 'good' });
    await request(server).patch(`/api/bug-examples/${created.body.id}/approve`).set('Authorization', `Bearer ${leadToken}`);
    expect(hasBadge(fixtures.testerId, 'achievement_avtor')).toBe(true);
  });
});

describe('«Библиотекарь» — 5 approved glossary terms from the same author', () => {
  it('does not fire on 4, fires on the 5th approval', async () => {
    for (let i = 0; i < 5; i++) {
      const created = await request(server)
        .post('/api/glossary')
        .set('Authorization', `Bearer ${testerToken}`)
        .send({ term: `Bib term ${i}`, definition: 'x' });
      if (i < 4) expect(hasBadge(fixtures.testerId, 'achievement_bibliotekar')).toBe(false);
      await request(server).patch(`/api/glossary/${created.body.id}/approve`).set('Authorization', `Bearer ${leadToken}`);
      if (i < 4) expect(hasBadge(fixtures.testerId, 'achievement_bibliotekar')).toBe(false);
    }
    expect(hasBadge(fixtures.testerId, 'achievement_bibliotekar')).toBe(true);
  });
});

describe('«Наставник» — 3 approved guides from the same author', () => {
  it('fires on the 3rd approval, not before', async () => {
    for (let i = 0; i < 3; i++) {
      const created = await request(server)
        .post('/api/guides')
        .set('Authorization', `Bearer ${testerToken}`)
        .send({ title: `Nastavnik guide ${i}`, category: 'Общее', content: 'x' });
      if (i < 2) expect(hasBadge(fixtures.testerId, 'achievement_nastavnik')).toBe(false);
      await request(server).patch(`/api/guides/${created.body.id}/approve`).set('Authorization', `Bearer ${leadToken}`);
    }
    expect(hasBadge(fixtures.testerId, 'achievement_nastavnik')).toBe(true);
  });
});

describe('«Голос команды» — 10+ likes across own suggestions, or 5 answered questions', () => {
  it('fires once cumulative likes across a tester\'s own posts reach 10', async () => {
    await request(server).post('/api/auth/register').send({ email: 'liked-author@test.local', password: 'likedpass123', name: 'Liked Author' });
    const likedAuthorToken = await loginAs(request, server, 'liked-author@test.local', 'likedpass123');
    const likedAuthor = db.prepare("SELECT id FROM users WHERE email = 'liked-author@test.local'").get();

    const post1 = await request(server).post('/api/suggestions').set('Authorization', `Bearer ${likedAuthorToken}`).send({ type: 'idea', text: 'Idea one', is_anonymous: false });
    const post2 = await request(server).post('/api/suggestions').set('Authorization', `Bearer ${likedAuthorToken}`).send({ type: 'idea', text: 'Idea two', is_anonymous: false });

    // 9 likes spread across both posts from distinct likers — not yet enough.
    for (let i = 0; i < 9; i++) {
      await request(server).post('/api/auth/register').send({ email: `liker-${i}@test.local`, password: 'likerpass123', name: `Liker ${i}` });
      const likerToken = await loginAs(request, server, `liker-${i}@test.local`, 'likerpass123');
      const targetId = i % 2 === 0 ? post1.body.id : post2.body.id;
      await request(server).post(`/api/suggestions/${targetId}/like`).set('Authorization', `Bearer ${likerToken}`);
    }
    expect(hasBadge(likedAuthor.id, 'achievement_golos_komandy')).toBe(false);

    // 10th like tips it over.
    await request(server).post('/api/auth/register').send({ email: 'liker-10@test.local', password: 'likerpass123', name: 'Liker 10' });
    const liker10Token = await loginAs(request, server, 'liker-10@test.local', 'likerpass123');
    await request(server).post(`/api/suggestions/${post1.body.id}/like`).set('Authorization', `Bearer ${liker10Token}`);

    expect(hasBadge(likedAuthor.id, 'achievement_golos_komandy')).toBe(true);
  });

  it('also fires once a lead has answered 5 of a tester\'s questions', async () => {
    await request(server).post('/api/auth/register').send({ email: 'asker@test.local', password: 'askerpass123', name: 'Asker' });
    const askerToken = await loginAs(request, server, 'asker@test.local', 'askerpass123');
    const asker = db.prepare("SELECT id FROM users WHERE email = 'asker@test.local'").get();

    for (let i = 0; i < 5; i++) {
      const q = await request(server).post('/api/suggestions').set('Authorization', `Bearer ${askerToken}`).send({ type: 'question', text: `Question ${i}`, is_anonymous: false });
      if (i < 4) expect(hasBadge(asker.id, 'achievement_golos_komandy')).toBe(false);
      await request(server).patch(`/api/suggestions/${q.body.id}/answer`).set('Authorization', `Bearer ${leadToken}`).send({ answer: `Answer ${i}` });
    }
    expect(hasBadge(asker.id, 'achievement_golos_komandy')).toBe(true);
  });
});

describe('«Полуночный жук» — logged in after midnight (server time) on 5 distinct days', () => {
  it('fires on the next login once 5 distinct early-hour login days already exist', async () => {
    await request(server).post('/api/auth/register').send({ email: 'nightowl@test.local', password: 'nightpass123', name: 'Night Owl' });
    const nightOwl = db.prepare("SELECT id FROM users WHERE email = 'nightowl@test.local'").get();

    const insLogin = db.prepare("INSERT INTO activity_log (user_id, action, created_at) VALUES (?, 'login', ?)");
    for (let day = 1; day <= 5; day++) {
      insLogin.run(nightOwl.id, `2026-01-0${day} 02:30:00`);
    }
    expect(hasBadge(nightOwl.id, 'achievement_polunochny_zhuk')).toBe(false);

    // Any login now re-checks the (already-satisfied) count, regardless of
    // what time this test actually runs at.
    await loginAs(request, server, 'nightowl@test.local', 'nightpass123');
    expect(hasBadge(nightOwl.id, 'achievement_polunochny_zhuk')).toBe(true);
  });

  it('does not fire on only 4 distinct early-hour days', async () => {
    await request(server).post('/api/auth/register').send({ email: 'almostowl@test.local', password: 'almostpass123', name: 'Almost Owl' });
    const almostOwl = db.prepare("SELECT id FROM users WHERE email = 'almostowl@test.local'").get();

    const insLogin = db.prepare("INSERT INTO activity_log (user_id, action, created_at) VALUES (?, 'login', ?)");
    for (let day = 1; day <= 4; day++) {
      insLogin.run(almostOwl.id, `2026-01-0${day} 02:30:00`);
    }
    await loginAs(request, server, 'almostowl@test.local', 'almostpass123');
    expect(hasBadge(almostOwl.id, 'achievement_polunochny_zhuk')).toBe(false);
  });
});

describe('«Коллекционер» — all 5 skill-area badges crafted', () => {
  it('fires when the 5th and final skill badge is crafted', async () => {
    await request(server).post('/api/auth/register').send({ email: 'collector@test.local', password: 'collectorpass123', name: 'Collector' });
    const collectorToken = await loginAs(request, server, 'collector@test.local', 'collectorpass123');
    const collector = db.prepare("SELECT id FROM users WHERE email = 'collector@test.local'").get();

    // Pre-grant 4 of the 5 canonical skill badges directly.
    const prior = ['HTML structure', 'CSS reading', 'DevTools', 'Console errors'];
    for (const badgeId of prior) {
      db.prepare('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(collector.id, badgeId);
    }
    expect(hasBadge(collector.id, 'achievement_kollektsioner')).toBe(false);

    // Craft the 5th for real, via a real lecture + fully collected card.
    const lecId = db.prepare("INSERT INTO lectures (title, order_num, skill_area) VALUES ('Bug Reporting 101', 20, 'Bug report quality')").run().lastInsertRowid;
    db.prepare('INSERT INTO user_cards (user_id, lecture_id, skill_area) VALUES (?, ?, ?)').run(collector.id, lecId, 'Bug report quality');

    const res = await request(server)
      .post('/api/tester/craft-badge')
      .set('Authorization', `Bearer ${collectorToken}`)
      .send({ skill_area: 'Bug report quality' });
    expect(res.status).toBe(200);
    expect(hasBadge(collector.id, 'achievement_kollektsioner')).toBe(true);
  });
});
