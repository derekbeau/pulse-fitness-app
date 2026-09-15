import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import Database from 'better-sqlite3';

const sha256 = async (path: string) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
};

export const verifyProgressPhotoRestore = async (archivePath: string) => {
  if (!process.env.BODY_PROGRESS_MEDIA_KEY) {
    throw new Error('BODY_PROGRESS_MEDIA_KEY is required separately to verify this restore');
  }
  const directory = await mkdtemp(join(tmpdir(), 'pulse-photo-restore-'));
  const originalMediaRoot = process.env.BODY_PROGRESS_MEDIA_ROOT;
  try {
    execFileSync('tar', ['-xzf', resolve(archivePath), '-C', directory], { stdio: 'pipe' });
    const manifest = await readFile(join(directory, 'manifest.txt'), 'utf8');
    if (
      !manifest.includes('format=pulse-backup-v2') ||
      !manifest.includes('media_key_included=false')
    ) {
      throw new Error('Backup manifest is not a supported key-separated Pulse archive');
    }
    const databasePath = join(directory, 'pulse.db');
    const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      if (sqlite.pragma('quick_check', { simple: true }) !== 'ok')
        throw new Error('Restored SQLite quick_check failed');
      const foreignKeyViolations = sqlite.pragma('foreign_key_check') as unknown[];
      if (foreignKeyViolations.length !== 0)
        throw new Error('Restored SQLite foreign_key_check failed');
      const tableExists = sqlite
        .prepare("select 1 from sqlite_master where type='table' and name='body_progress_photos'")
        .get();
      const rows = tableExists
        ? (sqlite
            .prepare(
              'select id, user_id as userId, view, variants from body_progress_photos order by id',
            )
            .all() as Array<{
            id: string;
            userId: string;
            view: 'front' | 'side_left' | 'side_right' | 'back';
            variants: string;
          }>)
        : [];
      process.env.BODY_PROGRESS_MEDIA_ROOT = join(directory, 'private/body-progress');
      const { decryptVariantToTemporaryFile } =
        await import('../routes/body-progress-photos/media.js');
      let verifiedObjects = 0;
      for (const row of rows) {
        const variants = JSON.parse(row.variants) as Array<{
          variant: 'original' | 'full' | 'comparison' | 'thumbnail';
          storageKey: string;
          mediaType: string;
          byteSize: number;
          width: number;
          height: number;
          checksum: string;
          nonce: string;
          authTag: string;
        }>;
        for (const variant of variants) {
          const decrypted = await decryptVariantToTemporaryFile({
            userId: row.userId,
            photoId: row.id,
            view: row.view,
            variant,
          });
          try {
            if ((await sha256(decrypted.path)) !== variant.checksum)
              throw new Error('Restored progress photo checksum verification failed');
          } finally {
            await decrypted.cleanup();
          }
          verifiedObjects += 1;
        }
      }
      return {
        format: 'pulse-backup-v2' as const,
        databaseQuickCheck: 'ok' as const,
        foreignKeyViolationCount: 0,
        verifiedPhotoCount: rows.length,
        verifiedObjectCount: verifiedObjects,
        mediaKeyIncluded: false as const,
      };
    } finally {
      sqlite.close();
    }
  } finally {
    if (originalMediaRoot === undefined) delete process.env.BODY_PROGRESS_MEDIA_ROOT;
    else process.env.BODY_PROGRESS_MEDIA_ROOT = originalMediaRoot;
    await rm(directory, { recursive: true, force: true });
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const archivePath = process.argv[2];
  if (!archivePath) {
    process.stderr.write('Usage: verify-progress-photo-restore.ts <pulse-backup.tar.gz>\n');
    process.exitCode = 2;
  } else {
    verifyProgressPhotoRestore(archivePath)
      .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
      .catch((error: unknown) => {
        process.stderr.write(
          `${error instanceof Error ? error.message : 'Restore verification failed'}\n`,
        );
        process.exitCode = 1;
      });
  }
}
