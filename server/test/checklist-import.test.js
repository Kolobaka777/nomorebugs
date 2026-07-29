import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let leadToken;

beforeAll(async () => {
  seedTestData(db);
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
});

async function xlsxBuffer(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  for (const row of rows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('checklist template import — category detection', () => {
  it('a well-formed two-column file with real category headers imports cleanly, no warning', async () => {
    const buf = await xlsxBuffer([
      ['Визуал', ''],
      ['', 'Логотип на месте'],
      ['', 'Шрифты соответствуют макету'],
      ['Функционал', ''],
      ['', 'Форма отправляется без ошибок'],
    ]);

    const res = await request(app)
      .post('/api/checklists/templates/import')
      .set('Authorization', `Bearer ${leadToken}`)
      .field('name', 'Clean Import Test')
      .field('color', '#1D9E75')
      .attach('file', buf, { filename: 'clean.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    expect(res.status).toBe(200);
    expect(res.body.item_count).toBe(3);
    expect(res.body.category_count).toBe(2);
    expect(res.body.warning).toBeNull();
  });

  it('a single-column file with no recognizable category rows warns instead of silently flattening', async () => {
    // Every row is plain lowercase text with no trailing ":" — the
    // single-column heuristic (ALL-CAPS or trailing ":") won't recognize
    // any of these as a category header, so everything falls into "Общее".
    const rows = Array.from({ length: 8 }, (_, i) => [`пункт проверки номер ${i + 1}`]);
    const buf = await xlsxBuffer(rows);

    const res = await request(app)
      .post('/api/checklists/templates/import')
      .set('Authorization', `Bearer ${leadToken}`)
      .field('name', 'Suspicious Flat Import Test')
      .field('color', '#1D9E75')
      .attach('file', buf, { filename: 'flat.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    expect(res.status).toBe(200);
    expect(res.body.category_count).toBe(1);
    expect(res.body.warning).toBeTruthy();
  });

  it('importing a template with an already-used name returns a clean 409', async () => {
    const buf = await xlsxBuffer([['Категория', ''], ['', 'Пункт']]);
    const res = await request(app)
      .post('/api/checklists/templates/import')
      .set('Authorization', `Bearer ${leadToken}`)
      .field('name', 'Clean Import Test') // duplicate of the first test's name
      .field('color', '#1D9E75')
      .attach('file', buf, { filename: 'dup.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    expect(res.status).toBe(409);
    expect(res.body.error).not.toMatch(/^server error$/i);
  });
});
