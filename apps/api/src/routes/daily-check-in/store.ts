import { createHash, randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type {
  ActivityJournalActor,
  CheckInQuestionRevision,
  DailyCheckInAnswerAuditRevision,
  DailyCheckInDetail,
  DailyCheckInSourceReference,
  Provenance,
} from '@pulse/shared';
import {
  activityJournalActorSchema,
  checkInQuestionRevisionSchema,
  dailyCheckInAnswerAuditRevisionSchema,
  dailyCheckInDetailSchema,
} from '@pulse/shared';
import type {
  AnswerDailyCheckInQuestionApiInput,
  CorrectDailyCheckInAnswerApiInput,
  CreateDailyCheckInQuestionApiInput,
} from '@pulse/shared';
import { getApplicationNow } from '../../lib/clock.js';
import * as schema from '../../db/schema/index.js';
import {
  dailyCheckInAnswerRevisions,
  dailyCheckInAnswers,
  dailyCheckInIdempotencyReceipts,
  dailyCheckInQuestionRevisions,
  dailyCheckInQuestions,
} from '../../db/schema/index.js';
import {
  getUserLocalDate,
  resolveUserTimeZoneForUser,
  UserTimeZoneRequiredError,
} from '../../lib/user-time-zone.js';
import { buildDailyContextReadModel } from './read-model.js';
import { readCurrentSourceRevision } from './source-authority.js';

export type DailyCheckInActor = ActivityJournalActor;
type Result<T> = { data: T; replayed: boolean; statusCode: number };
type Reference = Omit<DailyCheckInSourceReference, 'subjectUserId'>;
const now = () => getApplicationNow().toISOString();
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, stable(v)]),
        )
      : value;
const hash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
const getSqlite = async () => (await import('../../db/index.js')).sqlite;
const checkInDb = (sqlite: Database.Database) => drizzle(sqlite, { schema });

export class CheckInNotFoundError extends Error {
  readonly code = 'CHECK_IN_NOT_FOUND';
}
export class CheckInOwnedLinkNotFoundError extends Error {
  readonly code = 'OWNED_LINK_NOT_FOUND';
}
export class CheckInStaleError extends Error {
  readonly code = 'STALE_REVISION';
  constructor(
    readonly currentRevision: number,
    readonly expectedRevision: number,
  ) {
    super('The check-in changed before this write was applied.');
  }
}
export class CheckInStaleQuestionError extends Error {
  readonly code = 'STALE_QUESTION_REVISION';
  constructor(
    readonly currentQuestionRevisionId: string,
    readonly expectedQuestionRevisionId: string,
  ) {
    super('The question changed before this answer was applied.');
  }
}
export class CheckInIdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSE';
}
export class CheckInFollowUpParentStateError extends Error {
  readonly code = 'FOLLOW_UP_PARENT_NOT_ANSWERED';
}

const question = (sqlite: Database.Database, userId: string, id: string) =>
  checkInDb(sqlite)
    .select()
    .from(dailyCheckInQuestions)
    .where(and(eq(dailyCheckInQuestions.id, id), eq(dailyCheckInQuestions.userId, userId)))
    .get();
const referenceIdentity = (reference: Reference) =>
  JSON.stringify([reference.kind, reference.id, reference.revisionId]);
const referenceHashToken = (reference: Reference) =>
  `${reference.kind}:${reference.id}:${reference.revisionId}`;
const validateAndNormalizeReferences = (
  sqlite: Database.Database,
  userId: string,
  refs: Reference[],
): Reference[] => {
  const validated = refs.map((ref) => {
    const currentRevisionId = readCurrentSourceRevision(sqlite, userId, ref.kind, ref.id);
    if (currentRevisionId === null || ref.revisionId !== currentRevisionId)
      throw new CheckInOwnedLinkNotFoundError();
    return { ...ref, revisionId: currentRevisionId };
  });
  return [
    ...new Map(validated.map((reference) => [referenceIdentity(reference), reference])).values(),
  ].sort(
    (left, right) =>
      referenceHashToken(left).localeCompare(referenceHashToken(right)) ||
      referenceIdentity(left).localeCompare(referenceIdentity(right)),
  );
};
const questionRevision = (
  row: typeof dailyCheckInQuestions.$inferSelect,
  priorRevisionId: string | null = null,
): CheckInQuestionRevision =>
  checkInQuestionRevisionSchema.parse({
    id: row.currentRevisionId,
    questionId: row.id,
    subjectUserId: row.userId,
    revision: row.revision,
    priorRevisionId,
    deduplicationKey: row.deduplicationKey,
    prompt: row.prompt,
    state: row.state,
    sourceReferences: row.sourceReferences.map((reference) => ({
      ...reference,
      subjectUserId: row.userId,
    })),
    createdAt: row.createdAt,
  });
const actorJson = (actor: DailyCheckInActor) => JSON.stringify(actor);
const provenance = (
  source: Omit<Provenance, 'capturedAt' | 'capturedBy'>,
  actor: DailyCheckInActor,
): Provenance => ({ ...source, capturedAt: now(), capturedBy: actor });

const idempotent = async (args: {
  userId: string;
  actor: DailyCheckInActor;
  route: string;
  operation: string;
  key: string;
  payload: unknown;
  statusCode: number;
  write: (sqlite: Database.Database) => DailyCheckInDetail;
}): Promise<Result<DailyCheckInDetail>> => {
  const sqlite = await getSqlite();
  const requestFingerprint = hash(args.payload);
  return sqlite
    .transaction(() => {
      const prior = checkInDb(sqlite)
        .select({
          requestFingerprint: dailyCheckInIdempotencyReceipts.requestFingerprint,
          response: dailyCheckInIdempotencyReceipts.response,
          statusCode: dailyCheckInIdempotencyReceipts.statusCode,
        })
        .from(dailyCheckInIdempotencyReceipts)
        .where(
          and(
            eq(dailyCheckInIdempotencyReceipts.userId, args.userId),
            eq(dailyCheckInIdempotencyReceipts.route, args.route),
            eq(dailyCheckInIdempotencyReceipts.operation, args.operation),
            eq(dailyCheckInIdempotencyReceipts.idempotencyKey, args.key),
          ),
        )
        .get();
      if (prior) {
        if (prior.requestFingerprint !== requestFingerprint)
          throw new CheckInIdempotencyConflictError();
        return {
          data: dailyCheckInDetailSchema.parse(prior.response),
          replayed: true,
          statusCode: prior.statusCode,
        };
      }
      const data = args.write(sqlite);
      sqlite
        .prepare(
          'insert into daily_check_in_idempotency_receipts (id,user_id,actor_kind,actor_id,route,operation,idempotency_key,request_fingerprint,status_code,response_json,created_at) values (?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          randomUUID(),
          args.userId,
          args.actor.kind,
          args.actor.id,
          args.route,
          args.operation,
          args.key,
          requestFingerprint,
          args.statusCode,
          JSON.stringify(data),
          now(),
        );
      return { data, replayed: false, statusCode: args.statusCode };
    })
    .immediate();
};

export const createQuestion = async (
  userId: string,
  actor: DailyCheckInActor,
  input: CreateDailyCheckInQuestionApiInput,
) => {
  const resolved = await resolveUserTimeZoneForUser(userId);
  if (!resolved) throw new UserTimeZoneRequiredError();
  return idempotent({
    userId,
    actor,
    route: '/check-in/questions',
    operation: 'create',
    key: input.idempotencyKey,
    payload: input,
    statusCode: 201,
    write(sqlite) {
      const references = validateAndNormalizeReferences(sqlite, userId, input.sourceReferences);
      const parent = input.followUpQuestionId
        ? question(sqlite, userId, input.followUpQuestionId)
        : null;
      if (input.followUpQuestionId && !parent) throw new CheckInOwnedLinkNotFoundError();
      if (parent && parent.state !== 'answered') throw new CheckInFollowUpParentStateError();
      if (
        parent &&
        !parent.sourceReferences.every((p) =>
          references.some((r) => r.kind === p.kind && r.id === p.id),
        )
      )
        throw new CheckInOwnedLinkNotFoundError();
      const deduplicationKey = hash({
        localDate: input.localDate,
        timeZone: resolved.timeZone,
        semanticTopic: input.semanticTopic.trim().toLocaleLowerCase(),
        sourceReferences: references.map(referenceHashToken),
        followUpQuestionId: input.followUpQuestionId,
      });
      const existing = checkInDb(sqlite)
        .select({ id: dailyCheckInQuestions.id })
        .from(dailyCheckInQuestions)
        .where(
          and(
            eq(dailyCheckInQuestions.userId, userId),
            eq(dailyCheckInQuestions.deduplicationKey, deduplicationKey),
          ),
        )
        .get();
      if (existing) return detail(sqlite, userId, existing.id);
      const id = randomUUID(),
        revisionId = randomUUID(),
        at = now();
      sqlite
        .prepare(
          'insert into daily_check_in_questions (id,user_id,local_date,time_zone,deduplication_key,semantic_topic,prompt,state,source_references_json,follow_up_question_id,revision,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          userId,
          input.localDate,
          resolved.timeZone,
          deduplicationKey,
          input.semanticTopic,
          input.prompt,
          'pending',
          JSON.stringify(references),
          input.followUpQuestionId,
          1,
          revisionId,
          at,
          at,
        );
      const row = question(sqlite, userId, id);
      if (!row) throw new Error('Created check-in question was not readable.');
      sqlite
        .prepare(
          'insert into daily_check_in_question_revisions (id,question_id,user_id,revision,prior_revision_id,snapshot_json,actor_json,created_at) values (?,?,?,?,?,?,?,?)',
        )
        .run(
          revisionId,
          id,
          userId,
          1,
          null,
          JSON.stringify(questionRevision(row)),
          actorJson(actor),
          at,
        );
      return detail(sqlite, userId, id);
    },
  });
};

const answerRevision = (
  row: typeof dailyCheckInAnswerRevisions.$inferSelect,
): DailyCheckInAnswerAuditRevision =>
  dailyCheckInAnswerAuditRevisionSchema.parse({
    id: row.id,
    answerId: row.answerId,
    questionId: row.questionId,
    questionRevisionId: row.questionRevisionId,
    subjectUserId: row.userId,
    revision: row.revision,
    priorRevisionId: row.priorRevisionId,
    state: row.state,
    ...(row.value === null ? {} : { value: row.value }),
    source: row.source,
    answeredAt: row.answeredAt,
    correctionReason: row.reason,
    recordedBy: row.actor,
  });
const detail = (sqlite: Database.Database, userId: string, id: string): DailyCheckInDetail => {
  const q = question(sqlite, userId, id);
  if (!q) throw new CheckInNotFoundError();
  const questionHistory = checkInDb(sqlite)
    .select({
      revision: dailyCheckInQuestionRevisions.snapshot,
      recordedBy: dailyCheckInQuestionRevisions.actor,
      recordedAt: dailyCheckInQuestionRevisions.createdAt,
    })
    .from(dailyCheckInQuestionRevisions)
    .where(
      and(
        eq(dailyCheckInQuestionRevisions.questionId, id),
        eq(dailyCheckInQuestionRevisions.userId, userId),
      ),
    )
    .orderBy(asc(dailyCheckInQuestionRevisions.revision))
    .all()
    .map(({ revision, recordedBy, recordedAt }) => ({
      revision: checkInQuestionRevisionSchema.parse(revision),
      recordedBy: activityJournalActorSchema.parse(recordedBy),
      recordedAt,
    }));
  const currentQuestion = questionHistory.at(-1)?.revision;
  if (!currentQuestion) throw new Error('Current check-in question revision was unavailable.');
  const a = checkInDb(sqlite)
    .select({ id: dailyCheckInAnswers.id })
    .from(dailyCheckInAnswers)
    .where(and(eq(dailyCheckInAnswers.questionId, id), eq(dailyCheckInAnswers.userId, userId)))
    .get();
  const history = a
    ? checkInDb(sqlite)
        .select()
        .from(dailyCheckInAnswerRevisions)
        .where(
          and(
            eq(dailyCheckInAnswerRevisions.answerId, a.id),
            eq(dailyCheckInAnswerRevisions.userId, userId),
          ),
        )
        .orderBy(asc(dailyCheckInAnswerRevisions.revision))
        .all()
        .map(answerRevision)
    : [];
  return dailyCheckInDetailSchema.parse({
    question: currentQuestion,
    questionHistory,
    currentAnswer: history.at(-1) ?? null,
    answerHistory: history,
    followUpQuestionId: q.followUpQuestionId,
  });
};
export const getQuestionDetail = async (userId: string, id: string) => {
  const sqlite = await getSqlite();
  return question(sqlite, userId, id) ? detail(sqlite, userId, id) : null;
};
const writeAnswer = (
  sqlite: Database.Database,
  userId: string,
  actor: DailyCheckInActor,
  questionId: string,
  input: AnswerDailyCheckInQuestionApiInput | CorrectDailyCheckInAnswerApiInput,
  isCorrection: boolean,
) => {
  const q = question(sqlite, userId, questionId);
  if (!q) throw new CheckInNotFoundError();
  if (q.currentRevisionId !== input.expectedQuestionRevisionId)
    throw new CheckInStaleQuestionError(q.currentRevisionId, input.expectedQuestionRevisionId);
  const existing = checkInDb(sqlite)
    .select()
    .from(dailyCheckInAnswers)
    .where(
      and(eq(dailyCheckInAnswers.questionId, questionId), eq(dailyCheckInAnswers.userId, userId)),
    )
    .get();
  const current = existing?.revision ?? 0;
  if (current !== input.expectedAnswerRevision)
    throw new CheckInStaleError(current, input.expectedAnswerRevision);
  if (
    (isCorrection && !existing) ||
    (!isCorrection && existing) ||
    (!isCorrection && input.expectedAnswerRevision !== 0)
  )
    throw new CheckInNotFoundError();
  const at = now(),
    source = provenance(input.source, actor),
    revisionId = randomUUID();
  let answerId: string;
  let questionRevisionId = q.currentRevisionId;
  if (!existing) {
    answerId = randomUUID();
    const priorQuestionRevisionId = questionRevisionId;
    questionRevisionId = randomUUID();
    sqlite
      .prepare(
        "update daily_check_in_questions set state='answered',revision=?,current_revision_id=?,updated_at=? where id=? and user_id=? and revision=?",
      )
      .run(q.revision + 1, questionRevisionId, at, questionId, userId, q.revision);
    const answeredQuestion = question(sqlite, userId, questionId);
    if (!answeredQuestion) throw new Error('Answered check-in question was not readable.');
    sqlite
      .prepare(
        'insert into daily_check_in_question_revisions (id,question_id,user_id,revision,prior_revision_id,snapshot_json,actor_json,created_at) values (?,?,?,?,?,?,?,?)',
      )
      .run(
        questionRevisionId,
        questionId,
        userId,
        answeredQuestion.revision,
        priorQuestionRevisionId,
        JSON.stringify(questionRevision(answeredQuestion, priorQuestionRevisionId)),
        actorJson(actor),
        at,
      );
    sqlite
      .prepare(
        'insert into daily_check_in_answers (id,question_id,user_id,state,value,source_json,answered_at,revision,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        answerId,
        questionId,
        userId,
        input.state,
        input.value ?? null,
        JSON.stringify(source),
        at,
        1,
        revisionId,
        at,
        at,
      );
  } else {
    answerId = existing.id;
    sqlite
      .prepare(
        'update daily_check_in_answers set state=?,value=?,source_json=?,answered_at=?,revision=?,current_revision_id=?,updated_at=? where id=? and user_id=? and revision=?',
      )
      .run(
        input.state,
        input.value ?? null,
        JSON.stringify(source),
        at,
        current + 1,
        revisionId,
        at,
        answerId,
        userId,
        current,
      );
  }
  sqlite
    .prepare(
      'insert into daily_check_in_answer_revisions (id,answer_id,question_id,question_revision_id,user_id,revision,prior_revision_id,state,value,source_json,answered_at,reason,actor_json,created_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      revisionId,
      answerId,
      questionId,
      questionRevisionId,
      userId,
      current + 1,
      existing?.currentRevisionId ?? null,
      input.state,
      input.value ?? null,
      JSON.stringify(source),
      at,
      isCorrection ? (input as CorrectDailyCheckInAnswerApiInput).reason : null,
      actorJson(actor),
      at,
    );
  return detail(sqlite, userId, questionId);
};
export const answerQuestion = async (
  userId: string,
  actor: DailyCheckInActor,
  id: string,
  input: AnswerDailyCheckInQuestionApiInput,
) =>
  idempotent({
    userId,
    actor,
    route: `/check-in/questions/${id}/answers`,
    operation: 'answer',
    key: input.idempotencyKey,
    payload: input,
    statusCode: 201,
    write: (s) => writeAnswer(s, userId, actor, id, input, false),
  });
export const correctAnswer = async (
  userId: string,
  actor: DailyCheckInActor,
  id: string,
  input: CorrectDailyCheckInAnswerApiInput,
) =>
  idempotent({
    userId,
    actor,
    route: `/check-in/answers/${id}/corrections`,
    operation: 'correct',
    key: input.idempotencyKey,
    payload: input,
    statusCode: 200,
    write(s) {
      const a = checkInDb(s)
        .select({ questionId: dailyCheckInAnswers.questionId })
        .from(dailyCheckInAnswers)
        .where(and(eq(dailyCheckInAnswers.id, id), eq(dailyCheckInAnswers.userId, userId)))
        .get();
      if (!a) throw new CheckInNotFoundError();
      return writeAnswer(s, userId, actor, a.questionId, input, true);
    },
  });

export const readDailyContext = async (userId: string, date?: string) => {
  const sqlite = await getSqlite();
  const resolved = await resolveUserTimeZoneForUser(userId);
  if (!resolved) throw new UserTimeZoneRequiredError();
  const localDate = date ?? (await getUserLocalDate(userId));
  const qrows = checkInDb(sqlite)
    .select()
    .from(dailyCheckInQuestions)
    .where(
      and(eq(dailyCheckInQuestions.userId, userId), eq(dailyCheckInQuestions.localDate, localDate)),
    )
    .orderBy(asc(dailyCheckInQuestions.createdAt))
    .limit(200)
    .all();
  const pendingQuestions = qrows
    .filter((row) => row.state === 'pending')
    .map((row) => questionRevision(row));
  const currentAnswers = qrows
    .map((row) => detail(sqlite, userId, row.id).currentAnswer)
    .filter((answer): answer is DailyCheckInAnswerAuditRevision => answer !== null);

  return buildDailyContextReadModel({
    sqlite,
    userId,
    localDate,
    timeZone: resolved.timeZone,
    pendingQuestions,
    currentAnswers,
    generatedAt: now(),
  });
};
