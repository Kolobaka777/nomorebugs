import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let leadId, testerId, leadToken, testerToken;

beforeAll(async () => {
  const ids = seedTestData(db);
  leadId = ids.leadId; testerId = ids.testerId;
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
});

describe('PATCH /api/lead/team/:id/note — private lead notes', () => {
  it('a lead can set a note on a tester, and it comes back from /api/lead/team', async () => {
    const res = await request(app)
      .patch(`/api/lead/team/${testerId}/note`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ note: 'Отлично разбирается в CSS, стоит доверить сложные вайты' });
    expect(res.status).toBe(200);

    const team = await request(app).get('/api/lead/team').set('Authorization', `Bearer ${leadToken}`);
    const member = team.body.find(m => m.id === testerId);
    expect(member.lead_note).toBe('Отлично разбирается в CSS, стоит доверить сложные вайты');
  });

  it('a tester never sees the note about themselves', async () => {
    const res = await request(app).get('/api/tester/profile-full').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('CSS, стоит доверить');
  });

  it('a plain tester cannot set a note (lead/admin only)', async () => {
    const res = await request(app)
      .patch(`/api/lead/team/${testerId}/note`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ note: 'sneaky' });
    expect(res.status).toBe(403);
  });

  it('rejects a note on a non-tester target', async () => {
    const res = await request(app)
      .patch(`/api/lead/team/${leadId}/note`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ note: 'about a lead' });
    expect(res.status).toBe(400);
  });

  it('rejects an oversized note instead of silently truncating it', async () => {
    // Truncating mid-string used to be safe when this was plain text; now
    // it's a JSON-serialized Tiptap doc, and a truncated JSON string is a
    // corrupted document, not just a shorter one — so oversized notes are
    // rejected outright instead.
    const huge = 'x'.repeat(200001);
    const res = await request(app)
      .patch(`/api/lead/team/${testerId}/note`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ note: huge });
    expect(res.status).toBe(400);
  });

  it('accepts a note up to the cap', async () => {
    const atCap = 'x'.repeat(200000);
    const res = await request(app)
      .patch(`/api/lead/team/${testerId}/note`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ note: atCap });
    expect(res.status).toBe(200);
    const team = await request(app).get('/api/lead/team').set('Authorization', `Bearer ${leadToken}`);
    expect(team.body.find(m => m.id === testerId).lead_note).toHaveLength(200000);
  });

  it('an empty note clears it', async () => {
    const res = await request(app)
      .patch(`/api/lead/team/${testerId}/note`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ note: '' });
    expect(res.status).toBe(200);
    const team = await request(app).get('/api/lead/team').set('Authorization', `Bearer ${leadToken}`);
    expect(team.body.find(m => m.id === testerId).lead_note).toBe('');
  });
});

describe('GET /api/lead/team — per-member task-type breakdown', () => {
  it('reflects real checklist submissions, grouped by template', async () => {
    const tpl = db.prepare(
      "INSERT INTO checklist_templates (name, task_type, color) VALUES ('Preland Check', 'prelending', '#1D9E75')"
    ).run().lastInsertRowid;
    const item = db.prepare(
      'INSERT INTO checklist_items (template_id, text, order_num) VALUES (?, ?, 0)'
    ).run(tpl, 'Some item').lastInsertRowid;

    await request(app)
      .post('/api/checklists/submit')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ template_id: tpl, task_name: 'Task A', results: [{ item_id: item, status: 'ok' }] });
    await request(app)
      .post('/api/checklists/submit')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ template_id: tpl, task_name: 'Task B', results: [{ item_id: item, status: 'ok' }] });

    const team = await request(app).get('/api/lead/team').set('Authorization', `Bearer ${leadToken}`);
    const member = team.body.find(m => m.id === testerId);
    const row = member.taskCounts.find(t => t.name === 'Preland Check');
    expect(row).toBeDefined();
    expect(row.count).toBe(2);
  });

  it('a tester with zero submissions gets an empty array, not an error', async () => {
    const insUser = db.prepare(
      'INSERT INTO users (email, password, name, role, avatar_initials) VALUES (?, ?, ?, ?, ?)'
    );
    const bcryptjs = (await import('bcryptjs')).default;
    insUser.run('fresh@test.local', bcryptjs.hashSync('freshpass123', 4), 'Fresh Tester', 'tester', 'FT');

    const team = await request(app).get('/api/lead/team').set('Authorization', `Bearer ${leadToken}`);
    const fresh = team.body.find(m => m.name === 'Fresh Tester');
    expect(fresh.taskCounts).toEqual([]);
  });
});

describe('GET /api/lead/before-after-by-tester', () => {
  it('pairs a tester\'s baseline self-rating with their measured quiz performance in the same skill_area', async () => {
    const lecId = db.prepare(
      "INSERT INTO lectures (title, order_num, skill_area) VALUES ('HTML Lesson', 100, 'HTML structure')"
    ).run().lastInsertRowid;
    db.prepare(
      "INSERT INTO test_results (user_id, lecture_id, score, answers) VALUES (?, ?, ?, '{}')"
    ).run(testerId, lecId, 80);

    const res = await request(app).get('/api/lead/before-after-by-tester').set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    const tester = res.body.find(t => t.id === testerId);
    expect(tester).toBeDefined();
    const htmlSkill = tester.skills.find(s => s.skill === 'HTML structure');
    expect(htmlSkill.before).toBe(2); // seeded baseline_survey value
    expect(htmlSkill.after).toBe(4);  // 80/20
    expect(htmlSkill.delta).toBe(2);
  });

  it('a skill with no quiz attempts yet reports after: null rather than 0', async () => {
    const res = await request(app).get('/api/lead/before-after-by-tester').set('Authorization', `Bearer ${leadToken}`);
    const tester = res.body.find(t => t.id === testerId);
    const cssSkill = tester.skills.find(s => s.skill === 'CSS reading');
    expect(cssSkill.after).toBeNull();
    expect(cssSkill.delta).toBeNull();
  });

  it('is lead-only', async () => {
    const res = await request(app).get('/api/lead/before-after-by-tester').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(403);
  });
});
