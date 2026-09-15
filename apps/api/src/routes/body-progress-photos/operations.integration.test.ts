import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { MultipartFile } from '@fastify/multipart';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const TEST_KEY = Buffer.alloc(32, 3).toString('base64');
const originalDatabaseUrl = process.env.DATABASE_URL;
let directory = '';
let mediaRoot = '';
let dbModule: typeof import('../../db/index.js');

const part = (contents: Buffer) =>
  ({
    type: 'file',
    fieldname: 'front',
    filename: 'synthetic-clothed.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    file: Object.assign(Readable.from(contents), { truncated: false }),
    fields: {},
    toBuffer: async () => contents,
  }) as unknown as MultipartFile;

const seedStoredPhoto = async () => {
  const { bodyProgressPhotos, bodyProgressPhotoSets, users } =
    await import('../../db/schema/index.js');
  const { processAndEncryptPhoto } = await import('./media.js');
  dbModule.db
    .insert(users)
    .values({
      id: 'fixture-user',
      username: 'fixture-user',
      passwordHash: 'fictional',
      preferences: { timeZone: 'America/Detroit' },
    })
    .run();
  dbModule.db
    .insert(bodyProgressPhotoSets)
    .values({
      id: '22222222-2222-4222-8222-222222222222',
      userId: 'fixture-user',
      date: '2026-09-15',
      guideVersion: 'body-progress-photo-guide-v1',
      context: {},
      status: 'partial',
      countAsScheduledOccurrence: false,
    })
    .run();
  const fixture = await sharp(
    Buffer.from(
      `<svg width="180" height="260" xmlns="http://www.w3.org/2000/svg"><rect width="180" height="260" fill="#dce7ef"/><circle cx="90" cy="45" r="24" fill="#986943"/><path d="M50 74h80l18 112H32z" fill="#24608d"/></svg>`,
    ),
  )
    .jpeg()
    .toBuffer();
  const processed = await processAndEncryptPhoto({
    part: part(fixture),
    photoId: '33333333-3333-4333-8333-333333333333',
    userId: 'fixture-user',
    view: 'front',
  });
  dbModule.db
    .insert(bodyProgressPhotos)
    .values({
      id: '33333333-3333-4333-8333-333333333333',
      setId: '22222222-2222-4222-8222-222222222222',
      userId: 'fixture-user',
      view: 'front',
      normalizedMediaType: 'image/jpeg',
      byteSize: processed.normalized.byteSize,
      width: processed.normalized.width,
      height: processed.normalized.height,
      checksum: processed.normalized.checksum,
      variants: processed.variants,
      encryptionVersion: 'aes-256-gcm-v1',
      processingVersion: 'sharp-jpeg-v1',
    })
    .run();
  return processed;
};

describe('progress photo backup, restore, and orphan lifecycle', () => {
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pulse-photo-operations-'));
    process.env.DATABASE_URL = join(directory, 'live.db');
    mediaRoot = join(directory, 'private/body-progress');
    process.env.BODY_PROGRESS_MEDIA_ROOT = mediaRoot;
    process.env.BODY_PROGRESS_MEDIA_KEY = TEST_KEY;
    vi.resetModules();
    dbModule = await import('../../db/index.js');
    migrate(dbModule.db, { migrationsFolder });
  });
  afterEach(() => {
    dbModule.sqlite.close();
    process.env.DATABASE_URL = originalDatabaseUrl;
    delete process.env.BODY_PROGRESS_MEDIA_ROOT;
    delete process.env.BODY_PROGRESS_MEDIA_KEY;
    rmSync(directory, { recursive: true, force: true });
    vi.resetModules();
  });

  it('round-trips one synthetic encrypted archive, fails without its separate key, and keeps orphan repair explicit/user-scoped', async () => {
    const { bodyProgressPhotos, bodyProgressPhotoSets, users } =
      await import('../../db/schema/index.js');
    const { processAndEncryptPhoto } = await import('./media.js');
    dbModule.db
      .insert(users)
      .values({
        id: 'fixture-user',
        username: 'fixture-user',
        passwordHash: 'fictional',
        preferences: { timeZone: 'America/Detroit' },
      })
      .run();
    dbModule.db
      .insert(bodyProgressPhotoSets)
      .values({
        id: '22222222-2222-4222-8222-222222222222',
        userId: 'fixture-user',
        date: '2026-09-15',
        guideVersion: 'body-progress-photo-guide-v1',
        context: {},
        status: 'partial',
        countAsScheduledOccurrence: false,
      })
      .run();
    const fixture = await sharp(
      Buffer.from(
        `<svg width="180" height="260" xmlns="http://www.w3.org/2000/svg"><rect width="180" height="260" fill="#dce7ef"/><circle cx="90" cy="45" r="24" fill="#986943"/><path d="M50 74h80l18 112H32z" fill="#24608d"/></svg>`,
      ),
    )
      .jpeg()
      .toBuffer();
    const processed = await processAndEncryptPhoto({
      part: part(fixture),
      photoId: '33333333-3333-4333-8333-333333333333',
      userId: 'fixture-user',
      view: 'front',
    });
    dbModule.db
      .insert(bodyProgressPhotos)
      .values({
        id: '33333333-3333-4333-8333-333333333333',
        setId: '22222222-2222-4222-8222-222222222222',
        userId: 'fixture-user',
        view: 'front',
        normalizedMediaType: 'image/jpeg',
        byteSize: processed.normalized.byteSize,
        width: processed.normalized.width,
        height: processed.normalized.height,
        checksum: processed.normalized.checksum,
        variants: processed.variants,
        encryptionVersion: 'aes-256-gcm-v1',
        processingVersion: 'sharp-jpeg-v1',
      })
      .run();

    const reportModule = await import('../../scripts/audit-progress-photo-orphans.js');
    expect(await reportModule.auditProgressPhotoOrphans()).toMatchObject({
      mode: 'report_only',
      metadataWithoutFileCount: 0,
      fileWithoutMetadataCount: 0,
    });
    writeFileSync(
      join(mediaRoot, '44444444-4444-4444-8444-444444444444.enc'),
      'orphan ciphertext',
      { mode: 0o600 },
    );
    const firstVariant = processed.variants[0];
    if (!firstVariant) throw new Error('Synthetic processing produced no variants');
    await rm(join(mediaRoot, firstVariant.storageKey));
    expect(await reportModule.auditProgressPhotoOrphans()).toMatchObject({
      mode: 'report_only',
      metadataWithoutFileCount: 1,
      fileWithoutMetadataCount: 1,
      repairedMetadataCount: 0,
    });
    expect(dbModule.db.select().from(bodyProgressPhotos).all()).toHaveLength(1);
    await expect(reportModule.auditProgressPhotoOrphans({ repair: true })).rejects.toThrow(
      /--user-id/,
    );
    expect(
      await reportModule.auditProgressPhotoOrphans({ repair: true, userId: 'fixture-user' }),
    ).toMatchObject({
      mode: 'repair_user_metadata',
      repairedMetadataCount: 1,
      fileRepairPerformed: false,
    });
    expect(dbModule.db.select().from(bodyProgressPhotos).all()).toHaveLength(0);

    // Reinsert the verified fixture for a backup made after the orphan repair proof.
    const second = await processAndEncryptPhoto({
      part: part(fixture),
      photoId: '55555555-5555-4555-8555-555555555555',
      userId: 'fixture-user',
      view: 'front',
    });
    dbModule.db
      .insert(bodyProgressPhotos)
      .values({
        id: '55555555-5555-4555-8555-555555555555',
        setId: '22222222-2222-4222-8222-222222222222',
        userId: 'fixture-user',
        view: 'front',
        normalizedMediaType: 'image/jpeg',
        byteSize: second.normalized.byteSize,
        width: second.normalized.width,
        height: second.normalized.height,
        checksum: second.normalized.checksum,
        variants: second.variants,
        encryptionVersion: 'aes-256-gcm-v1',
        processingVersion: 'sharp-jpeg-v1',
      })
      .run();
    const staging = join(directory, 'backup-stage');
    mkdirSync(join(staging, 'private/body-progress'), { recursive: true, mode: 0o700 });
    await dbModule.sqlite.backup(join(staging, 'pulse.db'));
    cpSync(mediaRoot, join(staging, 'private/body-progress'), { recursive: true });
    writeFileSync(
      join(staging, 'manifest.txt'),
      'format=pulse-backup-v2\nmedia_key_included=false\nretention=newest-30-archives\n',
    );
    const archive = join(directory, 'synthetic-backup.tar.gz');
    execFileSync('tar', [
      '-C',
      staging,
      '-czf',
      archive,
      'manifest.txt',
      'pulse.db',
      'private/body-progress',
    ]);
    const { verifyProgressPhotoRestore } =
      await import('../../scripts/verify-progress-photo-restore.js');
    await expect(verifyProgressPhotoRestore(archive)).resolves.toEqual({
      format: 'pulse-backup-v2',
      databaseQuickCheck: 'ok',
      foreignKeyViolationCount: 0,
      verifiedPhotoCount: 1,
      verifiedObjectCount: 4,
      mediaKeyIncluded: false,
    });
    delete process.env.BODY_PROGRESS_MEDIA_KEY;
    await expect(verifyProgressPhotoRestore(archive)).rejects.toThrow(/required separately/);
    process.env.BODY_PROGRESS_MEDIA_KEY = Buffer.alloc(32, 7).toString('base64');
    await expect(verifyProgressPhotoRestore(archive)).rejects.toMatchObject({
      code: 'BODY_PROGRESS_PHOTO_INTEGRITY_FAILURE',
    });
  });

  it('purges account media and rolls staged files back when metadata deletion fails', async () => {
    const { bodyProgressPhotos } = await import('../../db/schema/index.js');
    const { deletePhoto } = await import('./store.js');
    await seedStoredPhoto();
    expect((await readdir(mediaRoot)).filter((name) => name.endsWith('.enc'))).toHaveLength(4);

    dbModule.sqlite.exec(`
      CREATE TRIGGER fixture_block_photo_delete
      BEFORE DELETE ON body_progress_photos
      BEGIN
        SELECT RAISE(ABORT, 'synthetic metadata delete failure');
      END;
    `);
    await expect(
      deletePhoto('33333333-3333-4333-8333-333333333333', 'fixture-user'),
    ).rejects.toThrow(/synthetic metadata delete failure/);
    expect(dbModule.db.select().from(bodyProgressPhotos).all()).toHaveLength(1);
    expect((await readdir(mediaRoot)).filter((name) => name.endsWith('.enc'))).toHaveLength(4);
    dbModule.sqlite.exec('DROP TRIGGER fixture_block_photo_delete');

    const { deleteUserAccount } = await import('../auth/store.js');
    await expect(deleteUserAccount('fixture-user')).resolves.toBe(true);
    expect(dbModule.db.select().from(bodyProgressPhotos).all()).toHaveLength(0);
    expect((await readdir(mediaRoot)).filter((name) => name.endsWith('.enc'))).toHaveLength(0);
  });
});
