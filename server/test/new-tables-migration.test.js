import { describe, it, expect, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Regression coverage for the commit-f58e3f8 migrations (the knowledge-base
// column, plus the new bug_examples/glossary_terms/granted_permissions/
// custom_course_views tables) — every other test file uses a fresh `:memory:`
// DB via initDb(), which never exercises the "existing DB missing these"
// branch at all, since a fresh DB always gets them from the CREATE TABLE IF
// NOT EXISTS block. This seeds a DB shaped like a real pre-migration
// deployment (v2 checklist schema — has `category`, missing `note` — and no
// knowledge-base/permissions tables at all) and proves initDb() upgrades it
// in place without losing existing rows.
const dbPath = path.join(os.tmpdir(), `new-tables-migration-test-${process.pid}.db`);

function cleanup() {
  for (const suffix of ['', '-shm', '-wal']) {
    if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

afterAll(cleanup);

function seedPreMigrationSchema() {
  cleanup();
  const raw = new Database(dbPath);
  raw.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar_initials TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE checklist_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      task_type TEXT NOT NULL,
      color TEXT DEFAULT '#1D9E75',
      order_num INTEGER DEFAULT 0
    );

    CREATE TABLE checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      category TEXT DEFAULT '',
      text TEXT NOT NULL,
      order_num INTEGER DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES checklist_templates(id)
    );

    CREATE TABLE checklist_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      template_id INTEGER NOT NULL,
      task_name TEXT NOT NULL,
      content_author TEXT DEFAULT '',
      verska_author TEXT DEFAULT '',
      task_type TEXT DEFAULT '',
      check_date TEXT DEFAULT '',
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (template_id) REFERENCES checklist_templates(id)
    );

    -- Deliberately the PRE-migration shape: no "note" column yet.
    CREATE TABLE checklist_item_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ok', 'fail', 'na')),
      FOREIGN KEY (submission_id) REFERENCES checklist_submissions(id),
      FOREIGN KEY (item_id) REFERENCES checklist_items(id)
    );
    -- No bug_examples / glossary_terms / granted_permissions /
    -- custom_course_views / custom_courses tables at all — this DB predates
    -- all of them.
  `);

  const userId = raw.prepare(
    "INSERT INTO users (email, password, name, role, avatar_initials) VALUES (?, ?, ?, ?, ?)"
  ).run('pre-migration-user@test.local', 'hash', 'Pre Migration User', 'tester', 'PM').lastInsertRowid;
  // Deliberately NOT task_type 'prelending' — schema.js has a separate,
  // unrelated migration step that reseeds an under-stocked 'prelending'
  // template by deleting its checklist_items outright, which would conflict
  // with the checklist_item_results fixture row below. Using a different
  // task_type keeps this test isolated to the migration it's actually
  // covering.
  const tplId = raw.prepare(
    "INSERT INTO checklist_templates (name, task_type) VALUES ('Pre-migration Template', 'smoke')"
  ).run().lastInsertRowid;
  const itemId = raw.prepare(
    "INSERT INTO checklist_items (template_id, category, text) VALUES (?, 'Общее', 'Some check')"
  ).run(tplId).lastInsertRowid;
  const subId = raw.prepare(
    'INSERT INTO checklist_submissions (user_id, template_id, task_name) VALUES (?, ?, ?)'
  ).run(userId, tplId, 'Pre-migration Task').lastInsertRowid;
  // The row that must survive the ALTER TABLE ADD COLUMN with its existing
  // status intact and no data loss.
  raw.prepare(
    'INSERT INTO checklist_item_results (submission_id, item_id, status) VALUES (?, ?, ?)'
  ).run(subId, itemId, 'fail');

  raw.close();
  return { userId, tplId, itemId, subId };
}

describe('new-table / new-column migrations (commit f58e3f8) against a pre-existing DB', () => {
  it('creates the knowledge-base/permissions tables without losing existing data', async () => {
    const { subId } = seedPreMigrationSchema();

    process.env.DB_PATH = dbPath;
    process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
    vi.resetModules();
    const { initDb, db } = await import('../db/schema.js');

    expect(() => initDb()).not.toThrow();

    // Checklists are gone from the product and their tables are no longer
    // created — but a database still holding their history must not lose it on
    // upgrade. The drop only fires on empty ones (see checklist-teardown.test.js).
    const row = db.prepare('SELECT * FROM checklist_item_results WHERE submission_id = ?').get(subId);
    expect(row.status).toBe('fail');

    // New tables exist and are usable.
    const tableNames = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('bug_examples', 'glossary_terms', 'granted_permissions', 'custom_course_views', 'custom_courses')"
    ).all().map(r => r.name).sort();
    expect(tableNames).toEqual(['bug_examples', 'custom_course_views', 'custom_courses', 'glossary_terms', 'granted_permissions']);

    // The one-time seed (a fresh knowledge base has zero rows beforehand)
    // should have populated starter content rather than leaving it empty.
    const bugExampleCount = db.prepare('SELECT COUNT(*) as c FROM bug_examples').get().c;
    const glossaryCount = db.prepare('SELECT COUNT(*) as c FROM glossary_terms').get().c;
    expect(bugExampleCount).toBeGreaterThan(0);
    expect(glossaryCount).toBeGreaterThan(0);

    db.close();
  });

  it('is idempotent — a second initDb() run does not throw, duplicate-seed, or duplicate the note column', async () => {
    process.env.DB_PATH = dbPath;
    vi.resetModules();
    const { initDb, db } = await import('../db/schema.js');

    const beforeBugExamples = db.prepare('SELECT COUNT(*) as c FROM bug_examples').get().c;
    const beforeGlossary = db.prepare('SELECT COUNT(*) as c FROM glossary_terms').get().c;

    expect(() => initDb()).not.toThrow();

    expect(db.prepare('SELECT COUNT(*) as c FROM bug_examples').get().c).toBe(beforeBugExamples);
    expect(db.prepare('SELECT COUNT(*) as c FROM glossary_terms').get().c).toBe(beforeGlossary);

    // A second boot still leaves non-empty checklist tables alone.
    expect(db.prepare('SELECT COUNT(*) as c FROM checklist_item_results').get().c).toBe(1);

    db.close();
  });
});
