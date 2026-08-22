// Getting a copy back out of the bucket.
//
// The off-site upload existed and was tested; restoring from it did not
// exist at all. That is the half that matters: on-volume backups vanish
// with the volume, so in the one scenario off-site copies are for, the
// only tooling in the repo could not read them.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

// A bucket that is just a directory: enough to prove the round trip without
// pretending to reimplement S3.
const bucket = new Map();

const drain = async (input) => {
  if (input?.Body && typeof input.Body.pipe === 'function') {
    const chunks = [];
    await new Promise((resolve, reject) => {
      input.Body.on('data', c => chunks.push(c));
      input.Body.on('end', resolve);
      input.Body.on('error', reject);
    });
    bucket.set(input.Key, Buffer.concat(chunks));
  }
  return {};
};

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    async send(cmd) {
      const kind = cmd.constructor.kind;
      if (kind === 'put') return drain(cmd.input);
      if (kind === 'list') {
        const prefix = cmd.input.Prefix || '';
        return {
          Contents: [...bucket.keys()].filter(k => k.startsWith(prefix))
            .map(k => ({ Key: k, Size: bucket.get(k).length, LastModified: new Date(0) })),
          IsTruncated: false,
        };
      }
      if (kind === 'get') {
        const data = bucket.get(cmd.input.Key);
        if (!data) throw new Error('NoSuchKey');
        const { Readable } = await import('stream');
        return { Body: Readable.from([data]) };
      }
      throw new Error('unexpected command');
    }
  },
  PutObjectCommand: class { static kind = 'put'; constructor(input) { this.input = input; } },
  GetObjectCommand: class { static kind = 'get'; constructor(input) { this.input = input; } },
  ListObjectsV2Command: class { static kind = 'list'; constructor(input) { this.input = input; } },
}));

const { uploadFile, listOffsiteBackups, resetS3Client } = await import('../src/s3.js');
const { fetchFromOffsite, verifyBackup, restoreBackup, listOffsiteBackupsOrExplain } = await import('../scripts/restore-backup.js');

let workDir;
const ORIGINAL_ENV = { ...process.env };

// A real, small SQLite database with the table verifyBackup insists on.
function makeDb(file, userCount) {
  const d = new Database(file);
  d.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT)');
  const ins = d.prepare('INSERT INTO users (email) VALUES (?)');
  for (let i = 0; i < userCount; i++) ins.run(`u${i}@test.local`);
  d.close();
  return file;
}

beforeEach(() => {
  bucket.clear();
  resetS3Client();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offsite-restore-'));
  process.env = { ...ORIGINAL_ENV };
  process.env.BACKUP_S3_BUCKET = 'my-bucket';
  process.env.BACKUP_S3_ACCESS_KEY_ID = 'key';
  process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'secret';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe('round trip through the bucket', () => {
  it('a database uploaded off-site comes back byte for byte', async () => {
    const original = makeDb(path.join(workDir, 'backup-2026-08-20T00-00-00-000Z.db'), 7);
    await uploadFile(original);

    const fetched = await fetchFromOffsite();
    expect(fetched.name).toBe('backup-2026-08-20T00-00-00-000Z.db');
    expect(fs.readFileSync(fetched.file)).toEqual(fs.readFileSync(original));
  });

  it('what comes back passes the same check a local backup has to pass', async () => {
    await uploadFile(makeDb(path.join(workDir, 'backup-2026-08-20T00-00-00-000Z.db'), 3));
    const fetched = await fetchFromOffsite();
    expect(verifyBackup(fetched.file)).toEqual({ ok: true, users: 3 });
  });

  it('restores over a live database and keeps the one it replaced', async () => {
    await uploadFile(makeDb(path.join(workDir, 'backup-2026-08-20T00-00-00-000Z.db'), 5));
    const live = makeDb(path.join(workDir, 'live.db'), 99);

    const fetched = await fetchFromOffsite();
    const result = restoreBackup(fetched.file, live);

    expect(result.users).toBe(5);
    expect(new Database(live, { readonly: true }).prepare('SELECT COUNT(*) c FROM users').get().c).toBe(5);
    // Restoring onto a healthy database by mistake has to be undoable.
    expect(fs.existsSync(result.previous)).toBe(true);
    expect(new Database(result.previous, { readonly: true }).prepare('SELECT COUNT(*) c FROM users').get().c).toBe(99);
  });

  it('takes the newest copy when no name is given', async () => {
    await uploadFile(makeDb(path.join(workDir, 'backup-2026-08-19T00-00-00-000Z.db'), 1));
    await uploadFile(makeDb(path.join(workDir, 'backup-2026-08-21T00-00-00-000Z.db'), 2));
    expect((await fetchFromOffsite()).name).toBe('backup-2026-08-21T00-00-00-000Z.db');
  });

  it('takes the one asked for by name', async () => {
    await uploadFile(makeDb(path.join(workDir, 'backup-2026-08-19T00-00-00-000Z.db'), 1));
    await uploadFile(makeDb(path.join(workDir, 'backup-2026-08-21T00-00-00-000Z.db'), 2));
    const fetched = await fetchFromOffsite('backup-2026-08-19T00-00-00-000Z.db');
    expect(verifyBackup(fetched.file).users).toBe(1);
  });

  it('lists what is actually in the bucket, oldest first', async () => {
    await uploadFile(makeDb(path.join(workDir, 'backup-2026-08-21T00-00-00-000Z.db'), 1));
    await uploadFile(makeDb(path.join(workDir, 'backup-2026-08-19T00-00-00-000Z.db'), 1));
    expect((await listOffsiteBackups()).map(o => o.name)).toEqual([
      'backup-2026-08-19T00-00-00-000Z.db',
      'backup-2026-08-21T00-00-00-000Z.db',
    ]);
  });
});

describe('when it cannot work', () => {
  it('says so plainly when off-site backups were never configured', async () => {
    delete process.env.BACKUP_S3_BUCKET;
    await expect(fetchFromOffsite()).rejects.toThrow(/BACKUP_S3/);
  });

  it('listing an unconfigured bucket says the same thing, not an SDK internal', async () => {
    // Unguarded, the AWS SDK answers with "No value provided for input HTTP
    // label: Bucket" — which is what an operator got from the documented
    // `npm run backups:s3` on a service where the variables were never set.
    delete process.env.BACKUP_S3_BUCKET;
    await expect(listOffsiteBackupsOrExplain()).rejects.toThrow(/BACKUP_S3/);
  });

  it('says so plainly when the bucket is empty', async () => {
    await expect(fetchFromOffsite()).rejects.toThrow(/нет ни одной копии/);
  });

  it('says so plainly when the requested copy is not there', async () => {
    await uploadFile(makeDb(path.join(workDir, 'backup-2026-08-19T00-00-00-000Z.db'), 1));
    await expect(fetchFromOffsite('backup-1999-01-01T00-00-00-000Z.db')).rejects.toThrow(/нет копии с именем/);
  });

  it('refuses to overwrite the live database with a truncated copy', async () => {
    // The worst moment to discover a half-written object is after it has
    // replaced the only good file.
    const good = makeDb(path.join(workDir, 'backup-2026-08-20T00-00-00-000Z.db'), 4);
    const truncated = path.join(workDir, 'truncated.db');
    fs.writeFileSync(truncated, fs.readFileSync(good).subarray(0, 200));
    bucket.set('backups/backup-2026-08-20T00-00-00-000Z.db', fs.readFileSync(truncated));

    const fetched = await fetchFromOffsite();
    const live = makeDb(path.join(workDir, 'live.db'), 42);
    expect(() => restoreBackup(fetched.file, live)).toThrow(/не прошёл проверку/);
    expect(new Database(live, { readonly: true }).prepare('SELECT COUNT(*) c FROM users').get().c).toBe(42);
  });
});
