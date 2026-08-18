// The other half of the backup story. src/backup.js was covered; restoring
// what it writes was not, so "we have backups" had never once been checked
// end to end. This does the round trip against real files on disk.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

const workDir = path.join(os.tmpdir(), `restore-test-${process.pid}-${Date.now()}`);
const dbPath = path.join(workDir, 'live.db');
const backupDir = path.join(workDir, 'backups');

const { listBackups, verifyBackup, restoreBackup } = await import('../scripts/restore-backup.js');

function openLive() {
  return new Database(dbPath);
}

beforeAll(() => {
  fs.mkdirSync(backupDir, { recursive: true });
  const live = openLive();
  live.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)');
  live.prepare('INSERT INTO users (email) VALUES (?)').run('before@qa.com');
  live.prepare('INSERT INTO users (email) VALUES (?)').run('also-before@qa.com');
  live.close();
});

afterAll(() => fs.rmSync(workDir, { recursive: true, force: true }));

describe('backup restore', () => {
  it('restores the rows a backup was taken with, discarding whatever happened after it', async () => {
    const live = openLive();
    await live.backup(path.join(backupDir, 'backup-2026-08-18T10-00-00-000Z.db'));
    // Damage done after the snapshot — this is what a restore is for.
    live.exec('DELETE FROM users');
    expect(live.prepare('SELECT COUNT(*) c FROM users').get().c).toBe(0);
    live.close();

    const res = restoreBackup(path.join(backupDir, 'backup-2026-08-18T10-00-00-000Z.db'), dbPath);
    expect(res.users).toBe(2);

    const after = openLive();
    expect(after.prepare('SELECT COUNT(*) c FROM users').get().c).toBe(2);
    expect(after.prepare('SELECT email FROM users ORDER BY id').all().map(r => r.email))
      .toEqual(['before@qa.com', 'also-before@qa.com']);
    after.close();
  });

  it('keeps a copy of the database it overwrote — restoring onto a healthy DB by mistake has to be undoable', () => {
    const res = restoreBackup(path.join(backupDir, 'backup-2026-08-18T10-00-00-000Z.db'), dbPath);
    expect(res.previous).toBeTruthy();
    expect(fs.existsSync(res.previous)).toBe(true);
  });

  it('refuses a file that is not a usable database, before anything is overwritten', () => {
    const junk = path.join(workDir, 'junk.db');
    fs.writeFileSync(junk, 'это не база данных, а просто текст');
    expect(() => restoreBackup(junk, dbPath)).toThrow();
    // The live DB must still be the restored one, untouched by the attempt.
    const live = openLive();
    expect(live.prepare('SELECT COUNT(*) c FROM users').get().c).toBe(2);
    live.close();
  });

  it('refuses a valid database that is not this application\'s', () => {
    const foreign = path.join(workDir, 'foreign.db');
    const f = new Database(foreign);
    f.exec('CREATE TABLE something_else (id INTEGER)');
    f.close();
    expect(verifyBackup(foreign).ok).toBe(false);
  });

  it('lists backups newest last, so --latest picks the right one', async () => {
    const live = openLive();
    await live.backup(path.join(backupDir, 'backup-2026-08-18T18-00-00-000Z.db'));
    live.close();
    const listed = listBackups(backupDir);
    expect(listed.map(b => b.name)).toEqual([
      'backup-2026-08-18T10-00-00-000Z.db',
      'backup-2026-08-18T18-00-00-000Z.db',
    ]);
  });
});
