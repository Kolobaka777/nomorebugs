import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import bcryptjs from 'bcryptjs';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let adminId, leadId, testerId;
let adminToken, leadToken, testerToken;

beforeAll(async () => {
  const ids = seedTestData(db);
  adminId = ids.adminId; leadId = ids.leadId; testerId = ids.testerId;
  adminToken = await loginAs(request, app, 'admin@test.local', 'adminpass123');
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
});

// Regression coverage for the pre-flight security/RBAC audit findings.

describe('trust proxy — express-rate-limit must not choke on a forwarded-for header', () => {
  it('handles a request carrying X-Forwarded-For without throwing (the exact Railway-proxy failure mode)', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('X-Forwarded-For', '203.0.113.7');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/checklists/templates/import requires the lead role', () => {
  async function xlsxBuffer() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Категория', '']);
    ws.addRow(['', 'Пункт проверки']);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it('rejects a tester with 403 before ever touching the uploaded file', async () => {
    const res = await request(app)
      .post('/api/checklists/templates/import')
      .set('Authorization', `Bearer ${testerToken}`)
      .field('name', 'Should Not Exist')
      .field('color', '#1D9E75')
      .attach('file', await xlsxBuffer(), { filename: 'x.xlsx' });
    expect(res.status).toBe(403);
    expect(db.prepare('SELECT id FROM checklist_templates WHERE name = ?').get('Should Not Exist')).toBeUndefined();
  });

  it('still allows a lead through (no regression)', async () => {
    const res = await request(app)
      .post('/api/checklists/templates/import')
      .set('Authorization', `Bearer ${leadToken}`)
      .field('name', 'Lead Import Still Works')
      .field('color', '#1D9E75')
      .attach('file', await xlsxBuffer(), { filename: 'x.xlsx' });
    expect(res.status).toBe(200);
  });
});

describe('admin bypasses manual ownership checks (matching requireRole\'s documented admin-bypass contract)', () => {
  let submissionId, courseId;

  beforeAll(() => {
    // A checklist submission and a custom course both owned by the lead,
    // not the admin — these manual checks previously excluded admin
    // entirely since they didn't go through requireRole(). Self-contained
    // fixtures rather than relying on another describe block's side effects.
    const tplId = db.prepare(
      "INSERT INTO checklist_templates (name, task_type) VALUES ('Audit Fixture Template', 'prelending')"
    ).run().lastInsertRowid;
    submissionId = db.prepare(
      'INSERT INTO checklist_submissions (user_id, template_id, task_name) VALUES (?, ?, ?)'
    ).run(leadId, tplId, 'Audit Fixture Task').lastInsertRowid;
    courseId = db.prepare(
      'INSERT INTO custom_courses (title, created_by, is_published) VALUES (?, ?, 0)'
    ).run('Admin Bypass Fixture Course', leadId).lastInsertRowid;
    // A module+lesson is required for the publish-toggle test below —
    // publishing now validates the course actually has content.
    const modId = db.prepare(
      'INSERT INTO custom_modules (course_id, title, order_num) VALUES (?, ?, 0)'
    ).run(courseId, 'M1').lastInsertRowid;
    db.prepare(
      'INSERT INTO custom_lessons (module_id, title, type, order_num) VALUES (?, ?, ?, 0)'
    ).run(modId, 'L1', 'lesson');
  });

  it('admin can view a checklist submission they did not author', async () => {
    const res = await request(app)
      .get(`/api/checklists/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('a plain tester still cannot view someone else\'s submission (no over-permission introduced)', async () => {
    const res = await request(app)
      .get(`/api/checklists/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(403);
  });

  it('admin can view an unpublished course they did not author', async () => {
    const res = await request(app)
      .get(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('a tester still cannot view that unpublished course (no over-permission introduced)', async () => {
    const res = await request(app)
      .get(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(403);
  });

  it('admin can edit a course they did not author', async () => {
    const res = await request(app)
      .put(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Edited By Admin' });
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT title FROM custom_courses WHERE id = ?').get(courseId).title).toBe('Edited By Admin');
  });

  it('admin can toggle publish on a course they did not author', async () => {
    const res = await request(app)
      .patch(`/api/custom-courses/${courseId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.is_published).toBe(1);
  });

  it('a lead who does not own the course still gets 403 (the bypass is admin-only, not lead-wide)', async () => {
    db.prepare(
      'INSERT INTO users (email, password, name, role, avatar_initials) VALUES (?, ?, ?, ?, ?)'
    ).run('otherlead@test.local', bcryptjs.hashSync('otherleadpass123', 4), 'Other Lead', 'lead', 'OL');
    const otherLeadToken = await loginAs(request, app, 'otherlead@test.local', 'otherleadpass123');

    const res = await request(app)
      .put(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${otherLeadToken}`)
      .send({ title: 'Should Be Rejected' });
    expect(res.status).toBe(403);
  });

  it('admin can delete a course they did not author (soft-delete — see trash)', async () => {
    const res = await request(app)
      .delete(`/api/custom-courses/${courseId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // Deletion is now a soft-delete (see /api/admin/trash) — the row stays,
    // just marked deleted_at, and disappears from the normal list/detail routes.
    const row = db.prepare('SELECT deleted_at FROM custom_courses WHERE id = ?').get(courseId);
    expect(row.deleted_at).not.toBeNull();
    const listed = await request(app).get(`/api/custom-courses/${courseId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(listed.status).toBe(404);
  });
});
