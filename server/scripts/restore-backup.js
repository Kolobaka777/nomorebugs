#!/usr/bin/env node
// Restore the database from one of the rotating backups written by
// src/backup.js.
//
// Backups existed and were tested; restoring them was not, which is the half
// that actually matters during an incident. This script is that half, and
// test/backup-restore.test.js exercises the whole round trip so "we have
// backups" stops being a claim nobody has ever checked.
//
//   node scripts/restore-backup.js --list
//   node scripts/restore-backup.js --latest
//   node scripts/restore-backup.js backups/backup-2026-08-18T10-00-00-000Z.db
//
// And, when the volume itself is gone and the local copies went with it:
//
//   node scripts/restore-backup.js --list-s3
//   node scripts/restore-backup.js --from-s3            (newest in the bucket)
//   node scripts/restore-backup.js --from-s3 backup-2026-08-18T10-00-00-000Z.db
//
// The off-site copies used to be the one thing standing between a lost
// volume and total loss, and nothing here could read them: this script knew
// only about the local directory, which by definition is gone in exactly
// that scenario. Whoever was on call got to improvise the procedure during
// the incident.
//
// Stop the server first. SQLite's online backup API makes *taking* a copy
// safe against a live writer; overwriting the file underneath one is a
// different matter, and this refuses to guess.
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { isOffsiteBackupEnabled, listOffsiteBackups, downloadOffsiteBackup } from '../src/s3.js';

const DB_PATH = process.env.DB_PATH || path.join(import.meta.dirname, '..', 'db', 'learning_hub.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');

export function listBackups(dir = BACKUP_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
    .sort() // ISO-derived stamps sort chronologically as plain strings
    .map(f => {
      const full = path.join(dir, f);
      return { file: full, name: f, size: fs.statSync(full).size, mtime: fs.statSync(full).mtime };
    });
}

/**
 * Checks a candidate file really is a usable database before anything is
 * overwritten with it. A truncated or half-written backup passes "the file
 * exists" and fails everything after, which is the worst possible moment to
 * find out.
 */
export function verifyBackup(file) {
  // A file damaged badly enough does not fail integrity_check — it fails to
  // open at all, and SQLite raises rather than answers ("database disk image
  // is malformed"). That used to escape this function as a raw error and
  // reach the operator as a stack trace, at the exact moment they need a
  // sentence they can act on. Every way of being unusable now comes back
  // the same way: { ok: false, reason }.
  let probe;
  try {
    probe = new Database(file, { readonly: true, fileMustExist: true });
  } catch (err) {
    return { ok: false, reason: `файл не открывается как база — ${err.message}` };
  }
  try {
    const integrity = probe.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') return { ok: false, reason: `integrity_check: ${integrity}` };
    const users = probe.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='users'").get().c;
    if (!users) return { ok: false, reason: 'в файле нет таблицы users — это не бэкап этого приложения' };
    return { ok: true, users: probe.prepare('SELECT COUNT(*) c FROM users').get().c };
  } catch (err) {
    return { ok: false, reason: err.message };
  } finally {
    probe.close();
  }
}

/**
 * Copies `file` over the live database, keeping a timestamped copy of what
 * was there before. Restoring onto a corrupted database is recoverable;
 * restoring onto a *healthy* one by mistake is not, unless the old file is
 * still around — hence the safety copy, which is never pruned.
 */
export function restoreBackup(file, dbPath = DB_PATH) {
  const check = verifyBackup(file);
  if (!check.ok) throw new Error(`Бэкап не прошёл проверку — ${check.reason}`);

  let previous = null;
  if (fs.existsSync(dbPath)) {
    previous = `${dbPath}.before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(dbPath, previous);
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.copyFileSync(file, dbPath);
  // A stale -wal/-shm pair next to the old database would be replayed on top
  // of the file just restored and silently undo part of it.
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
  return { restored: file, previous, users: check.users };
}

// Pulls a copy out of the bucket into a temp file so the existing
// verify-then-swap path can treat it exactly like a local one. Downloaded
// rather than streamed straight over the database on purpose: verifyBackup
// has to be able to reject a truncated or half-written object *before*
// anything overwrites the live file.
// The same guard --list-s3 uses, exported so the check itself is testable
// rather than only reachable by shelling out to the script.
export async function listOffsiteBackupsOrExplain() {
  if (!isOffsiteBackupEnabled()) {
    throw new Error('BACKUP_S3_* не заданы — офсайт-копий нет. См. DEPLOYMENT.md.');
  }
  return listOffsiteBackups();
}

export async function fetchFromOffsite(name) {
  if (!isOffsiteBackupEnabled()) {
    throw new Error('BACKUP_S3_* не заданы — офсайт-копий нет. См. DEPLOYMENT.md.');
  }
  const objects = await listOffsiteBackups();
  if (!objects.length) throw new Error('В бакете нет ни одной копии');

  const chosen = name
    ? objects.find(o => o.name === name || o.key === name)
    : objects.at(-1);
  if (!chosen) throw new Error(`В бакете нет копии с именем ${name}`);

  const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'baga-restore-')), chosen.name);
  await downloadOffsiteBackup(chosen.key, dest);
  return { file: dest, name: chosen.name, size: chosen.size };
}

async function main() {
  const arg = process.argv[2];

  if (arg === '--list-s3') {
    // Guarded the same way --from-s3 is. Without this the AWS SDK answers an
    // unconfigured service with "No value provided for input HTTP label:
    // Bucket" — an internal detail of a dependency, handed to an operator
    // running a documented command at the worst possible moment.
    const objects = await listOffsiteBackupsOrExplain();
    if (!objects.length) {
      console.log('В бакете нет копий');
      return;
    }
    console.log(`Офсайт-копии в ${process.env.BACKUP_S3_BUCKET}:`);
    for (const o of objects) {
      console.log(`  ${o.name}  ${(o.size / 1024 / 1024).toFixed(2)} MB  ${o.mtime?.toISOString?.() ?? ''}`);
    }
    console.log('\nВосстановить:  node scripts/restore-backup.js --from-s3');
    return;
  }

  if (arg === '--from-s3') {
    const fetched = await fetchFromOffsite(process.argv[3]);
    console.log(`Скачано: ${fetched.name} (${(fetched.size / 1024 / 1024).toFixed(2)} MB)`);
    const restored = restoreBackup(fetched.file);
    console.log(`Восстановлено из офсайт-копии ${restored.restored}`);
    console.log(`Пользователей в базе: ${restored.users}`);
    if (restored.previous) console.log(`Прежняя база сохранена: ${restored.previous}`);
    console.log('Теперь можно запускать сервер.');
    return;
  }

  const backups = listBackups();

  if (!arg || arg === '--list') {
    if (!backups.length) {
      console.log(`Бэкапов нет в ${BACKUP_DIR}`);
      return;
    }
    console.log(`Бэкапы в ${BACKUP_DIR}:`);
    for (const b of backups) {
      console.log(`  ${b.name}  ${(b.size / 1024 / 1024).toFixed(2)} MB  ${b.mtime.toISOString()}`);
    }
    console.log('\nВосстановить:  node scripts/restore-backup.js --latest');
    if (isOffsiteBackupEnabled()) console.log('Офсайт-копии:  node scripts/restore-backup.js --list-s3');
    return;
  }

  const file = arg === '--latest' ? backups.at(-1)?.file : path.resolve(arg);
  if (!file) throw new Error(`Нечего восстанавливать — в ${BACKUP_DIR} пусто`);
  if (!fs.existsSync(file)) throw new Error(`Файл не найден: ${file}`);

  const res = restoreBackup(file);
  console.log(`Восстановлено из ${res.restored}`);
  console.log(`Пользователей в базе: ${res.users}`);
  if (res.previous) console.log(`Прежняя база сохранена: ${res.previous}`);
  console.log('Теперь можно запускать сервер.');
}

// Only run when invoked directly, so the test can import the functions above.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch(err => {
    console.error(`Ошибка: ${err.message}`);
    process.exit(1);
  });
}
