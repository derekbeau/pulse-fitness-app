import { eq } from 'drizzle-orm';

import { bodyProgressPhotos } from '../db/schema/index.js';
import {
  listEncryptedStorageKeys,
  storedVariantExists,
} from '../routes/body-progress-photos/media.js';
import {
  deletePhoto,
  getPendingProgressPhotoDeletionFacts,
} from '../routes/body-progress-photos/store.js';

export const auditProgressPhotoOrphans = async (
  options: {
    repair?: boolean;
    userId?: string;
  } = {},
) => {
  if (options.repair && !options.userId) {
    throw new Error('Repair requires --user-id so metadata deletion remains user-scoped');
  }
  const { db } = await import('../db/index.js');
  const rows = options.userId
    ? db
        .select()
        .from(bodyProgressPhotos)
        .where(eq(bodyProgressPhotos.userId, options.userId))
        .all()
    : db.select().from(bodyProgressPhotos).all();
  const missingPhotoIds = new Set<string>();
  const referenced = new Set<string>();
  for (const row of rows) {
    for (const variant of row.variants) {
      referenced.add(variant.storageKey);
      if (!(await storedVariantExists(variant.storageKey))) missingPhotoIds.add(row.id);
    }
  }
  const stored = await listEncryptedStorageKeys();
  const deletionFacts = await getPendingProgressPhotoDeletionFacts(options.userId);
  const unreferencedFileCount = options.userId
    ? null
    : stored.filter((key) => !referenced.has(key)).length;
  let repairedMetadataCount = 0;
  if (options.repair && options.userId) {
    for (const id of missingPhotoIds) {
      const result = await deletePhoto(id, options.userId);
      if (result) repairedMetadataCount += 1;
    }
  }
  return {
    mode: options.repair ? ('repair_user_metadata' as const) : ('report_only' as const),
    scope: options.userId ? ('user' as const) : ('all_metadata' as const),
    metadataWithoutFileCount: missingPhotoIds.size,
    metadataWithoutFilePhotoIds: [...missingPhotoIds].sort(),
    fileWithoutMetadataCount: unreferencedFileCount,
    ...deletionFacts,
    repairedMetadataCount,
    fileRepairPerformed: false as const,
  };
};

const arguments_ = new Set(process.argv.slice(2));
const userIndex = process.argv.indexOf('--user-id');
const userId = userIndex >= 0 ? process.argv[userIndex + 1] : undefined;
const repair = arguments_.has('--repair');

if (import.meta.url === `file://${process.argv[1]}`) {
  auditProgressPhotoOrphans({ repair, userId })
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report)}\n`);
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : 'Orphan audit failed'}\n`);
      process.exitCode = 1;
    });
}
