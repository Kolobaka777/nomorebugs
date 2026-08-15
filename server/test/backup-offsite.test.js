// Regression coverage for the 2026-08-15 audit finding: on-volume-only
// backups are a single point of total data loss (a lost/corrupted Railway
// volume takes the live DB *and* all 28 backup generations with it). See
// backup.js's shipBackupOffsite()/isOffsiteBackupEnabled() — S3-compatible
// upload (works with AWS S3, Cloudflare R2, Backblaze B2), no-op unless
// BACKUP_S3_* env vars are set, matching how Sentry/SMTP/Telegram are
// wired elsewhere in this codebase.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const sendMock = vi.fn().mockResolvedValue({});
const S3ClientMock = vi.fn();
let lastPutObjectArgs = null;
vi.mock('@aws-sdk/client-s3', () => ({
  // Must be a real class/function usable with `new` — backup.js does
  // `new S3Client({...})`, and an arrow function throws "is not a
  // constructor" there.
  S3Client: class {
    constructor(...args) {
      S3ClientMock(...args);
      this.send = sendMock;
    }
  },
  PutObjectCommand: class {
    constructor(input) {
      lastPutObjectArgs = input;
      this.input = input;
    }
  },
}));

const { logError } = await import('../src/sentry.js');
vi.mock('../src/sentry.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, logError: vi.fn() };
});

const fs = await import('fs');
const os = await import('os');
const path = await import('path');

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  sendMock.mockClear();
  sendMock.mockResolvedValue({});
  lastPutObjectArgs = null;
  process.env = { ...ORIGINAL_ENV };
  delete process.env.BACKUP_S3_BUCKET;
  delete process.env.BACKUP_S3_ACCESS_KEY_ID;
  delete process.env.BACKUP_S3_SECRET_ACCESS_KEY;
  delete process.env.BACKUP_S3_ENDPOINT;
  delete process.env.BACKUP_S3_PREFIX;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('isOffsiteBackupEnabled', () => {
  it('is false when no BACKUP_S3_* vars are set (the default — no behavior change for existing deployments)', async () => {
    const { isOffsiteBackupEnabled } = await import('../src/backup.js');
    expect(isOffsiteBackupEnabled()).toBe(false);
  });

  it('is false when only some of the required vars are set', async () => {
    process.env.BACKUP_S3_BUCKET = 'my-bucket';
    const { isOffsiteBackupEnabled } = await import('../src/backup.js');
    expect(isOffsiteBackupEnabled()).toBe(false);
  });

  it('is true once bucket + both credential vars are set', async () => {
    process.env.BACKUP_S3_BUCKET = 'my-bucket';
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'key';
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'secret';
    const { isOffsiteBackupEnabled } = await import('../src/backup.js');
    expect(isOffsiteBackupEnabled()).toBe(true);
  });
});

describe('shipBackupOffsite', () => {
  it('is a no-op (returns false, never touches the S3 client) when unconfigured', async () => {
    const { shipBackupOffsite } = await import('../src/backup.js');
    const result = await shipBackupOffsite('/tmp/whatever.db');
    expect(result).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('uploads the backup file under BACKUP_S3_PREFIX (default "backups/") when configured', async () => {
    process.env.BACKUP_S3_BUCKET = 'my-bucket';
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'key';
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'secret';
    const { shipBackupOffsite } = await import('../src/backup.js');

    const tmpFile = path.join(os.tmpdir(), `offsite-fixture-${process.pid}.db`);
    fs.writeFileSync(tmpFile, 'fake sqlite bytes');

    const result = await shipBackupOffsite(tmpFile);
    expect(result).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(lastPutObjectArgs.Bucket).toBe('my-bucket');
    expect(lastPutObjectArgs.Key).toBe(`backups/${path.basename(tmpFile)}`);
    expect(Buffer.isBuffer(lastPutObjectArgs.Body)).toBe(true);

    fs.unlinkSync(tmpFile);
  });

  it('honors a custom BACKUP_S3_PREFIX', async () => {
    process.env.BACKUP_S3_BUCKET = 'my-bucket';
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'key';
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'secret';
    process.env.BACKUP_S3_PREFIX = 'nightly/';
    const { shipBackupOffsite } = await import('../src/backup.js');

    const tmpFile = path.join(os.tmpdir(), `offsite-fixture-prefix-${process.pid}.db`);
    fs.writeFileSync(tmpFile, 'fake sqlite bytes');
    await shipBackupOffsite(tmpFile);
    expect(lastPutObjectArgs.Key).toBe(`nightly/${path.basename(tmpFile)}`);
    fs.unlinkSync(tmpFile);
  });

  it('a failed upload is caught, logged, and reported as false — never throws or breaks the local backup cycle', async () => {
    process.env.BACKUP_S3_BUCKET = 'my-bucket';
    process.env.BACKUP_S3_ACCESS_KEY_ID = 'key';
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'secret';
    sendMock.mockRejectedValueOnce(new Error('network blip'));
    const { shipBackupOffsite } = await import('../src/backup.js');

    const tmpFile = path.join(os.tmpdir(), `offsite-fixture-fail-${process.pid}.db`);
    fs.writeFileSync(tmpFile, 'fake sqlite bytes');

    await expect(shipBackupOffsite(tmpFile)).resolves.toBe(false);
    expect(logError).toHaveBeenCalled();

    fs.unlinkSync(tmpFile);
  });
});