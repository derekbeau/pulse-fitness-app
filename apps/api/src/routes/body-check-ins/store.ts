import { createHash, randomUUID } from 'node:crypto';

import {
  BODY_CHECK_IN_CONTRACT_VERSION,
  BODY_PROTOCOL_VERSION,
  bodyMeasurementProtocols,
  calculateCanonicalBodyReading,
  defaultBodyEnabledSites,
  type BodyCheckIn,
  type BodyCheckInMeasurement,
  type BodyCheckInMeasurementInput,
  type BodyCheckInPreference,
  type BodyDueState,
  type CreateBodyCheckInInput,
  type PatchBodyCheckInInput,
  type PatchBodyCheckInPreference,
} from '@pulse/shared';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';

import {
  bodyCheckInMeasurements,
  bodyCheckInPreferences,
  bodyCheckIns,
} from '../../db/schema/index.js';
import { getApplicationNow } from '../../lib/clock.js';
import { addUtcDays } from '../../lib/date.js';
import {
  getDateKeyInTimeZone,
  resolveUserTimeZoneForUser,
  UserTimeZoneRequiredError,
} from '../../lib/user-time-zone.js';

export class BodyCheckInConflictError extends Error {
  readonly code = 'BODY_CHECK_IN_DATE_CONFLICT';
  constructor(readonly existingId: string) {
    super(`A body check-in already exists for this local date (${existingId})`);
  }
}

export class BodyCheckInIdempotencyConflictError extends Error {
  readonly code = 'BODY_CHECK_IN_IDEMPOTENCY_CONFLICT';
  constructor() {
    super('The idempotency key was already used with a different request');
  }
}

export class BodyCheckInCompletionError extends Error {
  readonly code = 'BODY_CHECK_IN_THIRD_READING_REQUIRED';
  constructor() {
    super('Completed check-ins cannot contain a discordant two-reading measurement');
  }
}

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const stableHash = (value: unknown) =>
  createHash('sha256').update(stableSerialize(value)).digest('hex');

const preferenceSelection = {
  userId: bodyCheckInPreferences.userId,
  measurementCadenceDays: bodyCheckInPreferences.measurementCadenceDays,
  lengthUnit: bodyCheckInPreferences.lengthUnit,
  enabledSites: bodyCheckInPreferences.enabledSites,
  anchorDate: bodyCheckInPreferences.anchorDate,
  reminderLocalTime: bodyCheckInPreferences.reminderLocalTime,
  protocolVersion: bodyCheckInPreferences.protocolVersion,
  snoozedUntil: bodyCheckInPreferences.snoozedUntil,
  lastDismissedDueDate: bodyCheckInPreferences.lastDismissedDueDate,
  createdAt: bodyCheckInPreferences.createdAt,
  updatedAt: bodyCheckInPreferences.updatedAt,
};

const checkInSelection = {
  id: bodyCheckIns.id,
  date: bodyCheckIns.date,
  localTime: bodyCheckIns.localTime,
  status: bodyCheckIns.status,
  mealContext: bodyCheckIns.mealContext,
  workoutContext: bodyCheckIns.workoutContext,
  pumpPresent: bodyCheckIns.pumpPresent,
  unusualBloating: bodyCheckIns.unusualBloating,
  notes: bodyCheckIns.notes,
  protocolVersion: bodyCheckIns.protocolVersion,
  source: bodyCheckIns.source,
  sourceId: bodyCheckIns.sourceId,
  countAsScheduledOccurrence: bodyCheckIns.countAsScheduledOccurrence,
  completedAt: bodyCheckIns.completedAt,
  correctedAt: bodyCheckIns.correctedAt,
  correctedBySource: bodyCheckIns.correctedBySource,
  correctedBySourceId: bodyCheckIns.correctedBySourceId,
  correctionReason: bodyCheckIns.correctionReason,
  createdAt: bodyCheckIns.createdAt,
  updatedAt: bodyCheckIns.updatedAt,
};

const measurementSelection = {
  id: bodyCheckInMeasurements.id,
  site: bodyCheckInMeasurements.site,
  laterality: bodyCheckInMeasurements.laterality,
  unitAtEntry: bodyCheckInMeasurements.unitAtEntry,
  reading1Mm: bodyCheckInMeasurements.reading1Mm,
  reading2Mm: bodyCheckInMeasurements.reading2Mm,
  reading3Mm: bodyCheckInMeasurements.reading3Mm,
  canonicalMm: bodyCheckInMeasurements.canonicalMm,
  quality: bodyCheckInMeasurements.quality,
  selectedReadingPair: bodyCheckInMeasurements.selectedReadingPair,
  protocolId: bodyCheckInMeasurements.protocolId,
  protocolVersion: bodyCheckInMeasurements.protocolVersion,
  protocolName: bodyCheckInMeasurements.protocolName,
  protocolInstructions: bodyCheckInMeasurements.protocolInstructions,
  protocolSourceUrls: bodyCheckInMeasurements.protocolSourceUrls,
  createdAt: bodyCheckInMeasurements.createdAt,
  updatedAt: bodyCheckInMeasurements.updatedAt,
};

const toPreference = (row: typeof bodyCheckInPreferences.$inferSelect): BodyCheckInPreference => ({
  contractVersion: BODY_CHECK_IN_CONTRACT_VERSION,
  measurementCadenceDays: row.measurementCadenceDays,
  lengthUnit: row.lengthUnit,
  enabledSites: row.enabledSites,
  anchorDate: row.anchorDate,
  reminderLocalTime: row.reminderLocalTime,
  protocolVersion: BODY_PROTOCOL_VERSION,
  snoozedUntil: row.snoozedUntil,
  lastDismissedDueDate: row.lastDismissedDueDate,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const findBodyCheckInPreference = async (
  userId: string,
): Promise<BodyCheckInPreference | null> => {
  const { db } = await import('../../db/index.js');
  const row = db
    .select(preferenceSelection)
    .from(bodyCheckInPreferences)
    .where(eq(bodyCheckInPreferences.userId, userId))
    .get();
  return row ? toPreference({ ...row, userId }) : null;
};

export const upsertBodyCheckInPreference = async (
  userId: string,
  input: PatchBodyCheckInPreference,
): Promise<BodyCheckInPreference> => {
  const { db } = await import('../../db/index.js');
  const existing = await findBodyCheckInPreference(userId);
  const resolved = await resolveUserTimeZoneForUser(userId);
  if (!resolved) throw new UserTimeZoneRequiredError();
  const today = getDateKeyInTimeZone(getApplicationNow(), resolved.timeZone);
  const updatedAt = Date.now();
  if (input.cadenceChange === 'restart' && !input.restartAnchorDate) {
    throw new RangeError('Restarting cadence requires restartAnchorDate');
  }
  if (
    existing &&
    input.anchorDate !== undefined &&
    input.anchorDate !== existing.anchorDate &&
    input.cadenceChange !== 'restart'
  ) {
    throw new RangeError('Changing an existing cadence anchor requires an explicit restart');
  }
  let anchorDate: string;
  if (input.cadenceChange === 'restart') {
    if (!input.restartAnchorDate) throw new RangeError('Restarting cadence requires a date');
    anchorDate = input.restartAnchorDate;
  } else {
    anchorDate = input.anchorDate ?? existing?.anchorDate ?? today;
  }
  const row = db
    .insert(bodyCheckInPreferences)
    .values({
      userId,
      measurementCadenceDays: input.measurementCadenceDays ?? 14,
      lengthUnit: input.lengthUnit ?? 'cm',
      enabledSites: input.enabledSites ?? defaultBodyEnabledSites,
      anchorDate,
      reminderLocalTime: input.reminderLocalTime ?? null,
      protocolVersion: BODY_PROTOCOL_VERSION,
    })
    .onConflictDoUpdate({
      target: bodyCheckInPreferences.userId,
      set: {
        ...(input.measurementCadenceDays === undefined
          ? {}
          : { measurementCadenceDays: input.measurementCadenceDays }),
        ...(input.lengthUnit === undefined ? {} : { lengthUnit: input.lengthUnit }),
        ...(input.enabledSites === undefined ? {} : { enabledSites: input.enabledSites }),
        ...(input.reminderLocalTime === undefined
          ? {}
          : { reminderLocalTime: input.reminderLocalTime }),
        anchorDate,
        updatedAt: sql<number>`max(${bodyCheckInPreferences.updatedAt} + 1, ${updatedAt})`,
      },
    })
    .returning(preferenceSelection)
    .get();
  if (!row) throw new Error('Failed to persist body check-in preferences');
  return toPreference({ ...row, userId });
};

const buildMeasurementValues = (checkInId: string, input: BodyCheckInMeasurementInput) => {
  const canonical = calculateCanonicalBodyReading(input.readings, input.unit);
  const protocol = bodyMeasurementProtocols[input.site];
  return {
    id: randomUUID(),
    checkInId,
    site: input.site,
    laterality: input.laterality,
    unitAtEntry: input.unit,
    reading1Mm: canonical.readingMm[0],
    reading2Mm: canonical.readingMm[1],
    reading3Mm: canonical.readingMm[2],
    canonicalMm: canonical.canonicalMm,
    quality: canonical.quality,
    selectedReadingPair: canonical.selectedReadingPair,
    protocolId: input.site,
    protocolVersion: BODY_PROTOCOL_VERSION,
    protocolName: protocol.name,
    protocolInstructions: protocol.instructions,
    protocolSourceUrls: [...protocol.sourceUrls],
  };
};

const findMeasurements = async (checkInId: string): Promise<BodyCheckInMeasurement[]> => {
  const { db } = await import('../../db/index.js');
  return db
    .select(measurementSelection)
    .from(bodyCheckInMeasurements)
    .where(eq(bodyCheckInMeasurements.checkInId, checkInId))
    .orderBy(asc(bodyCheckInMeasurements.createdAt))
    .all() as BodyCheckInMeasurement[];
};

export const findBodyCheckInById = async (
  id: string,
  userId: string,
): Promise<BodyCheckIn | null> => {
  const { db } = await import('../../db/index.js');
  const row = db
    .select(checkInSelection)
    .from(bodyCheckIns)
    .where(and(eq(bodyCheckIns.id, id), eq(bodyCheckIns.userId, userId)))
    .get();
  return row
    ? {
        contractVersion: BODY_CHECK_IN_CONTRACT_VERSION,
        ...row,
        protocolVersion: BODY_PROTOCOL_VERSION,
        measurements: await findMeasurements(row.id),
      }
    : null;
};

const assertCompletable = (measurements: BodyCheckInMeasurementInput[]) => {
  if (
    measurements.some(
      (measurement) =>
        calculateCanonicalBodyReading(measurement.readings, measurement.unit).quality ===
        'needs_third_reading',
    )
  ) {
    throw new BodyCheckInCompletionError();
  }
};

export const createBodyCheckIn = async ({
  userId,
  input,
  source,
  sourceId,
}: {
  userId: string;
  input: CreateBodyCheckInInput;
  source: 'user' | 'agent_token';
  sourceId: string | null;
}): Promise<{ entry: BodyCheckIn; replayed: boolean }> => {
  if (input.status === 'completed') assertCompletable(input.measurements);
  const resolved = await resolveUserTimeZoneForUser(userId);
  if (!resolved) throw new UserTimeZoneRequiredError();
  const today = getDateKeyInTimeZone(getApplicationNow(), resolved.timeZone);
  if (input.date > today) throw new RangeError('Body check-in date cannot be in the future');
  const { db } = await import('../../db/index.js');
  const idempotencyHash = stableHash(input);
  if (input.idempotencyKey) {
    const replay = db
      .select({ id: bodyCheckIns.id, hash: bodyCheckIns.idempotencyHash })
      .from(bodyCheckIns)
      .where(
        and(eq(bodyCheckIns.userId, userId), eq(bodyCheckIns.idempotencyKey, input.idempotencyKey)),
      )
      .get();
    if (replay) {
      if (replay.hash !== idempotencyHash) throw new BodyCheckInIdempotencyConflictError();
      const entry = await findBodyCheckInById(replay.id, userId);
      if (!entry) throw new Error('Idempotent replay target disappeared');
      return { entry, replayed: true };
    }
  }
  const existing = db
    .select({ id: bodyCheckIns.id })
    .from(bodyCheckIns)
    .where(and(eq(bodyCheckIns.userId, userId), eq(bodyCheckIns.date, input.date)))
    .get();
  if (existing) throw new BodyCheckInConflictError(existing.id);
  const id = randomUUID();
  const now = Date.now();
  try {
    db.transaction((tx) => {
      tx.insert(bodyCheckIns)
        .values({
          id,
          userId,
          date: input.date,
          localTime: input.localTime ?? null,
          status: input.status,
          mealContext: input.mealContext ?? 'unspecified',
          workoutContext: input.workoutContext ?? 'unspecified',
          pumpPresent: input.pumpPresent ?? null,
          unusualBloating: input.unusualBloating ?? null,
          notes: input.notes ?? null,
          protocolVersion: BODY_PROTOCOL_VERSION,
          source,
          sourceId,
          countAsScheduledOccurrence: input.countAsScheduledOccurrence ?? true,
          idempotencyKey: input.idempotencyKey ?? null,
          idempotencyHash: input.idempotencyKey ? idempotencyHash : null,
          completedAt: input.status === 'completed' ? now : null,
        })
        .run();
      if (input.measurements.length > 0) {
        tx.insert(bodyCheckInMeasurements)
          .values(input.measurements.map((measurement) => buildMeasurementValues(id, measurement)))
          .run();
      }
    });
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      String((error as { code?: unknown }).code).startsWith('SQLITE_CONSTRAINT')
    ) {
      if (input.idempotencyKey) {
        const replay = db
          .select({ id: bodyCheckIns.id, hash: bodyCheckIns.idempotencyHash })
          .from(bodyCheckIns)
          .where(
            and(
              eq(bodyCheckIns.userId, userId),
              eq(bodyCheckIns.idempotencyKey, input.idempotencyKey),
            ),
          )
          .get();
        if (replay) {
          if (replay.hash !== idempotencyHash) throw new BodyCheckInIdempotencyConflictError();
          const entry = await findBodyCheckInById(replay.id, userId);
          if (!entry) throw new Error('Idempotent replay target disappeared', { cause: error });
          return { entry, replayed: true };
        }
      }
      const conflict = db
        .select({ id: bodyCheckIns.id })
        .from(bodyCheckIns)
        .where(and(eq(bodyCheckIns.userId, userId), eq(bodyCheckIns.date, input.date)))
        .get();
      if (conflict) throw new BodyCheckInConflictError(conflict.id);
    }
    throw error;
  }
  const entry = await findBodyCheckInById(id, userId);
  if (!entry) throw new Error('Failed to read persisted body check-in');
  return { entry, replayed: false };
};

export const patchBodyCheckIn = async (
  id: string,
  userId: string,
  input: PatchBodyCheckInInput,
  actor: { source: 'user' | 'agent_token'; sourceId: string | null },
): Promise<BodyCheckIn | null> => {
  const existing = await findBodyCheckInById(id, userId);
  if (!existing) return null;
  const targetStatus = input.status ?? existing.status;
  const measurements =
    input.measurements ??
    existing.measurements.map((measurement) => ({
      site: measurement.site,
      laterality: measurement.laterality,
      unit: measurement.unitAtEntry,
      readings: [measurement.reading1Mm, measurement.reading2Mm, measurement.reading3Mm]
        .filter((value): value is number => value !== null)
        .map((value) => value / (measurement.unitAtEntry === 'cm' ? 10 : 25.4)),
    }));
  if (targetStatus === 'completed') assertCompletable(measurements);
  const { db } = await import('../../db/index.js');
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(bodyCheckIns)
      .set({
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.localTime === undefined ? {} : { localTime: input.localTime }),
        ...(input.mealContext === undefined ? {} : { mealContext: input.mealContext }),
        ...(input.workoutContext === undefined ? {} : { workoutContext: input.workoutContext }),
        ...(input.pumpPresent === undefined ? {} : { pumpPresent: input.pumpPresent }),
        ...(input.unusualBloating === undefined ? {} : { unusualBloating: input.unusualBloating }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(input.countAsScheduledOccurrence === undefined
          ? {}
          : { countAsScheduledOccurrence: input.countAsScheduledOccurrence }),
        ...(input.correctionReason === undefined
          ? {}
          : { correctionReason: input.correctionReason }),
        completedAt: targetStatus === 'completed' ? (existing.completedAt ?? now) : null,
        correctedAt: existing.status === 'completed' ? now : existing.correctedAt,
        correctedBySource:
          existing.status === 'completed' ? actor.source : existing.correctedBySource,
        correctedBySourceId:
          existing.status === 'completed' ? actor.sourceId : existing.correctedBySourceId,
        updatedAt: sql<number>`max(${bodyCheckIns.updatedAt} + 1, ${now})`,
      })
      .where(and(eq(bodyCheckIns.id, id), eq(bodyCheckIns.userId, userId)))
      .run();
    if (input.measurements) {
      tx.delete(bodyCheckInMeasurements).where(eq(bodyCheckInMeasurements.checkInId, id)).run();
      if (input.measurements.length > 0)
        tx.insert(bodyCheckInMeasurements)
          .values(input.measurements.map((measurement) => buildMeasurementValues(id, measurement)))
          .run();
    }
  });
  return findBodyCheckInById(id, userId);
};

export const deleteBodyCheckIn = async (id: string, userId: string) => {
  const { db } = await import('../../db/index.js');
  return (
    db
      .delete(bodyCheckIns)
      .where(and(eq(bodyCheckIns.id, id), eq(bodyCheckIns.userId, userId)))
      .run().changes === 1
  );
};

export const listBodyCheckIns = async (
  userId: string,
  query: { from?: string; to?: string; page: number; limit: number },
) => {
  const { db } = await import('../../db/index.js');
  const conditions = [eq(bodyCheckIns.userId, userId)];
  if (query.from) conditions.push(gte(bodyCheckIns.date, query.from));
  if (query.to) conditions.push(lte(bodyCheckIns.date, query.to));
  const where = and(...conditions);
  const rows = db
    .select({ id: bodyCheckIns.id })
    .from(bodyCheckIns)
    .where(where)
    .orderBy(desc(bodyCheckIns.date))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit)
    .all();
  const total =
    db
      .select({ value: sql<number>`count(*)` })
      .from(bodyCheckIns)
      .where(where)
      .get()?.value ?? 0;
  return {
    entries: (await Promise.all(rows.map((row) => findBodyCheckInById(row.id, userId)))).filter(
      (row): row is BodyCheckIn => row !== null,
    ),
    total,
  };
};

const occurrenceFor = (anchorDate: string, cadenceDays: number, date: string) => {
  if (date < anchorDate) return { current: null, next: anchorDate };
  const days = Math.floor(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${anchorDate}T00:00:00Z`)) / 86_400_000,
  );
  const index = Math.floor(days / cadenceDays);
  const current = addUtcDays(anchorDate, index * cadenceDays);
  return { current, next: addUtcDays(current, cadenceDays) };
};

export const getBodyDueState = async (
  userId: string,
  explicitDate?: string,
): Promise<BodyDueState> => {
  const preference = await findBodyCheckInPreference(userId);
  const resolved = await resolveUserTimeZoneForUser(userId);
  if (!explicitDate && !resolved) throw new UserTimeZoneRequiredError();
  const localDate =
    explicitDate ??
    (resolved ? getDateKeyInTimeZone(getApplicationNow(), resolved.timeZone) : null);
  if (!localDate) throw new UserTimeZoneRequiredError();
  const authority = resolved ?? null;
  if (!preference)
    return {
      contractVersion: BODY_CHECK_IN_CONTRACT_VERSION,
      state: 'not_configured',
      localDate,
      timeZone: authority?.timeZone ?? null,
      timeZoneSource: authority?.source ?? null,
      occurrenceDueDate: null,
      nextDueDate: null,
      snoozedUntil: null,
      satisfiedByCheckInId: null,
    };
  const occurrence = occurrenceFor(
    preference.anchorDate,
    preference.measurementCadenceDays,
    localDate,
  );
  if (!occurrence.current)
    return {
      contractVersion: BODY_CHECK_IN_CONTRACT_VERSION,
      state: 'upcoming',
      localDate,
      timeZone: authority?.timeZone ?? null,
      timeZoneSource: authority?.source ?? null,
      occurrenceDueDate: null,
      nextDueDate: occurrence.next,
      snoozedUntil: preference.snoozedUntil,
      satisfiedByCheckInId: null,
    };
  const { db } = await import('../../db/index.js');
  const satisfied = db
    .select({ id: bodyCheckIns.id })
    .from(bodyCheckIns)
    .where(
      and(
        eq(bodyCheckIns.userId, userId),
        eq(bodyCheckIns.status, 'completed'),
        eq(bodyCheckIns.countAsScheduledOccurrence, true),
        gte(bodyCheckIns.date, occurrence.current),
        lte(bodyCheckIns.date, addUtcDays(occurrence.next, -1)),
      ),
    )
    .orderBy(desc(bodyCheckIns.date))
    .get();
  let state: BodyDueState['state'];
  let nextDueDate = occurrence.current;
  if (satisfied) {
    state = 'satisfied';
    nextDueDate = occurrence.next;
  } else if (preference.lastDismissedDueDate === occurrence.current) {
    state = 'skipped_current_occurrence';
    nextDueDate = occurrence.next;
  } else if (preference.snoozedUntil && preference.snoozedUntil > localDate) {
    state = 'snoozed';
    nextDueDate = preference.snoozedUntil;
  } else state = localDate === occurrence.current ? 'due_today' : 'overdue';
  return {
    contractVersion: BODY_CHECK_IN_CONTRACT_VERSION,
    state,
    localDate,
    timeZone: authority?.timeZone ?? null,
    timeZoneSource: authority?.source ?? null,
    occurrenceDueDate: occurrence.current,
    nextDueDate,
    snoozedUntil: preference.snoozedUntil,
    satisfiedByCheckInId: satisfied?.id ?? null,
  };
};

export const skipBodyDueOccurrence = async (userId: string, dueDate: string) => {
  const due = await getBodyDueState(userId);
  if (due.state === 'skipped_current_occurrence' && due.occurrenceDueDate === dueDate) return due;
  if (
    due.occurrenceDueDate !== dueDate ||
    !['due_today', 'overdue', 'snoozed'].includes(due.state)
  ) {
    throw new RangeError('Only the current unsatisfied occurrence can be skipped');
  }
  const { db } = await import('../../db/index.js');
  const preference = await findBodyCheckInPreference(userId);
  if (!preference) throw new RangeError('Body check-in preferences are not configured');
  const result = db
    .update(bodyCheckInPreferences)
    .set({
      lastDismissedDueDate: dueDate,
      snoozedUntil: null,
      updatedAt: sql<number>`max(${bodyCheckInPreferences.updatedAt} + 1, ${Date.now()})`,
    })
    .where(
      and(
        eq(bodyCheckInPreferences.userId, userId),
        eq(bodyCheckInPreferences.updatedAt, preference.updatedAt),
      ),
    )
    .run();
  if (result.changes !== 1) throw new BodyCheckInIdempotencyConflictError();
  return getBodyDueState(userId);
};

export const snoozeBodyDueOccurrence = async (
  userId: string,
  dueDate: string,
  snoozedUntil: string,
) => {
  const due = await getBodyDueState(userId);
  const preference = await findBodyCheckInPreference(userId);
  if (
    due.state === 'snoozed' &&
    due.occurrenceDueDate === dueDate &&
    due.snoozedUntil === snoozedUntil
  )
    return due;
  if (!preference) throw new RangeError('Body check-in preferences are not configured');
  const nextOccurrence = addUtcDays(dueDate, preference.measurementCadenceDays);
  if (
    due.occurrenceDueDate !== dueDate ||
    !due.localDate ||
    snoozedUntil <= due.localDate ||
    snoozedUntil >= nextOccurrence ||
    !['due_today', 'overdue', 'snoozed'].includes(due.state)
  ) {
    throw new RangeError('Snooze must target the current occurrence and a future local date');
  }
  const { db } = await import('../../db/index.js');
  const result = db
    .update(bodyCheckInPreferences)
    .set({
      snoozedUntil,
      updatedAt: sql<number>`max(${bodyCheckInPreferences.updatedAt} + 1, ${Date.now()})`,
    })
    .where(
      and(
        eq(bodyCheckInPreferences.userId, userId),
        eq(bodyCheckInPreferences.updatedAt, preference.updatedAt),
      ),
    )
    .run();
  if (result.changes !== 1) throw new BodyCheckInIdempotencyConflictError();
  return getBodyDueState(userId);
};

export const getBodyContextFacts = async (userId: string) => {
  const preference = await findBodyCheckInPreference(userId);
  const due = await getBodyDueState(userId);
  const { db } = await import('../../db/index.js');
  const latest = db
    .select({ id: bodyCheckIns.id })
    .from(bodyCheckIns)
    .where(and(eq(bodyCheckIns.userId, userId), eq(bodyCheckIns.status, 'completed')))
    .orderBy(desc(bodyCheckIns.date))
    .get();
  const latestCompleted = latest ? await findBodyCheckInById(latest.id, userId) : null;
  return {
    contractVersion: BODY_CHECK_IN_CONTRACT_VERSION,
    configured: preference !== null,
    enabledSites: preference?.enabledSites ?? [],
    latestCompleted: latestCompleted
      ? {
          id: latestCompleted.id,
          date: latestCompleted.date,
          correctedAt: latestCompleted.correctedAt,
          hasWaist: latestCompleted.measurements.some(
            (measurement) => measurement.site === 'waist_iliac_crest_nhanes',
          ),
          measurements: latestCompleted.measurements.map(
            ({ canonicalMm, laterality, quality, site }) => ({
              site,
              laterality,
              canonicalMm,
              quality,
            }),
          ),
        }
      : null,
    due,
  };
};

export const exportBodyCheckIns = async (userId: string) => {
  const preference = await findBodyCheckInPreference(userId);
  const { db } = await import('../../db/index.js');
  const rows = db
    .select({ id: bodyCheckIns.id })
    .from(bodyCheckIns)
    .where(eq(bodyCheckIns.userId, userId))
    .orderBy(desc(bodyCheckIns.date))
    .all();
  const entries = (
    await Promise.all(rows.map((row) => findBodyCheckInById(row.id, userId)))
  ).filter((row): row is BodyCheckIn => row !== null);
  return {
    contractVersion: BODY_CHECK_IN_CONTRACT_VERSION,
    exportedAt: Date.now(),
    preferences: preference,
    checkIns: entries,
  };
};
