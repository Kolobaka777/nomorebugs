// The S3-compatible side of backups, kept apart from backup.js because
// restore needs it too and must not drag the live database along.
//
// backup.js imports `db` — opening the application's own database. The
// restore script's whole job is to overwrite that file, so it cannot import
// anything that opens it first. This module talks to S3 and nothing else.
import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

export function isOffsiteBackupEnabled() {
  return Boolean(
    process.env.BACKUP_S3_BUCKET &&
    process.env.BACKUP_S3_ACCESS_KEY_ID &&
    process.env.BACKUP_S3_SECRET_ACCESS_KEY
  );
}

export function offsitePrefix() {
  return (process.env.BACKUP_S3_PREFIX || 'backups').replace(/\/+$/, '');
}

let s3Client = null;
export function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.BACKUP_S3_REGION || 'auto', // R2 ignores region and expects 'auto'; real AWS S3 needs a real one
      endpoint: process.env.BACKUP_S3_ENDPOINT || undefined, // unset = real AWS S3; set for R2/B2
      credentials: {
        accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

// Only for tests, which swap the env between cases and would otherwise keep
// talking to a client built from whatever the first case happened to set.
export function resetS3Client() {
  s3Client = null;
}

// Uploads a file as a stream rather than a Buffer.
//
// This used to be fs.readFileSync(filePath) — the whole database in memory
// before a byte went anywhere. Avatars are stored in the database as base64
// (a documented trade-off), so it grows with every person who uploads one,
// and the allocation grew with it: a 300 MB database meant a 300 MB spike
// every six hours, on a container whose memory limit nobody had checked
// against it. The failure would land on the off-site copy — the one thing
// protecting against losing the volume — and land harder the more data
// there was to protect.
//
// ContentLength is required: SigV4 will not stream a body of unknown size,
// and the size is free to obtain here. A single PutObject tops out at 5 GB,
// which this database will not approach; past that it would need the
// multipart upload from @aws-sdk/lib-storage, which is not a dependency
// today and is not worth adding for a limit nothing is near.
export async function uploadFile(filePath) {
  const { size } = fs.statSync(filePath);
  const body = fs.createReadStream(filePath);
  // A read stream opens its descriptor asynchronously, so an error can
  // still surface after we have stopped caring about it (the send already
  // failed, or the file went away underneath). Unhandled, that error is
  // thrown at the process, which would turn a failed backup upload into a
  // crashed server — the opposite of shipBackupOffsite's whole contract.
  body.on('error', () => {});
  try {
    await getS3Client().send(new PutObjectCommand({
      Bucket: process.env.BACKUP_S3_BUCKET,
      Key: `${offsitePrefix()}/${path.basename(filePath)}`,
      Body: body,
      ContentLength: size,
    }));
  } catch (err) {
    // A rejected send leaves the stream unconsumed and its descriptor open.
    // The schedule retries every six hours, so a persistent failure — wrong
    // credentials, a bucket typo — would leak one descriptor per attempt
    // for as long as nobody noticed. Not a concern while the body was a
    // Buffer; it is one now.
    body.destroy();
    throw err;
  }
}

// Every backup object in the bucket, oldest first — the same ordering
// listBackups() gives for the local directory, since both sort on the
// ISO-derived timestamp baked into the filename.
export async function listOffsiteBackups() {
  const out = [];
  let ContinuationToken;
  do {
    const page = await getS3Client().send(new ListObjectsV2Command({
      Bucket: process.env.BACKUP_S3_BUCKET,
      Prefix: `${offsitePrefix()}/backup-`,
      ContinuationToken,
    }));
    for (const obj of page.Contents || []) {
      if (obj.Key.endsWith('.db')) {
        out.push({ key: obj.Key, name: path.basename(obj.Key), size: obj.Size, mtime: obj.LastModified });
      }
    }
    ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Streams one object to a local path. Streamed for the same reason the
// upload is: the file being fetched is the whole database.
export async function downloadOffsiteBackup(key, dest) {
  const res = await getS3Client().send(new GetObjectCommand({
    Bucket: process.env.BACKUP_S3_BUCKET,
    Key: key,
  }));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    res.Body.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    res.Body.pipe(out);
  });
  return dest;
}
