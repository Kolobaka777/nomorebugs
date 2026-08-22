// Checklists were removed from the product on 2026-08-15: no route, no
// screen. Their tables went on being created at every boot, and a seed on a
// new install filled them with three templates besides. What is checked here
// is the opposite: a new database never creates them, and an existing one
// loses only the ones holding nothing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

const CHECKLIST_TABLES = ['checklist_item_results', 'checklist_submissions', 'checklist_items', 'checklist_templates'];

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checklist-teardown-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

// One process per case: schema.js opens the database at import, so a single
// test run cannot import it twice against different paths.
function initAt(dbPath) {
  const { execFileSync } = require('child_process');
  execFileSync(process.execPath, ['-e', `
    import('${path.resolve('db/schema.js').replace(/\\\\/g, '/')}').then(({ initDb }) => initDb());
  `], { env: { ...process.env, DB_PATH: dbPath }, stdio: 'pipe' });
}

const tablesIn = dbPath => {
  const d = new Database(dbPath, { readonly: true });
  const names = d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  d.close();
  return names;
};

// Exactly the definitions the schema carried before the removal.
function makeLegacyChecklistTables(dbPath, { withData }) {
  const d = new Database(dbPath);
  d.exec(`
    CREATE TABLE checklist_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, task_type TEXT NOT NULL);
    CREATE TABLE checklist_items (id INTEGER PRIMARY KEY AUTOINCREMENT, template_id INTEGER NOT NULL, text TEXT NOT NULL);
    CREATE TABLE checklist_submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, template_id INTEGER NOT NULL, task_name TEXT NOT NULL, task_type TEXT DEFAULT '');
    CREATE TABLE checklist_item_results (id INTEGER PRIMARY KEY AUTOINCREMENT, submission_id INTEGER NOT NULL, item_id INTEGER NOT NULL, status TEXT NOT NULL);
  `);
  if (withData) {
    d.prepare("INSERT INTO checklist_templates (name, task_type) VALUES ('Прелендинг', 'prelending')").run();
    d.prepare("INSERT INTO checklist_submissions (user_id, template_id, task_name, task_type) VALUES (1, 1, 'Проверка', 'prelending')").run();
  }
  d.close();
}

describe('a new install', () => {
  it('never creates the checklist tables at all', () => {
    const dbPath = path.join(dir, 'fresh.db');
    initAt(dbPath);
    expect(tablesIn(dbPath).filter(n => n.startsWith('checklist'))).toEqual([]);
  });

  it('does not create task_types either, which existed only for them', () => {
    // The task types list populated the dropdown on the checklist submission
    // form. Once that went, an admin curated a lookup nobody read, while the
    // admin panel went on promising the dropdown.
    const dbPath = path.join(dir, 'fresh.db');
    initAt(dbPath);
    expect(tablesIn(dbPath)).not.toContain('task_types');
  });

  it('survives a restart without erroring', () => {
    const dbPath = path.join(dir, 'fresh.db');
    initAt(dbPath);
    initAt(dbPath);
    initAt(dbPath);
    expect(tablesIn(dbPath).filter(n => n.startsWith('checklist'))).toEqual([]);
  });
});

describe('an existing database', () => {
  it('loses the empty checklist tables', () => {
    const dbPath = path.join(dir, 'old-empty.db');
    makeLegacyChecklistTables(dbPath, { withData: false });
    initAt(dbPath);
    expect(tablesIn(dbPath).filter(n => n.startsWith('checklist'))).toEqual([]);
  });

  it('keeps them whole when they hold real submission history', () => {
    // Deleting real data is a decision taken with an export and a
    // confirmation, not a side effect of a deploy.
    const dbPath = path.join(dir, 'old-with-data.db');
    makeLegacyChecklistTables(dbPath, { withData: true });
    initAt(dbPath);

    const left = tablesIn(dbPath).filter(n => n.startsWith('checklist'));
    expect(left.sort()).toEqual([...CHECKLIST_TABLES].sort());

    const d = new Database(dbPath, { readonly: true });
    expect(d.prepare('SELECT COUNT(*) c FROM checklist_submissions').get().c).toBe(1);
    expect(d.prepare('SELECT name FROM checklist_templates').get().name).toBe('Прелендинг');
    d.close();
  });

  it('and does not fail on the next boot when they remain', () => {
    const dbPath = path.join(dir, 'old-with-data.db');
    makeLegacyChecklistTables(dbPath, { withData: true });
    initAt(dbPath);
    expect(() => initAt(dbPath)).not.toThrow();
  });
});
