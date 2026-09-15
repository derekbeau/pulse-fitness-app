import { randomUUID } from 'node:crypto';

import {
  BODY_PROGRESS_PHOTO_CONSENT_VERSION,
  BODY_PROGRESS_PHOTO_CONTRACT_VERSION,
  BODY_PROGRESS_PHOTO_ENCRYPTION_VERSION,
  BODY_PROGRESS_PHOTO_GUIDE_VERSION,
  BODY_PROGRESS_PHOTO_MAX_FILES,
  BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES,
  BODY_PROGRESS_PHOTO_MAX_PIXELS,
  BODY_PROGRESS_PHOTO_MAX_REQUEST_BYTES,
  BODY_PROGRESS_PHOTO_PROCESSING_VERSION,
  bodyProgressPhotoErrorCodeSchema,
  type BodyProgressPhoto,
  type BodyProgressPhotoPreference,
  type BodyProgressPhotoSet,
  type BodyProgressPhotoView,
  type CreateBodyProgressPhotoSet,
  type PatchBodyProgressPhotoPreference,
  type PatchBodyProgressPhotoSet,
} from '@pulse/shared';
import type { Multipart } from '@fastify/multipart';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';

import {
  bodyCheckIns,
  bodyProgressPhotoPreferences,
  bodyProgressPhotos,
  bodyProgressPhotoSets,
} from '../../db/schema/index.js';
import { getApplicationNow } from '../../lib/clock.js';
import { addUtcDays } from '../../lib/date.js';
import {
  getDateKeyInTimeZone,
  resolveUserTimeZoneForUser,
  UserTimeZoneRequiredError,
} from '../../lib/user-time-zone.js';

import {
  assertProgressPhotoMediaKey,
  processAndEncryptPhoto,
  ProgressPhotoMediaError,
  stageStoredVariantsForDeletion,
} from './media.js';

const DEFAULT_CONTEXT = {
  meal: 'unspecified' as const,
  workout: 'unspecified' as const,
  pumpPresent: null,
  unusualBloating: null,
  clothingNotes: null,
  lightingNotes: null,
};

export class ProgressPhotoStoreError extends Error {
  constructor(
    public readonly code:
      | 'BODY_PROGRESS_PHOTO_CONSENT_REQUIRED'
      | 'BODY_PROGRESS_PHOTO_CONSENT_REVOKED'
      | 'BODY_PROGRESS_PHOTO_DUPLICATE_VIEW'
      | 'BODY_PROGRESS_PHOTO_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'ProgressPhotoStoreError';
  }
}

const capabilities: BodyProgressPhotoPreference['capabilities'] = {
  contractVersion: BODY_PROGRESS_PHOTO_CONTRACT_VERSION,
  consentVersion: BODY_PROGRESS_PHOTO_CONSENT_VERSION,
  guideVersion: BODY_PROGRESS_PHOTO_GUIDE_VERSION,
  processingVersion: BODY_PROGRESS_PHOTO_PROCESSING_VERSION,
  formats: ['image/jpeg', 'image/png', 'image/webp'],
  heic: {
    behavior: 'reject_client_conversion_required' as const,
    errorCode: 'BODY_PROGRESS_PHOTO_HEIC_CLIENT_CONVERSION_REQUIRED' as const,
  },
  maxInputBytes: BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES,
  maxFilesPerRequest: BODY_PROGRESS_PHOTO_MAX_FILES,
  maxRequestBytes: BODY_PROGRESS_PHOTO_MAX_REQUEST_BYTES,
  maxPixels: BODY_PROGRESS_PHOTO_MAX_PIXELS,
  variants: ['thumbnail', 'comparison', 'full'],
  uploadAuth: 'jwt_only' as const,
  contentAuth: 'jwt_only' as const,
  metadataAuth: 'jwt_or_agent_token' as const,
  export: { format: 'zip' as const, reauthentication: 'current_password' as const },
  deletion: { liveStorage: 'immediate' as const, backupAging: 'newest_30_archives' as const },
  errorCodes: bodyProgressPhotoErrorCodeSchema.options,
};

const occurrenceFor = (anchorDate: string, cadenceDays: number, date: string) => {
  if (date < anchorDate) return anchorDate;
  const days = Math.floor(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${anchorDate}T00:00:00Z`)) / 86_400_000,
  );
  return addUtcDays(anchorDate, Math.floor(days / cadenceDays) * cadenceDays);
};

const buildDue = (
  row: typeof bodyProgressPhotoPreferences.$inferSelect,
  localDate: string,
): BodyProgressPhotoPreference['due'] => {
  const occurrence = occurrenceFor(row.anchorDate, row.cadenceDays, localDate);
  const completed = row.lastScheduledOccurrenceDate;
  const satisfied =
    completed !== null &&
    completed >= occurrence &&
    completed < addUtcDays(occurrence, row.cadenceDays);
  const dueDate = satisfied ? addUtcDays(occurrence, row.cadenceDays) : occurrence;
  let state: BodyProgressPhotoPreference['due']['state'];
  if (!satisfied && row.lastDismissedDueDate === occurrence) state = 'skipped';
  else if (!satisfied && row.snoozedUntil && row.snoozedUntil > localDate) state = 'snoozed';
  else if (localDate < dueDate) state = 'upcoming';
  else if (localDate === dueDate) state = 'due';
  else state = 'overdue';
  return {
    localDate,
    dueDate,
    nextDueDate: addUtcDays(dueDate, row.cadenceDays),
    state,
    snoozedUntil: row.snoozedUntil,
    lastDismissedDueDate: row.lastDismissedDueDate,
  };
};

const consentFacts = {
  encryptedLiveStorage: true as const,
  jwtOnlyRawAccess: true as const,
  retainedUntilExplicitDeletion: true as const,
  encryptedBackupsRetainNewestArchives: 30 as const,
  backupKeyStoredSeparately: true as const,
  noAiAnalysis: true as const,
};

const toPreference = (
  row: typeof bodyProgressPhotoPreferences.$inferSelect,
  localDate: string,
): BodyProgressPhotoPreference => ({
  contractVersion: BODY_PROGRESS_PHOTO_CONTRACT_VERSION,
  consent: {
    state: row.consentState,
    contractVersion: BODY_PROGRESS_PHOTO_CONSENT_VERSION,
    acceptedVersion: row.consentVersion,
    consentedAt: row.consentedAt,
    declinedAt: row.declinedAt,
    revokedAt: row.revokedAt,
    facts: consentFacts,
  },
  cadenceDays: row.cadenceDays,
  anchorDate: row.anchorDate,
  sideView: row.sideView,
  reminderLocalTime: row.reminderLocalTime,
  snoozedUntil: row.snoozedUntil,
  lastDismissedDueDate: row.lastDismissedDueDate,
  lastScheduledOccurrenceDate: row.lastScheduledOccurrenceDate,
  due: buildDue(row, localDate),
  capabilities,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const resolveLocalDate = async (userId: string) => {
  const authority = await resolveUserTimeZoneForUser(userId);
  if (!authority) throw new UserTimeZoneRequiredError();
  return getDateKeyInTimeZone(getApplicationNow(), authority.timeZone);
};

export const getPhotoPreference = async (userId: string) => {
  const localDate = await resolveLocalDate(userId);
  const { db } = await import('../../db/index.js');
  let row = db
    .select()
    .from(bodyProgressPhotoPreferences)
    .where(eq(bodyProgressPhotoPreferences.userId, userId))
    .get();
  if (!row) {
    row = db
      .insert(bodyProgressPhotoPreferences)
      .values({ userId, anchorDate: localDate })
      .returning()
      .get();
  }
  if (!row) throw new Error('Failed to initialize progress photo preferences');
  return toPreference(row, localDate);
};

export const patchPhotoPreference = async (
  userId: string,
  input: PatchBodyProgressPhotoPreference,
) => {
  const current = await getPhotoPreference(userId);
  const now = Date.now();
  const consentUpdate =
    input.consentDecision === 'grant'
      ? {
          consentState: 'granted' as const,
          consentVersion: BODY_PROGRESS_PHOTO_CONSENT_VERSION,
          consentedAt: now,
          declinedAt: null,
          revokedAt: null,
        }
      : input.consentDecision === 'decline'
        ? {
            consentState: 'declined' as const,
            consentVersion: BODY_PROGRESS_PHOTO_CONSENT_VERSION,
            consentedAt: null,
            declinedAt: now,
            revokedAt: null,
          }
        : input.consentDecision === 'revoke'
          ? {
              consentState: 'revoked' as const,
              consentVersion: BODY_PROGRESS_PHOTO_CONSENT_VERSION,
              consentedAt: current.consent.consentedAt,
              declinedAt: null,
              revokedAt: now,
            }
          : {};
  if (input.consentDecision === 'revoke' && current.consent.state !== 'granted') {
    throw new RangeError('Only granted photo consent can be revoked');
  }
  if (
    input.consentDecision === 'decline' &&
    !['not_decided', 'declined'].includes(current.consent.state)
  ) {
    throw new RangeError(
      'Previously granted photo consent must be revoked, not overwritten by decline',
    );
  }
  if (input.cadenceChange === 'restart' && !input.restartAnchorDate) {
    throw new RangeError('Restarting cadence requires restartAnchorDate');
  }
  const { db } = await import('../../db/index.js');
  db.update(bodyProgressPhotoPreferences)
    .set({
      ...consentUpdate,
      ...(input.cadenceDays === undefined ? {} : { cadenceDays: input.cadenceDays }),
      ...(input.sideView === undefined ? {} : { sideView: input.sideView }),
      ...(input.reminderLocalTime === undefined
        ? {}
        : { reminderLocalTime: input.reminderLocalTime }),
      ...(input.cadenceChange === 'restart'
        ? {
            anchorDate: input.restartAnchorDate,
            snoozedUntil: null,
            lastDismissedDueDate: null,
            lastScheduledOccurrenceDate: null,
          }
        : {}),
      updatedAt: sql<number>`max(${bodyProgressPhotoPreferences.updatedAt} + 1, ${now})`,
    })
    .where(eq(bodyProgressPhotoPreferences.userId, userId))
    .run();
  return getPhotoPreference(userId);
};

export const skipPhotoOccurrence = async (userId: string, occurrenceDate: string) => {
  const current = await getPhotoPreference(userId);
  if (
    current.due.dueDate !== occurrenceDate ||
    !['due', 'overdue', 'snoozed'].includes(current.due.state)
  )
    throw new RangeError('Only the current unsatisfied occurrence can be skipped');
  const { db } = await import('../../db/index.js');
  db.update(bodyProgressPhotoPreferences)
    .set({ lastDismissedDueDate: occurrenceDate, snoozedUntil: null, updatedAt: Date.now() })
    .where(eq(bodyProgressPhotoPreferences.userId, userId))
    .run();
  return getPhotoPreference(userId);
};

export const snoozePhotoOccurrence = async (userId: string, until: string) => {
  const current = await getPhotoPreference(userId);
  if (
    !current.due.localDate ||
    until <= current.due.localDate ||
    until >= addUtcDays(current.due.dueDate, current.cadenceDays) ||
    !['due', 'overdue', 'snoozed'].includes(current.due.state)
  )
    throw new RangeError('Snooze must be a future date before the next occurrence');
  const { db } = await import('../../db/index.js');
  db.update(bodyProgressPhotoPreferences)
    .set({ snoozedUntil: until, updatedAt: Date.now() })
    .where(eq(bodyProgressPhotoPreferences.userId, userId))
    .run();
  return getPhotoPreference(userId);
};

const photoToApi = (row: typeof bodyProgressPhotos.$inferSelect): BodyProgressPhoto => ({
  id: row.id,
  setId: row.setId,
  view: row.view,
  mediaType: 'image/jpeg',
  byteSize: row.byteSize,
  width: row.width,
  height: row.height,
  checksum: row.checksum,
  processingVersion: BODY_PROGRESS_PHOTO_PROCESSING_VERSION,
  processingState: 'ready',
  deletionStatus: 'live',
  encryptionVersion: BODY_PROGRESS_PHOTO_ENCRYPTION_VERSION,
  variants: row.variants
    .filter((variant) => variant.variant !== 'original')
    .map((variant) => ({
      variant: variant.variant as 'thumbnail' | 'comparison' | 'full',
      width: variant.width,
      height: variant.height,
      byteSize: variant.byteSize,
      contentPath: `/api/v1/body-progress/photos/${row.id}/content?variant=${variant.variant}`,
    })),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const getPhotoInternal = async (id: string, userId: string) => {
  const { db } = await import('../../db/index.js');
  return (
    db
      .select()
      .from(bodyProgressPhotos)
      .where(and(eq(bodyProgressPhotos.id, id), eq(bodyProgressPhotos.userId, userId)))
      .get() ?? null
  );
};

export const getPhotoSet = async (
  id: string,
  userId: string,
): Promise<BodyProgressPhotoSet | null> => {
  const { db } = await import('../../db/index.js');
  const row = db
    .select()
    .from(bodyProgressPhotoSets)
    .where(and(eq(bodyProgressPhotoSets.id, id), eq(bodyProgressPhotoSets.userId, userId)))
    .get();
  if (!row) return null;
  const photos = db
    .select()
    .from(bodyProgressPhotos)
    .where(and(eq(bodyProgressPhotos.setId, id), eq(bodyProgressPhotos.userId, userId)))
    .orderBy(asc(bodyProgressPhotos.createdAt))
    .all();
  return {
    id: row.id,
    bodyCheckInId: row.bodyCheckInId,
    date: row.date,
    localTime: row.localTime,
    guideVersion: BODY_PROGRESS_PHOTO_GUIDE_VERSION,
    context: row.context as BodyProgressPhotoSet['context'],
    notes: row.notes,
    status: row.status,
    countAsScheduledOccurrence: row.countAsScheduledOccurrence,
    photos: photos.map(photoToApi),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const listPhotoSets = async (
  userId: string,
  query: { from?: string; to?: string; page: number; limit: number },
) => {
  const { db } = await import('../../db/index.js');
  const clauses = [eq(bodyProgressPhotoSets.userId, userId)];
  if (query.from) clauses.push(gte(bodyProgressPhotoSets.date, query.from));
  if (query.to) clauses.push(lte(bodyProgressPhotoSets.date, query.to));
  const where = and(...clauses);
  if (!where) throw new Error('Progress photo set query scope is missing');
  const ids = db
    .select({ id: bodyProgressPhotoSets.id })
    .from(bodyProgressPhotoSets)
    .where(where)
    .orderBy(desc(bodyProgressPhotoSets.date), desc(bodyProgressPhotoSets.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit)
    .all();
  const total =
    db
      .select({ value: sql<number>`count(*)` })
      .from(bodyProgressPhotoSets)
      .where(where)
      .get()?.value ?? 0;
  const entries = (await Promise.all(ids.map(({ id }) => getPhotoSet(id, userId)))).filter(
    (entry): entry is BodyProgressPhotoSet => entry !== null,
  );
  return { entries, total };
};

export const createPhotoSet = async (userId: string, input: CreateBodyProgressPhotoSet) => {
  const { db } = await import('../../db/index.js');
  if (input.date > (await resolveLocalDate(userId)))
    throw new RangeError('Progress photo set date cannot be in the future');
  if (input.bodyCheckInId) {
    const owned = db
      .select({ id: bodyCheckIns.id })
      .from(bodyCheckIns)
      .where(and(eq(bodyCheckIns.id, input.bodyCheckInId), eq(bodyCheckIns.userId, userId)))
      .get();
    if (!owned)
      throw new ProgressPhotoStoreError(
        'BODY_PROGRESS_PHOTO_NOT_FOUND',
        'Progress photo set not found',
      );
  }
  await getPhotoPreference(userId);
  const id = randomUUID();
  const now = Date.now();
  db.transaction((tx) => {
    tx.insert(bodyProgressPhotoSets)
      .values({
        id,
        userId,
        bodyCheckInId: input.bodyCheckInId ?? null,
        date: input.date,
        localTime: input.localTime ?? null,
        guideVersion: BODY_PROGRESS_PHOTO_GUIDE_VERSION,
        context: input.context ?? DEFAULT_CONTEXT,
        notes: input.notes ?? null,
        status: 'partial',
        countAsScheduledOccurrence: input.countAsScheduledOccurrence,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    if (input.countAsScheduledOccurrence) recomputeLastScheduledOccurrence(tx, userId, now, true);
  });
  const created = await getPhotoSet(id, userId);
  if (!created) throw new Error('Created progress photo set disappeared');
  return created;
};

export const patchPhotoSet = async (
  id: string,
  userId: string,
  input: PatchBodyProgressPhotoSet,
) => {
  const { db } = await import('../../db/index.js');
  if (input.bodyCheckInId) {
    const owned = db
      .select({ id: bodyCheckIns.id })
      .from(bodyCheckIns)
      .where(and(eq(bodyCheckIns.id, input.bodyCheckInId), eq(bodyCheckIns.userId, userId)))
      .get();
    if (!owned)
      throw new ProgressPhotoStoreError(
        'BODY_PROGRESS_PHOTO_NOT_FOUND',
        'Progress photo set not found',
      );
  }
  const now = Date.now();
  const result = db.transaction((tx) => {
    const updated = tx
      .update(bodyProgressPhotoSets)
      .set({
        ...(input.bodyCheckInId === undefined ? {} : { bodyCheckInId: input.bodyCheckInId }),
        ...(input.date === undefined ? {} : { date: input.date }),
        ...(input.localTime === undefined ? {} : { localTime: input.localTime }),
        ...(input.context === undefined ? {} : { context: input.context }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        updatedAt: now,
      })
      .where(and(eq(bodyProgressPhotoSets.id, id), eq(bodyProgressPhotoSets.userId, userId)))
      .run();
    if (updated.changes === 1 && input.date !== undefined)
      recomputeLastScheduledOccurrence(tx, userId, now);
    return updated;
  });
  if (result.changes !== 1) return null;
  return getPhotoSet(id, userId);
};

const recomputeSetStatus = (
  tx: Parameters<Parameters<(typeof import('../../db/index.js'))['db']['transaction']>[0]>[0],
  setId: string,
  userId: string,
  sideView: 'side_left' | 'side_right',
) => {
  const views = tx
    .select({ view: bodyProgressPhotos.view })
    .from(bodyProgressPhotos)
    .where(and(eq(bodyProgressPhotos.setId, setId), eq(bodyProgressPhotos.userId, userId)))
    .all()
    .map(({ view }) => view);
  const complete = views.includes('front') && views.includes(sideView) && views.includes('back');
  tx.update(bodyProgressPhotoSets)
    .set({ status: complete ? 'complete' : 'partial', updatedAt: Date.now() })
    .where(and(eq(bodyProgressPhotoSets.id, setId), eq(bodyProgressPhotoSets.userId, userId)))
    .run();
};

const recomputeLastScheduledOccurrence = (
  tx: Parameters<Parameters<(typeof import('../../db/index.js'))['db']['transaction']>[0]>[0],
  userId: string,
  updatedAt: number,
  clearSnooze = false,
) => {
  const latest = tx
    .select({ date: bodyProgressPhotoSets.date })
    .from(bodyProgressPhotoSets)
    .where(
      and(
        eq(bodyProgressPhotoSets.userId, userId),
        eq(bodyProgressPhotoSets.countAsScheduledOccurrence, true),
      ),
    )
    .orderBy(desc(bodyProgressPhotoSets.date), desc(bodyProgressPhotoSets.createdAt))
    .limit(1)
    .get();
  tx.update(bodyProgressPhotoPreferences)
    .set({
      lastScheduledOccurrenceDate: latest?.date ?? null,
      ...(clearSnooze ? { snoozedUntil: null } : {}),
      updatedAt,
    })
    .where(eq(bodyProgressPhotoPreferences.userId, userId))
    .run();
};

export const uploadPhotos = async (
  setId: string,
  userId: string,
  parts: AsyncIterable<Multipart>,
) => {
  const set = await getPhotoSet(setId, userId);
  if (!set)
    throw new ProgressPhotoStoreError(
      'BODY_PROGRESS_PHOTO_NOT_FOUND',
      'Progress photo set not found',
    );
  const preference = await getPhotoPreference(userId);
  if (preference.consent.state === 'revoked')
    throw new ProgressPhotoStoreError(
      'BODY_PROGRESS_PHOTO_CONSENT_REVOKED',
      'Progress photo consent has been revoked',
    );
  if (
    preference.consent.state !== 'granted' ||
    preference.consent.acceptedVersion !== BODY_PROGRESS_PHOTO_CONSENT_VERSION
  )
    throw new ProgressPhotoStoreError(
      'BODY_PROGRESS_PHOTO_CONSENT_REQUIRED',
      'Current progress photo consent is required',
    );
  assertProgressPhotoMediaKey();
  const existingViews = new Set(set.photos.map((photo) => photo.view));
  const processed: Array<
    Awaited<ReturnType<typeof processAndEncryptPhoto>> & { id: string; view: BodyProgressPhotoView }
  > = [];
  const requestViews = new Set<string>();
  let exceededFileCount = false;
  try {
    for await (const part of parts) {
      if (part.type !== 'file') throw new RangeError('Only view-named file parts are accepted');
      if (processed.length >= BODY_PROGRESS_PHOTO_MAX_FILES) {
        for await (const chunk of part.file) {
          // Drain the authenticated, aggregate-bounded excess part so multipart parsing terminates.
          void chunk;
        }
        exceededFileCount = true;
        continue;
      }
      if (!['front', 'side_left', 'side_right', 'back'].includes(part.fieldname))
        throw new RangeError('Each multipart file field must name a supported view');
      if (
        requestViews.has(part.fieldname) ||
        existingViews.has(part.fieldname as BodyProgressPhotoView)
      )
        throw new ProgressPhotoStoreError(
          'BODY_PROGRESS_PHOTO_DUPLICATE_VIEW',
          'A photo already exists for this view',
        );
      requestViews.add(part.fieldname);
      const id = randomUUID();
      processed.push({
        ...(await processAndEncryptPhoto({
          part,
          photoId: id,
          userId,
          view: part.fieldname as BodyProgressPhotoView,
        })),
        id,
        view: part.fieldname as BodyProgressPhotoView,
      });
    }
    if (exceededFileCount)
      throw new ProgressPhotoMediaError(
        'BODY_PROGRESS_PHOTO_FILE_COUNT_LIMIT',
        'At most three images may be uploaded',
      );
    if (processed.length < 1)
      throw new RangeError('Upload must contain between one and three images');
    const { db } = await import('../../db/index.js');
    db.transaction((tx) => {
      for (const item of processed)
        tx.insert(bodyProgressPhotos)
          .values({
            id: item.id,
            setId,
            userId,
            view: item.view,
            normalizedMediaType: 'image/jpeg',
            byteSize: item.normalized.byteSize,
            width: item.normalized.width,
            height: item.normalized.height,
            checksum: item.normalized.checksum,
            variants: item.variants,
            encryptionVersion: BODY_PROGRESS_PHOTO_ENCRYPTION_VERSION,
            processingVersion: BODY_PROGRESS_PHOTO_PROCESSING_VERSION,
          })
          .run();
      recomputeSetStatus(tx, setId, userId, preference.sideView);
    });
  } catch (error) {
    await Promise.all(processed.map((item) => item.cleanupCommitted()));
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'SQLITE_CONSTRAINT_UNIQUE'
    )
      throw new ProgressPhotoStoreError(
        'BODY_PROGRESS_PHOTO_DUPLICATE_VIEW',
        'A photo already exists for this view',
      );
    throw error;
  }
  const updated = await getPhotoSet(setId, userId);
  if (!updated) throw new Error('Updated progress photo set disappeared');
  return updated;
};

export const deletePhoto = async (id: string, userId: string) => {
  const row = await getPhotoInternal(id, userId);
  if (!row) return null;
  const staged = await stageStoredVariantsForDeletion(row.variants);
  const { db } = await import('../../db/index.js');
  try {
    db.transaction((tx) => {
      tx.delete(bodyProgressPhotos)
        .where(and(eq(bodyProgressPhotos.id, id), eq(bodyProgressPhotos.userId, userId)))
        .run();
      const preference = tx
        .select({ sideView: bodyProgressPhotoPreferences.sideView })
        .from(bodyProgressPhotoPreferences)
        .where(eq(bodyProgressPhotoPreferences.userId, userId))
        .get();
      recomputeSetStatus(tx, row.setId, userId, preference?.sideView ?? 'side_right');
    });
    await staged.commit();
    return { id, deleted: staged.staged, missing: staged.missing };
  } catch (error) {
    await staged.rollback();
    throw error;
  }
};

export const deletePhotoSet = async (id: string, userId: string) => {
  const { db } = await import('../../db/index.js');
  const rows = db
    .select({ variants: bodyProgressPhotos.variants })
    .from(bodyProgressPhotos)
    .where(and(eq(bodyProgressPhotos.setId, id), eq(bodyProgressPhotos.userId, userId)))
    .all();
  const owner = db
    .select({
      id: bodyProgressPhotoSets.id,
      countAsScheduledOccurrence: bodyProgressPhotoSets.countAsScheduledOccurrence,
    })
    .from(bodyProgressPhotoSets)
    .where(and(eq(bodyProgressPhotoSets.id, id), eq(bodyProgressPhotoSets.userId, userId)))
    .get();
  if (!owner) return null;
  const staged = await stageStoredVariantsForDeletion(rows.flatMap(({ variants }) => variants));
  try {
    const result = db.transaction((tx) => {
      const deleted = tx
        .delete(bodyProgressPhotoSets)
        .where(and(eq(bodyProgressPhotoSets.id, id), eq(bodyProgressPhotoSets.userId, userId)))
        .run();
      if (deleted.changes === 1 && owner.countAsScheduledOccurrence)
        recomputeLastScheduledOccurrence(tx, userId, Date.now());
      return deleted;
    });
    if (result.changes !== 1) throw new Error('Progress photo set disappeared during deletion');
    await staged.commit();
    return { id, deleted: staged.staged, missing: staged.missing };
  } catch (error) {
    await staged.rollback();
    throw error;
  }
};

export const deleteAllPhotos = async (userId: string) => {
  const { db } = await import('../../db/index.js');
  const rows = db
    .select({ variants: bodyProgressPhotos.variants })
    .from(bodyProgressPhotos)
    .where(eq(bodyProgressPhotos.userId, userId))
    .all();
  const sets = db
    .select({ id: bodyProgressPhotoSets.id })
    .from(bodyProgressPhotoSets)
    .where(eq(bodyProgressPhotoSets.userId, userId))
    .all();
  const staged = await stageStoredVariantsForDeletion(rows.flatMap(({ variants }) => variants));
  try {
    db.transaction((tx) => {
      tx.delete(bodyProgressPhotoSets).where(eq(bodyProgressPhotoSets.userId, userId)).run();
      recomputeLastScheduledOccurrence(tx, userId, Date.now());
    });
    await staged.commit();
    return {
      deletedSets: sets.length,
      deletedPhotos: rows.length,
      deletedFiles: staged.staged,
      missingFiles: staged.missing,
      backupRetention:
        'Encrypted backup copies age out when rotated beyond the newest 30 archives.',
    };
  } catch (error) {
    await staged.rollback();
    throw error;
  }
};

export const stageUserPhotoMediaDeletion = async (userId: string) => {
  const rows = await getUserPhotoRows(userId);
  return stageStoredVariantsForDeletion(rows.flatMap(({ variants }) => variants));
};

export const getUserPhotoRows = async (userId: string) => {
  const { db } = await import('../../db/index.js');
  return db
    .select()
    .from(bodyProgressPhotos)
    .where(eq(bodyProgressPhotos.userId, userId))
    .orderBy(asc(bodyProgressPhotos.createdAt))
    .all();
};

export const allReferencedStorageKeys = async () => {
  const { db } = await import('../../db/index.js');
  return new Set(
    db
      .select({ variants: bodyProgressPhotos.variants })
      .from(bodyProgressPhotos)
      .all()
      .flatMap(({ variants }) => variants.map((variant) => variant.storageKey)),
  );
};
