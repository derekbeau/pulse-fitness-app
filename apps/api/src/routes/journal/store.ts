import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type {
  ActivityJournalActor,
  CreateJournalObservationApiInput,
  CorrectJournalObservationApiInput,
  JournalDetail,
  JournalObservation,
  OwnedEntityReference,
} from '@pulse/shared';
import {
  createJournalObservationApiInputSchema,
  journalDetailSchema,
  journalListSchema,
  journalObservationSchema,
  weeklyReflectionReadModelSchema,
} from '@pulse/shared';
import * as schema from '../../db/schema/index.js';
import {
  bodyContextFlares,
  dailyCheckInAnswers,
  dailyCheckInQuestions,
  journalEntries,
  journalIdempotencyReceipts,
  journalObservationRevisions,
  journalObservations,
  nutritionLogs,
  workoutSessions,
} from '../../db/schema/index.js';
import { getApplicationNow } from '../../lib/clock.js';
import {
  getDateKeyInTimeZone,
  resolveUserTimeZoneForUser,
  UserTimeZoneRequiredError,
} from '../../lib/user-time-zone.js';
import {
  readCurrentJournalSourceRevision,
  readCurrentSourceRevision,
} from '../daily-check-in/source-authority.js';
import { JournalReadLimitError } from './read-limit.js';

const dbFor = (sqlite: Database.Database) => drizzle(sqlite, { schema });
const getSqlite = async () => (await import('../../db/index.js')).sqlite;
const JOURNAL_DAILY_LIMIT = 200;
const JOURNAL_LIST_KIND_LIMIT = 500;
const now = () => getApplicationNow().toISOString();
const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, stable(x)]),
        )
      : v;
const hash = (v: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(stable(v)))
    .digest('hex');
const refKey = (r: { kind: string; id: string; revisionId: string | null }) =>
  JSON.stringify([r.kind, r.id, r.revisionId]);
const normalize = (v: string) => v.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
const canonicalRequestPayload = (operation: string, payload: unknown): unknown => {
  const input = payload as Record<string, unknown>;
  const canonicalRefs = (refs: unknown) =>
    Array.isArray(refs)
      ? [...new Map(refs.map((ref) => [hash(ref), ref])).values()].sort((a, b) =>
          hash(a).localeCompare(hash(b)),
        )
      : refs;
  if (operation === 'create')
    return { ...input, sourceReferences: canonicalRefs(input.sourceReferences) };
  if (operation === 'correct') {
    const fields = input.correctedFields as Record<string, unknown>;
    return {
      ...input,
      correctedFields: {
        ...fields,
        ...(fields.sourceReferences === undefined
          ? {}
          : { sourceReferences: canonicalRefs(fields.sourceReferences) }),
      },
    };
  }
  return input;
};

export class JournalNotFoundError extends Error {
  readonly code = 'JOURNAL_NOT_FOUND';
}
export class JournalOwnedLinkNotFoundError extends Error {
  readonly code = 'OWNED_LINK_NOT_FOUND';
}
export class JournalRoutineCopyError extends Error {
  readonly code = 'ROUTINE_LOG_COPY';
}
export class JournalIdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSE';
}
export class JournalReceiptIntegrityError extends Error {
  readonly code = 'JOURNAL_RECEIPT_INVALID';
}
export class JournalStaleRevisionError extends Error {
  readonly code = 'STALE_REVISION';
  constructor(
    readonly expectedRevisionId: string,
    readonly currentRevisionId: string,
  ) {
    super('The Journal observation changed before this correction.');
  }
}
export class JournalRangeError extends Error {
  readonly code = 'VALIDATION_ERROR';
}

type InputReference = CreateJournalObservationApiInput['sourceReferences'][number];
const normalizeReferences = (
  sqlite: Database.Database,
  userId: string,
  refs: InputReference[],
): OwnedEntityReference[] => {
  const validated = refs.map((ref) => {
    if (ref.subjectUserId !== undefined && ref.subjectUserId !== userId)
      throw new JournalOwnedLinkNotFoundError();
    const current = readCurrentJournalSourceRevision(sqlite, userId, ref.kind, ref.id);
    if (!current || current !== ref.revisionId) throw new JournalOwnedLinkNotFoundError();
    return { kind: ref.kind, id: ref.id, subjectUserId: userId, revisionId: current };
  });
  return [...new Map(validated.map((ref) => [refKey(ref), ref])).values()].sort((a, b) =>
    refKey(a).localeCompare(refKey(b)),
  );
};
const canonicalCopies = (
  sqlite: Database.Database,
  userId: string,
  refs: OwnedEntityReference[],
): string[] => {
  const db = dbFor(sqlite);
  const values: string[] = [];
  for (const { kind, id } of refs) {
    if (kind === 'activity') {
      const r = db
        .select({ name: schema.canonicalActivities.name })
        .from(schema.canonicalActivities)
        .where(
          and(eq(schema.canonicalActivities.userId, userId), eq(schema.canonicalActivities.id, id)),
        )
        .get();
      if (r) values.push(r.name, `completed ${r.name}`);
    } else if (kind === 'activity_assignment') {
      const r = db
        .select({ name: schema.canonicalActivities.name })
        .from(schema.activityAssignments)
        .innerJoin(
          schema.canonicalActivities,
          eq(schema.canonicalActivities.id, schema.activityAssignments.activityId),
        )
        .where(
          and(eq(schema.activityAssignments.userId, userId), eq(schema.activityAssignments.id, id)),
        )
        .get();
      if (r) values.push(r.name, `completed ${r.name}`);
    } else if (kind === 'activity_execution') {
      const r = db
        .select({ name: schema.canonicalActivities.name })
        .from(schema.activityExecutions)
        .innerJoin(
          schema.canonicalActivities,
          eq(schema.canonicalActivities.id, schema.activityExecutions.activityId),
        )
        .where(
          and(eq(schema.activityExecutions.userId, userId), eq(schema.activityExecutions.id, id)),
        )
        .get();
      if (r) values.push(r.name, `completed ${r.name}`);
    } else if (kind === 'workout_session') {
      const r = db
        .select({ name: workoutSessions.name })
        .from(workoutSessions)
        .where(and(eq(workoutSessions.userId, userId), eq(workoutSessions.id, id)))
        .get();
      if (r) values.push(r.name, `completed ${r.name}`);
    } else if (kind === 'activity_goal') {
      const r = db
        .select({ label: schema.activityGoals.label })
        .from(schema.activityGoals)
        .where(and(eq(schema.activityGoals.userId, userId), eq(schema.activityGoals.id, id)))
        .get();
      if (r) values.push(r.label);
    } else if (kind === 'scheduled_workout') {
      const r = db
        .select({ name: schema.workoutTemplates.name })
        .from(schema.scheduledWorkouts)
        .innerJoin(
          schema.workoutTemplates,
          eq(schema.workoutTemplates.id, schema.scheduledWorkouts.templateId),
        )
        .where(
          and(eq(schema.scheduledWorkouts.userId, userId), eq(schema.scheduledWorkouts.id, id)),
        )
        .get();
      if (r) values.push(r.name, `completed ${r.name}`);
    } else if (kind === 'body_concern') {
      const r = db
        .select({ label: schema.bodyContextConcerns.label })
        .from(schema.bodyContextConcerns)
        .where(
          and(eq(schema.bodyContextConcerns.userId, userId), eq(schema.bodyContextConcerns.id, id)),
        )
        .get();
      if (r) values.push(r.label);
    } else if (kind === 'capability') {
      const r = db
        .select({ label: schema.bodyContextCapabilities.label })
        .from(schema.bodyContextCapabilities)
        .where(
          and(
            eq(schema.bodyContextCapabilities.userId, userId),
            eq(schema.bodyContextCapabilities.id, id),
          ),
        )
        .get();
      if (r) values.push(r.label);
    } else if (kind === 'guidance') {
      const r = db
        .select({ text: schema.bodyContextGuidance.text })
        .from(schema.bodyContextGuidance)
        .where(
          and(eq(schema.bodyContextGuidance.userId, userId), eq(schema.bodyContextGuidance.id, id)),
        )
        .get();
      if (r) values.push(r.text);
    } else if (kind === 'observation') {
      const r = db
        .select({ text: bodyContextFlares.observation })
        .from(bodyContextFlares)
        .where(and(eq(bodyContextFlares.userId, userId), eq(bodyContextFlares.id, id)))
        .get();
      if (r) values.push(r.text);
    } else if (kind === 'check_in_question') {
      const r = db
        .select({ prompt: dailyCheckInQuestions.prompt })
        .from(dailyCheckInQuestions)
        .where(and(eq(dailyCheckInQuestions.userId, userId), eq(dailyCheckInQuestions.id, id)))
        .get();
      if (r) values.push(r.prompt);
    } else if (kind === 'check_in_answer') {
      const r = db
        .select({ value: dailyCheckInAnswers.value })
        .from(dailyCheckInAnswers)
        .where(and(eq(dailyCheckInAnswers.userId, userId), eq(dailyCheckInAnswers.id, id)))
        .get();
      if (r?.value) values.push(r.value);
    } else if (kind === 'meal') {
      const r = db
        .select({ name: schema.meals.name, summary: schema.meals.summary })
        .from(schema.meals)
        .innerJoin(nutritionLogs, eq(nutritionLogs.id, schema.meals.nutritionLogId))
        .where(and(eq(nutritionLogs.userId, userId), eq(schema.meals.id, id)))
        .get();
      if (r) values.push(r.name, ...(r.summary ? [r.summary] : []));
      const calories = sqlite
        .prepare('select sum(calories) total from meal_items where meal_id = ?')
        .get(id) as { total: number | null };
      if (calories.total !== null) values.push(`${calories.total} kcal`);
    } else if (kind === 'proposal') {
      const r = db
        .select({ summary: schema.planChangeProposals.summary })
        .from(schema.planChangeProposals)
        .where(
          and(eq(schema.planChangeProposals.userId, userId), eq(schema.planChangeProposals.id, id)),
        )
        .get();
      if (r) values.push(r.summary);
    } else if (kind === 'nutrition_log') {
      const calories = sqlite
        .prepare(
          'select sum(mi.calories) total from meal_items mi join meals m on m.id = mi.meal_id where m.nutrition_log_id = ?',
        )
        .get(id) as { total: number | null };
      if (calories.total !== null) values.push(`${calories.total} kcal`);
    }
  }
  return values;
};
const rejectRoutineCopy = (
  sqlite: Database.Database,
  userId: string,
  content: string,
  refs: OwnedEntityReference[],
) => {
  const normalized = normalize(content);
  if (canonicalCopies(sqlite, userId, refs).some((value) => normalize(value) === normalized))
    throw new JournalRoutineCopyError();
};
const row = (sqlite: Database.Database, userId: string, id: string) =>
  dbFor(sqlite)
    .select()
    .from(journalObservations)
    .where(and(eq(journalObservations.id, id), eq(journalObservations.userId, userId)))
    .get();
const detail = (sqlite: Database.Database, userId: string, id: string): JournalDetail => {
  const current = row(sqlite, userId, id);
  if (!current) throw new JournalNotFoundError();
  const history = dbFor(sqlite)
    .select()
    .from(journalObservationRevisions)
    .where(
      and(
        eq(journalObservationRevisions.observationId, id),
        eq(journalObservationRevisions.userId, userId),
      ),
    )
    .orderBy(asc(journalObservationRevisions.revision))
    .all();
  return journalDetailSchema.parse({
    observation: current.snapshot,
    history: history.map((r) => ({
      id: r.id,
      revision: r.revision,
      priorRevisionId: r.priorRevisionId,
      recordedAt: r.recordedAt,
      recordedBy: r.recordedBy,
      reason: r.reason,
      observation: r.snapshot,
    })),
  });
};
const verifyReceipt = (
  sqlite: Database.Database,
  userId: string,
  response: unknown,
): JournalDetail => {
  const parsed = journalDetailSchema.safeParse(response);
  if (!parsed.success) throw new JournalReceiptIntegrityError();
  const current = row(sqlite, userId, parsed.data.observation.id);
  if (!current) throw new JournalReceiptIntegrityError();
  const revisions = dbFor(sqlite)
    .select()
    .from(journalObservationRevisions)
    .where(
      and(
        eq(journalObservationRevisions.observationId, current.id),
        eq(journalObservationRevisions.userId, userId),
      ),
    )
    .orderBy(asc(journalObservationRevisions.revision))
    .all();
  const stored = parsed.data.history;
  if (stored.length > revisions.length) throw new JournalReceiptIntegrityError();
  for (let i = 0; i < stored.length; i++) {
    const r = revisions[i];
    const s = stored[i];
    if (
      !r ||
      !s ||
      r.id !== s.id ||
      r.revision !== i + 1 ||
      r.priorRevisionId !== (i === 0 ? null : stored[i - 1]?.id) ||
      hash({
        id: r.id,
        revision: r.revision,
        priorRevisionId: r.priorRevisionId,
        recordedAt: r.recordedAt,
        recordedBy: r.recordedBy,
        reason: r.reason,
        observation: r.snapshot,
      }) !== hash(s)
    )
      throw new JournalReceiptIntegrityError();
  }
  if (hash(stored.at(-1)?.observation) !== hash(parsed.data.observation))
    throw new JournalReceiptIntegrityError();
  return parsed.data;
};
const idempotent = async (args: {
  userId: string;
  route: string;
  operation: string;
  key: string;
  payload: unknown;
  statusCode: number;
  write: (sqlite: Database.Database) => JournalDetail;
}) => {
  const sqlite = await getSqlite();
  return sqlite
    .transaction(() => {
      const db = dbFor(sqlite);
      const fingerprint = hash(canonicalRequestPayload(args.operation, args.payload));
      const previous = db
        .select()
        .from(journalIdempotencyReceipts)
        .where(
          and(
            eq(journalIdempotencyReceipts.userId, args.userId),
            eq(journalIdempotencyReceipts.route, args.route),
            eq(journalIdempotencyReceipts.operation, args.operation),
            eq(journalIdempotencyReceipts.idempotencyKey, args.key),
          ),
        )
        .get();
      if (previous) {
        if (previous.requestFingerprint !== fingerprint)
          throw new JournalIdempotencyConflictError();
        return {
          data: verifyReceipt(sqlite, args.userId, previous.response),
          replayed: true,
          statusCode: previous.statusCode,
        };
      }
      const data = args.write(sqlite);
      db.insert(journalIdempotencyReceipts)
        .values({
          id: randomUUID(),
          userId: args.userId,
          route: args.route,
          operation: args.operation,
          idempotencyKey: args.key,
          requestFingerprint: fingerprint,
          statusCode: args.statusCode,
          response: data,
          createdAt: now(),
        })
        .run();
      return { data, replayed: false, statusCode: args.statusCode };
    })
    .immediate();
};
export const createJournalObservation = async (
  userId: string,
  actor: ActivityJournalActor,
  input: CreateJournalObservationApiInput,
) => {
  const zone = await resolveUserTimeZoneForUser(userId);
  if (!zone) throw new UserTimeZoneRequiredError();
  return idempotent({
    userId,
    route: '/api/v1/journal',
    operation: 'create',
    key: input.idempotencyKey,
    payload: input,
    statusCode: 201,
    write(sqlite) {
      const refs = normalizeReferences(sqlite, userId, input.sourceReferences);
      rejectRoutineCopy(sqlite, userId, input.content, refs);
      const id = randomUUID();
      const revisionId = randomUUID();
      const at = now();
      const observation = journalObservationSchema.parse({
        id,
        subjectUserId: userId,
        localDate: input.localDate,
        timeZone: zone.timeZone,
        title: input.title,
        content: input.content,
        category: input.category,
        sourceReferences: refs,
        source: { ...input.source, capturedAt: at, capturedBy: actor },
        currentRevisionId: revisionId,
        createdAt: at,
      });
      const db = dbFor(sqlite);
      db.insert(journalObservations)
        .values({
          id,
          userId,
          localDate: observation.localDate,
          timeZone: observation.timeZone,
          currentRevisionId: revisionId,
          revision: 1,
          snapshot: observation,
          createdAt: at,
        })
        .run();
      db.insert(journalObservationRevisions)
        .values({
          id: revisionId,
          observationId: id,
          userId,
          revision: 1,
          priorRevisionId: null,
          recordedAt: at,
          recordedBy: actor,
          reason: null,
          snapshot: observation,
        })
        .run();
      return detail(sqlite, userId, id);
    },
  });
};
export const correctJournalObservation = async (
  userId: string,
  actor: ActivityJournalActor,
  id: string,
  input: CorrectJournalObservationApiInput,
) =>
  idempotent({
    userId,
    route: `/api/v1/journal/${id}/corrections`,
    operation: 'correct',
    key: input.idempotencyKey,
    payload: input,
    statusCode: 200,
    write(sqlite) {
      const current = row(sqlite, userId, id);
      if (!current) throw new JournalNotFoundError();
      if (current.currentRevisionId !== input.expectedRevisionId)
        throw new JournalStaleRevisionError(input.expectedRevisionId, current.currentRevisionId);
      const fields = input.correctedFields;
      const refs = normalizeReferences(
        sqlite,
        userId,
        fields.sourceReferences ??
          createJournalObservationApiInputSchema.shape.sourceReferences.parse(
            current.snapshot.sourceReferences.map(({ kind, id, revisionId }) => ({
              kind,
              id,
              revisionId,
            })),
          ),
      );
      const content = fields.content ?? current.snapshot.content;
      rejectRoutineCopy(sqlite, userId, content, refs);
      const revisionId = randomUUID();
      const at = now();
      const observation = journalObservationSchema.parse({
        ...current.snapshot,
        ...fields,
        content,
        sourceReferences: refs,
        source: fields.source
          ? { ...fields.source, capturedAt: at, capturedBy: actor }
          : current.snapshot.source,
        currentRevisionId: revisionId,
      });
      const db = dbFor(sqlite);
      const changed = db
        .update(journalObservations)
        .set({
          localDate: observation.localDate,
          timeZone: observation.timeZone,
          currentRevisionId: revisionId,
          revision: current.revision + 1,
          snapshot: observation,
        })
        .where(
          and(
            eq(journalObservations.id, id),
            eq(journalObservations.userId, userId),
            eq(journalObservations.currentRevisionId, input.expectedRevisionId),
          ),
        )
        .run();
      if (changed.changes !== 1)
        throw new JournalStaleRevisionError(
          input.expectedRevisionId,
          row(sqlite, userId, id)?.currentRevisionId ?? '',
        );
      db.insert(journalObservationRevisions)
        .values({
          id: revisionId,
          observationId: id,
          userId,
          revision: current.revision + 1,
          priorRevisionId: current.currentRevisionId,
          recordedAt: at,
          recordedBy: actor,
          reason: input.reason,
          snapshot: observation,
        })
        .run();
      return detail(sqlite, userId, id);
    },
  });
export const getJournalDetail = async (userId: string, id: string) => {
  const sqlite = await getSqlite();
  return row(sqlite, userId, id) ? detail(sqlite, userId, id) : null;
};
export const readJournalForDate = (
  sqlite: Database.Database,
  userId: string,
  localDate: string,
): JournalObservation[] => {
  const rows = dbFor(sqlite)
    .select({ snapshot: journalObservations.snapshot })
    .from(journalObservations)
    .where(
      and(eq(journalObservations.userId, userId), eq(journalObservations.localDate, localDate)),
    )
    .orderBy(asc(journalObservations.createdAt), asc(journalObservations.id))
    .limit(JOURNAL_DAILY_LIMIT + 1)
    .all();
  if (rows.length > JOURNAL_DAILY_LIMIT)
    throw new JournalReadLimitError('daily_context', JOURNAL_DAILY_LIMIT);
  return rows.map((r) => journalObservationSchema.parse(r.snapshot));
};
const days = (start: string, end: string) => {
  const out: string[] = [];
  let at = new Date(`${start}T12:00:00.000Z`);
  while (at.toISOString().slice(0, 10) <= end && out.length <= 31) {
    out.push(at.toISOString().slice(0, 10));
    at = new Date(at.getTime() + 86_400_000);
  }
  return out;
};
const checkedRange = (from: string, to: string, max: number) => {
  const dates = days(from, to);
  if (to < from || dates.length > max || dates.at(-1) !== to) throw new JournalRangeError();
  return dates;
};
export const listJournal = async (userId: string, from?: string, to?: string) => {
  const zone = await resolveUserTimeZoneForUser(userId);
  if (!zone) throw new UserTimeZoneRequiredError();
  const today = getDateKeyInTimeZone(getApplicationNow(), zone.timeZone);
  const start = from ?? today;
  const end = to ?? start;
  checkedRange(start, end, 31);
  const sqlite = await getSqlite();
  const db = dbFor(sqlite);
  const canonicalRows = db
    .select({ snapshot: journalObservations.snapshot })
    .from(journalObservations)
    .where(
      and(
        eq(journalObservations.userId, userId),
        gte(journalObservations.localDate, start),
        lte(journalObservations.localDate, end),
      ),
    )
    .orderBy(
      asc(journalObservations.localDate),
      asc(journalObservations.createdAt),
      asc(journalObservations.id),
    )
    .limit(JOURNAL_LIST_KIND_LIMIT + 1)
    .all();
  if (canonicalRows.length > JOURNAL_LIST_KIND_LIMIT)
    throw new JournalReadLimitError('journal_list_canonical', JOURNAL_LIST_KIND_LIMIT);
  const canonical = canonicalRows.map((r) => ({
    kind: 'canonical' as const,
    observation: r.snapshot,
  }));
  const legacyRows = db
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.userId, userId),
        gte(journalEntries.date, start),
        lte(journalEntries.date, end),
      ),
    )
    .orderBy(asc(journalEntries.date), asc(journalEntries.createdAt), asc(journalEntries.id))
    .limit(JOURNAL_LIST_KIND_LIMIT + 1)
    .all();
  if (legacyRows.length > JOURNAL_LIST_KIND_LIMIT)
    throw new JournalReadLimitError('journal_list_legacy', JOURNAL_LIST_KIND_LIMIT);
  const legacy = legacyRows.map((r) => ({
    kind: 'legacy_date_only' as const,
    id: r.id,
    localDate: r.date,
    title: r.title,
    type: r.type,
    content: r.content,
    limitation: 'Source links, timezone, actor, and revisions were never recorded.' as const,
  }));
  return journalListSchema.parse({
    items: [...canonical, ...legacy].sort(
      (a, b) =>
        (a.kind === 'canonical' ? a.observation.localDate : a.localDate).localeCompare(
          b.kind === 'canonical' ? b.observation.localDate : b.localDate,
        ) ||
        (a.kind === 'canonical' ? a.observation.id : a.id).localeCompare(
          b.kind === 'canonical' ? b.observation.id : b.id,
        ),
    ),
  });
};
export const weeklyReflection = async (userId: string, start: string, end: string) => {
  const dates = checkedRange(start, end, 14);
  const zone = await resolveUserTimeZoneForUser(userId);
  if (!zone) throw new UserTimeZoneRequiredError();
  const sqlite = await getSqlite();
  const db = dbFor(sqlite);
  const journals = db
    .select({ snapshot: journalObservations.snapshot })
    .from(journalObservations)
    .where(
      and(
        eq(journalObservations.userId, userId),
        gte(journalObservations.localDate, start),
        lte(journalObservations.localDate, end),
      ),
    )
    .all()
    .map((r) => journalObservationSchema.parse(r.snapshot));
  const answers = db
    .select({ answer: dailyCheckInAnswers, question: dailyCheckInQuestions })
    .from(dailyCheckInAnswers)
    .innerJoin(dailyCheckInQuestions, eq(dailyCheckInAnswers.questionId, dailyCheckInQuestions.id))
    .where(
      and(
        eq(dailyCheckInAnswers.userId, userId),
        eq(dailyCheckInQuestions.userId, userId),
        gte(dailyCheckInQuestions.localDate, start),
        lte(dailyCheckInQuestions.localDate, end),
      ),
    )
    .all();
  const flares = db
    .select()
    .from(bodyContextFlares)
    .where(
      and(
        eq(bodyContextFlares.userId, userId),
        gte(bodyContextFlares.localDate, start),
        lte(bodyContextFlares.localDate, end),
      ),
    )
    .all();
  const facts = [
    ...journals.map((j) => ({
      id: j.id,
      localDate: j.localDate,
      kind: 'journal_entry',
      summary: j.content,
      sourceReferences: [
        ...j.sourceReferences,
        {
          kind: 'journal_entry' as const,
          id: j.id,
          subjectUserId: userId,
          revisionId: j.currentRevisionId,
        },
      ],
    })),
    ...answers
      .filter(({ answer }) => answer.state === 'answered' && answer.value)
      .map(({ answer, question }) => ({
        id: answer.id,
        localDate: question.localDate,
        kind: 'check_in_answer',
        summary: answer.value ?? '',
        sourceReferences: [
          ...question.sourceReferences.map((r) => ({ ...r, subjectUserId: userId })),
          {
            kind: 'check_in_answer' as const,
            id: answer.id,
            subjectUserId: userId,
            revisionId: answer.currentRevisionId,
          },
        ],
      })),
    ...flares.map((f) => ({
      id: f.id,
      localDate: f.localDate,
      kind: 'observation',
      summary: f.observation,
      sourceReferences: [
        {
          kind: 'observation' as const,
          id: f.id,
          subjectUserId: userId,
          revisionId: readCurrentSourceRevision(sqlite, userId, 'observation', f.id) ?? '',
        },
      ],
    })),
  ]
    .sort(
      (a, b) =>
        a.localDate.localeCompare(b.localDate) ||
        a.kind.localeCompare(b.kind) ||
        a.id.localeCompare(b.id),
    )
    .map(({ id, localDate, summary, sourceReferences }) => ({
      id,
      localDate,
      summary,
      sourceReferences,
    }));
  const logs = db
    .select({ date: nutritionLogs.date })
    .from(nutritionLogs)
    .where(
      and(
        eq(nutritionLogs.userId, userId),
        gte(nutritionLogs.date, start),
        lte(nutritionLogs.date, end),
      ),
    )
    .all();
  const workouts = db
    .select({ date: workoutSessions.date })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.date, start),
        lte(workoutSessions.date, end),
        isNull(workoutSessions.deletedAt),
        inArray(workoutSessions.status, ['in-progress', 'paused', 'completed']),
      ),
    )
    .all();
  const gaps = dates.flatMap((date) => [
    ...(!journals.some((j) => j.localDate === date) &&
    !answers.some(
      ({ answer, question }) => question.localDate === date && answer.state === 'answered',
    )
      ? [`${date}: no journal observation or answered check-in`]
      : []),
    ...answers
      .filter(({ answer, question }) => question.localDate === date && answer.state !== 'answered')
      .map(({ answer }) => `${date}: check-in answer ${answer.id} is ${answer.state}`),
    ...(!logs.some((log) => log.date === date) ? [`${date}: nutrition missing`] : []),
    ...(!workouts.some((workout) => workout.date === date) ? [`${date}: workout missing`] : []),
  ]);
  return weeklyReflectionReadModelSchema.parse({
    contractVersion: 'activity-journal-v1',
    subjectUserId: userId,
    startLocalDate: start,
    endLocalDate: end,
    timeZone: zone.timeZone,
    facts,
    gaps,
    generatedAt: now(),
  });
};
