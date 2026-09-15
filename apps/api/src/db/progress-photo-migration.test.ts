import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { MultipartFile } from '@fastify/multipart';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';

import { migratePulseDatabase } from './migrate.js';
import {
  decryptVariantToTemporaryFile,
  processAndEncryptPhoto,
} from '../routes/body-progress-photos/media.js';
import type { StoredPhotoVariant } from './schema/body-progress-photos.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const workDirs: string[] = [];
const makeDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pulse-photo-migration-'));
  workDirs.push(dir);
  return dir;
};
const openDb = (path: string) => {
  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
};
const tableExists = (sqlite: Database.Database, table: string) =>
  Boolean(sqlite.prepare("select 1 from sqlite_master where type='table' and name=?").get(table));
const TEST_KEY = Buffer.alloc(32, 11).toString('base64');
const syntheticPart = (contents: Buffer) =>
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
const predecessorMigrations = () => {
  const directory = join(makeDir(), 'drizzle');
  cpSync(migrationsFolder, directory, { recursive: true });
  rmSync(join(directory, '0067_body_progress_photo_storage.sql'));
  rmSync(join(directory, '0068_body_progress_photo_deletion_intents.sql'));
  const journalPath = join(directory, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, 67);
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  return directory;
};

afterAll(() => {
  for (const directory of workDirs) rmSync(directory, { recursive: true, force: true });
});

describe('0067 progress photo migration lifecycle', () => {
  it('creates strict fresh tables with owned relations, cascade, and set-null linkage', () => {
    const sqlite = openDb(join(makeDir(), 'fresh.db'));
    try {
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 69 });
      for (const table of [
        'body_progress_photo_preferences',
        'body_progress_photo_sets',
        'body_progress_photos',
        'body_progress_photo_deletion_intents',
      ])
        expect(tableExists(sqlite, table)).toBe(true);
      sqlite.exec(`
        insert into users(id,username,password_hash,preferences) values
          ('owner','owner','hash','{"timeZone":"America/Detroit"}'),
          ('other','other','hash','{"timeZone":"America/Detroit"}');
        insert into body_check_ins(id,user_id,local_date,status,version,meal_context,workout_context,protocol_version,source,count_as_scheduled_occurrence)
          values('check-in','owner','2026-09-15','draft',1,'unspecified','unspecified','body-circumference-v1','user',1);
        insert into body_check_ins(id,user_id,local_date,status,version,meal_context,workout_context,protocol_version,source,count_as_scheduled_occurrence)
          values('other-check-in','other','2026-09-15','draft',1,'unspecified','unspecified','body-circumference-v1','user',1);
        insert into body_progress_photo_preferences(user_id,consent_version,consent_state,consented_at,cadence_days,anchor_date)
          values('owner','body-progress-photo-consent-v1','granted',1,28,'2026-09-15');
        insert into body_progress_photo_sets(id,user_id,body_check_in_id,local_date,guide_version,context)
          values('set','owner','check-in','2026-09-15','body-progress-photo-guide-v1','{}');
        insert into body_progress_photos(id,set_id,user_id,view,normalized_media_type,byte_size,width,height,checksum,variants,encryption_version,processing_version)
          values('photo','set','owner','front','image/jpeg',100,10,10,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','[{},{},{},{}]','aes-256-gcm-v1','sharp-jpeg-v1');
      `);
      expect(() =>
        sqlite
          .prepare(
            "insert into body_progress_photos(id,set_id,user_id,view,normalized_media_type,byte_size,width,height,checksum,variants,encryption_version,processing_version) values('cross','set','other','back','image/jpeg',1,1,1,?,'[{},{},{},{}]','aes-256-gcm-v1','sharp-jpeg-v1')",
          )
          .run('b'.repeat(64)),
      ).toThrow(/FOREIGN KEY/);
      expect(() =>
        sqlite
          .prepare(
            "insert into body_progress_photo_sets(id,user_id,body_check_in_id,local_date,guide_version,context) values('cross-set','owner','other-check-in','2026-09-15','body-progress-photo-guide-v1','{}')",
          )
          .run(),
      ).toThrow(/ownership mismatch/);
      expect(() =>
        sqlite
          .prepare(
            "insert into body_progress_photos(id,set_id,user_id,view,normalized_media_type,byte_size,width,height,checksum,variants,encryption_version,processing_version) values('duplicate','set','owner','front','image/jpeg',1,1,1,?,'[{},{},{},{}]','aes-256-gcm-v1','sharp-jpeg-v1')",
          )
          .run('b'.repeat(64)),
      ).toThrow(/UNIQUE/);
      expect(() =>
        sqlite
          .prepare(
            "insert into body_progress_photo_sets(id,user_id,local_date,guide_version,context) values('bad-json','owner','2026-09-15','body-progress-photo-guide-v1','[]')",
          )
          .run(),
      ).toThrow(/CHECK constraint/);
      expect(() =>
        sqlite
          .prepare(
            "insert into body_progress_photos(id,set_id,user_id,view,normalized_media_type,byte_size,width,height,checksum,variants,encryption_version,processing_version) values('bad-version','set','owner','back','image/jpeg',1,1,1,?,'[{},{},{},{}]','wrong-key-format','sharp-jpeg-v1')",
          )
          .run('b'.repeat(64)),
      ).toThrow(/CHECK constraint/);
      sqlite.prepare("delete from body_check_ins where id='check-in'").run();
      expect(
        sqlite
          .prepare("select body_check_in_id from body_progress_photo_sets where id='set'")
          .pluck()
          .get(),
      ).toBeNull();
      sqlite.prepare("delete from users where id='owner'").run();
      expect(sqlite.prepare('select count(*) from body_progress_photos').pluck().get()).toBe(0);
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it('upgrades a populated 99afa36-compatible predecessor and restores its raw backup', async () => {
    const directory = makeDir();
    const dbPath = join(directory, 'legacy.db');
    const backupPath = join(directory, 'legacy-backup.db');
    let sqlite = openDb(dbPath);
    try {
      migratePulseDatabase(sqlite, { migrationsFolder: predecessorMigrations() });
      sqlite
        .prepare("insert into users(id,username,password_hash) values('legacy','legacy','hash')")
        .run();
      await sqlite.backup(backupPath);
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 2 });
      expect(sqlite.prepare("select username from users where id='legacy'").pluck().get()).toBe(
        'legacy',
      );
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 0 });
      sqlite.close();
      copyFileSync(backupPath, dbPath);
      sqlite = openDb(dbPath);
      expect(tableExists(sqlite, 'body_progress_photos')).toBe(false);
      expect(sqlite.prepare("select username from users where id='legacy'").pluck().get()).toBe(
        'legacy',
      );
    } finally {
      sqlite.close();
    }
  });

  it('fails closed on a partial conflicting schema without recording or leaving sibling tables', () => {
    const sqlite = openDb(join(makeDir(), 'malformed.db'));
    try {
      migratePulseDatabase(sqlite, { migrationsFolder: predecessorMigrations() });
      sqlite.exec('create table body_progress_photo_sets(id text primary key)');
      expect(() => migratePulseDatabase(sqlite, { migrationsFolder })).toThrow(/already exists/);
      expect(tableExists(sqlite, 'body_progress_photo_preferences')).toBe(false);
      expect(tableExists(sqlite, 'body_progress_photos')).toBe(false);
      expect(sqlite.prepare('select count(*) from __drizzle_migrations').pluck().get()).toBe(67);
    } finally {
      sqlite.close();
    }
  });

  it('rehearses matched predecessor removal and forward metadata/media/key restoration', async () => {
    const directory = realpathSync(makeDir());
    const predecessorPath = join(directory, 'predecessor.db');
    const predecessorBackup = join(directory, 'predecessor-backup.db');
    const predecessorMedia = join(directory, 'predecessor-media');
    const migratedBackup = join(directory, 'migrated-backup.db');
    const mediaRoot = join(directory, 'live-media');
    const migratedMedia = join(directory, 'migrated-media');
    mkdirSync(predecessorMedia, { mode: 0o700 });
    process.env.BODY_PROGRESS_MEDIA_ROOT = mediaRoot;
    process.env.BODY_PROGRESS_MEDIA_KEY = TEST_KEY;
    let sqlite = openDb(predecessorPath);
    try {
      expect(
        migratePulseDatabase(sqlite, { migrationsFolder: predecessorMigrations() }),
      ).toMatchObject({
        applied: 67,
      });
      sqlite
        .prepare(
          "insert into users(id,username,password_hash) values('rehearsal','rehearsal','synthetic')",
        )
        .run();
      await sqlite.backup(predecessorBackup);
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 2 });
      expect(migratePulseDatabase(sqlite, { migrationsFolder })).toMatchObject({ applied: 0 });

      const fixture = await sharp(
        Buffer.from(
          '<svg width="180" height="260" xmlns="http://www.w3.org/2000/svg"><rect width="180" height="260" fill="#dce7ef"/><circle cx="90" cy="45" r="24" fill="#986943"/><path d="M50 74h80l18 112H32z" fill="#24608d"/></svg>',
        ),
      )
        .jpeg()
        .toBuffer();
      const processed = await processAndEncryptPhoto({
        part: syntheticPart(fixture),
        photoId: '77777777-7777-4777-8777-777777777777',
        userId: 'rehearsal',
        view: 'front',
      });
      sqlite
        .prepare(
          `insert into body_progress_photo_sets
             (id,user_id,local_date,guide_version,context,status,count_as_scheduled_occurrence)
           values (?,?,?,?,?,'partial',0)`,
        )
        .run(
          '66666666-6666-4666-8666-666666666666',
          'rehearsal',
          '2026-09-15',
          'body-progress-photo-guide-v1',
          '{}',
        );
      sqlite
        .prepare(
          `insert into body_progress_photos
             (id,set_id,user_id,view,normalized_media_type,byte_size,width,height,checksum,variants,encryption_version,processing_version)
           values (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          '77777777-7777-4777-8777-777777777777',
          '66666666-6666-4666-8666-666666666666',
          'rehearsal',
          'front',
          'image/jpeg',
          processed.normalized.byteSize,
          processed.normalized.width,
          processed.normalized.height,
          processed.normalized.checksum,
          JSON.stringify(processed.variants),
          'aes-256-gcm-v1',
          'sharp-jpeg-v1',
        );
      await sqlite.backup(migratedBackup);
      cpSync(mediaRoot, migratedMedia, { recursive: true });
      expect(readFileSync(migratedBackup).includes(Buffer.from(TEST_KEY))).toBe(false);
      sqlite.close();

      const rollbackPath = join(directory, 'rollback.db');
      const rollbackMedia = join(directory, 'rollback-media');
      copyFileSync(predecessorBackup, rollbackPath);
      cpSync(predecessorMedia, rollbackMedia, { recursive: true });
      sqlite = openDb(rollbackPath);
      expect(tableExists(sqlite, 'body_progress_photos')).toBe(false);
      expect(tableExists(sqlite, 'body_progress_photo_deletion_intents')).toBe(false);
      expect(readdirSync(rollbackMedia)).toEqual([]);
      sqlite.close();

      const restoredPath = join(directory, 'restored.db');
      const restoredMedia = join(directory, 'restored-media');
      copyFileSync(migratedBackup, restoredPath);
      cpSync(migratedMedia, restoredMedia, { recursive: true });
      process.env.BODY_PROGRESS_MEDIA_ROOT = restoredMedia;
      sqlite = openDb(restoredPath);
      const restored = sqlite
        .prepare(
          "select variants from body_progress_photos where id='77777777-7777-4777-8777-777777777777'",
        )
        .get() as { variants: string };
      const variants = JSON.parse(restored.variants) as StoredPhotoVariant[];
      expect(variants).toHaveLength(4);
      for (const variant of variants) {
        const decrypted = await decryptVariantToTemporaryFile({
          userId: 'rehearsal',
          photoId: '77777777-7777-4777-8777-777777777777',
          view: 'front',
          variant,
        });
        await decrypted.cleanup();
      }
      expect(sqlite.pragma('quick_check', { simple: true })).toBe('ok');
      expect(sqlite.pragma('foreign_key_check')).toEqual([]);
    } finally {
      if (sqlite.open) sqlite.close();
      delete process.env.BODY_PROGRESS_MEDIA_ROOT;
      delete process.env.BODY_PROGRESS_MEDIA_KEY;
    }
  });
});
