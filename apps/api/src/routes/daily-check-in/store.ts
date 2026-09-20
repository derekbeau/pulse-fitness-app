import { createHash, randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import type {
  ActivityJournalActor,
  CheckInAnswerRevision,
  CheckInQuestionRevision,
  DailyCheckInAnswerAuditRevision,
  DailyCheckInSourceKind,
  DailyCheckInSourceReference,
  Provenance,
} from '@pulse/shared';
import type {
  AnswerDailyCheckInQuestionApiInput,
  CorrectDailyCheckInAnswerApiInput,
  CreateDailyCheckInQuestionApiInput,
} from '@pulse/shared';
import { dailyContextRuntimeResponseSchema } from '@pulse/shared';

import { getApplicationNow } from '../../lib/clock.js';
import {
  getUserLocalDate,
  resolveUserTimeZoneForUser,
  UserTimeZoneRequiredError,
} from '../../lib/user-time-zone.js';

export type DailyCheckInActor = ActivityJournalActor;
type Result<T> = { data: T; replayed: boolean; statusCode: number };
type Reference = Omit<DailyCheckInSourceReference, 'subjectUserId'>;
type SqlRow = Record<string, unknown>;
const now = () => getApplicationNow().toISOString();
const json = <T>(value: string) => JSON.parse(value) as T;
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
  sqlite
    .prepare(`select * from daily_check_in_questions where id=? and user_id=?`)
    .get(id, userId) as SqlRow | undefined;
const string = (row: SqlRow, field: string) => {
  const value = row[field];
  if (typeof value !== 'string') throw new Error(`Invalid daily check-in row ${field}`);
  return value;
};
const integer = (row: SqlRow, field: string) => {
  const value = row[field];
  if (typeof value !== 'number') throw new Error(`Invalid daily check-in row ${field}`);
  return value;
};
const sourceFingerprint = (kind: DailyCheckInSourceKind, value: unknown) =>
  `sha256:${hash({ kind, value })}`;
const directRevision = (
  sqlite: Database.Database,
  table: string,
  userId: string,
  id: string,
): string | null => {
  const row = sqlite
    .prepare(`select current_revision_id from ${table} where id=? and user_id=?`)
    .get(id, userId) as SqlRow | undefined;
  return row ? string(row, 'current_revision_id') : null;
};
const fingerprintRows = (rows: SqlRow[]) => rows.map((row) => stable(row));
const currentSourceRevision = (
  sqlite: Database.Database,
  userId: string,
  kind: DailyCheckInSourceKind,
  id: string,
): string | null => {
  if (kind === 'activity') return directRevision(sqlite, 'canonical_activities', userId, id);
  if (kind === 'activity_assignment')
    return directRevision(sqlite, 'activity_assignments', userId, id);
  if (kind === 'activity_execution')
    return directRevision(sqlite, 'activity_executions', userId, id);
  if (kind === 'body_concern') return directRevision(sqlite, 'body_context_concerns', userId, id);
  if (kind === 'capability') return directRevision(sqlite, 'body_context_capabilities', userId, id);
  if (kind === 'guidance') return directRevision(sqlite, 'body_context_guidance', userId, id);
  if (kind === 'proposal') return directRevision(sqlite, 'plan_change_proposals', userId, id);
  if (kind === 'check_in_question')
    return directRevision(sqlite, 'daily_check_in_questions', userId, id);
  if (kind === 'check_in_answer')
    return directRevision(sqlite, 'daily_check_in_answers', userId, id);
  if (kind === 'activity_recurrence_revision') {
    const row = sqlite
      .prepare('select id from activity_recurrence_revisions where id=? and user_id=?')
      .get(id, userId) as SqlRow | undefined;
    return row ? string(row, 'id') : null;
  }
  if (kind === 'activity_goal') {
    const row = sqlite
      .prepare(
        'select id,kind,label,state,revision,created_at,updated_at from activity_goals where id=? and user_id=?',
      )
      .get(id, userId) as SqlRow | undefined;
    return row ? sourceFingerprint(kind, row) : null;
  }
  if (kind === 'observation') {
    const row = sqlite
      .prepare(
        'select id,concern_id,observation,occurred_at,local_date,time_zone,source_json,created_at from body_context_flares where id=? and user_id=?',
      )
      .get(id, userId) as SqlRow | undefined;
    return row ? sourceFingerprint(kind, row) : null;
  }
  if (kind === 'workout_session') {
    const row = sqlite
      .prepare('select * from workout_sessions where id=? and user_id=? and deleted_at is null')
      .get(id, userId) as SqlRow | undefined;
    if (!row) return null;
    const sets = sqlite
      .prepare(
        'select * from session_sets where session_id=? order by order_index,section,set_number,id',
      )
      .all(id) as SqlRow[];
    return sourceFingerprint(kind, { row: stable(row), sets: fingerprintRows(sets) });
  }
  if (kind === 'scheduled_workout') {
    const row = sqlite
      .prepare('select * from scheduled_workouts where id=? and user_id=?')
      .get(id, userId) as SqlRow | undefined;
    if (!row) return null;
    const exercises = sqlite
      .prepare(
        'select * from scheduled_workout_exercises where scheduled_workout_id=? order by order_index,section,id',
      )
      .all(id) as SqlRow[];
    const sets = sqlite
      .prepare(
        'select ss.* from scheduled_workout_exercise_sets ss join scheduled_workout_exercises se on se.id=ss.scheduled_workout_exercise_id where se.scheduled_workout_id=? order by se.order_index,ss.set_number,ss.id',
      )
      .all(id) as SqlRow[];
    return sourceFingerprint(kind, {
      row: stable(row),
      exercises: fingerprintRows(exercises),
      sets: fingerprintRows(sets),
    });
  }
  if (kind === 'nutrition_log') {
    const row = sqlite
      .prepare('select * from nutrition_logs where id=? and user_id=?')
      .get(id, userId) as SqlRow | undefined;
    if (!row) return null;
    const meals = sqlite
      .prepare('select * from meals where nutrition_log_id=? order by created_at,id')
      .all(id) as SqlRow[];
    const items = sqlite
      .prepare(
        'select i.* from meal_items i join meals m on m.id=i.meal_id where m.nutrition_log_id=? order by m.created_at,i.created_at,i.id',
      )
      .all(id) as SqlRow[];
    return sourceFingerprint(kind, {
      row: stable(row),
      meals: fingerprintRows(meals),
      items: fingerprintRows(items),
    });
  }
  const meal = sqlite
    .prepare(
      'select m.* from meals m join nutrition_logs n on n.id=m.nutrition_log_id where m.id=? and n.user_id=?',
    )
    .get(id, userId) as SqlRow | undefined;
  if (!meal) return null;
  const items = sqlite
    .prepare('select * from meal_items where meal_id=? order by created_at,id')
    .all(id) as SqlRow[];
  return sourceFingerprint(kind, { row: stable(meal), items: fingerprintRows(items) });
};
const validateReferences = (
  sqlite: Database.Database,
  userId: string,
  refs: Reference[],
): Reference[] =>
  refs.map((ref) => {
    const currentRevisionId = currentSourceRevision(sqlite, userId, ref.kind, ref.id);
    if (currentRevisionId === null || ref.revisionId !== currentRevisionId)
      throw new CheckInOwnedLinkNotFoundError();
    return { ...ref, revisionId: currentRevisionId };
  });
const sourceReference = (
  sqlite: Database.Database,
  userId: string,
  kind: DailyCheckInSourceKind,
  id: string,
): DailyCheckInSourceReference => {
  const revisionId = currentSourceRevision(sqlite, userId, kind, id);
  if (revisionId === null) throw new CheckInOwnedLinkNotFoundError();
  return { kind, id, subjectUserId: userId, revisionId };
};
const questionRevision = (
  row: SqlRow,
  priorRevisionId: string | null = null,
): CheckInQuestionRevision => ({
  id: string(row, 'current_revision_id'),
  questionId: string(row, 'id'),
  subjectUserId: string(row, 'user_id'),
  revision: integer(row, 'revision'),
  priorRevisionId,
  deduplicationKey: string(row, 'deduplication_key'),
  prompt: string(row, 'prompt'),
  state: string(row, 'state') as CheckInQuestionRevision['state'],
  sourceReferences: json<Reference[]>(string(row, 'source_references_json')).map((r) => ({
    ...r,
    subjectUserId: string(row, 'user_id'),
  })) as CheckInQuestionRevision['sourceReferences'],
  createdAt: string(row, 'created_at'),
});
const actorJson = (actor: DailyCheckInActor) => JSON.stringify(actor);
const provenance = (
  source: Omit<Provenance, 'capturedAt' | 'capturedBy'>,
  actor: DailyCheckInActor,
): Provenance => ({ ...source, capturedAt: now(), capturedBy: actor });

const idempotent = async <T>(args: {
  userId: string;
  actor: DailyCheckInActor;
  route: string;
  operation: string;
  key: string;
  payload: unknown;
  statusCode: number;
  write: (sqlite: Database.Database) => T;
}): Promise<Result<T>> => {
  const sqlite = await getSqlite();
  const requestFingerprint = hash(args.payload);
  return sqlite
    .transaction(() => {
      const prior = sqlite
        .prepare(
          'select request_fingerprint,response_json,status_code from daily_check_in_idempotency_receipts where user_id=? and route=? and operation=? and idempotency_key=?',
        )
        .get(args.userId, args.route, args.operation, args.key) as SqlRow | undefined;
      if (prior) {
        if (string(prior, 'request_fingerprint') !== requestFingerprint)
          throw new CheckInIdempotencyConflictError();
        return {
          data: json<T>(string(prior, 'response_json')),
          replayed: true,
          statusCode: integer(prior, 'status_code'),
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
      const references = validateReferences(sqlite, userId, input.sourceReferences);
      const parent = input.followUpQuestionId
        ? question(sqlite, userId, input.followUpQuestionId)
        : null;
      if (input.followUpQuestionId && !parent) throw new CheckInOwnedLinkNotFoundError();
      if (parent && string(parent, 'state') !== 'answered')
        throw new CheckInFollowUpParentStateError();
      if (
        parent &&
        !json<Reference[]>(string(parent, 'source_references_json')).every((p) =>
          references.some((r) => r.kind === p.kind && r.id === p.id),
        )
      )
        throw new CheckInOwnedLinkNotFoundError();
      const deduplicationKey = hash({
        localDate: input.localDate,
        timeZone: resolved.timeZone,
        semanticTopic: input.semanticTopic.trim().toLocaleLowerCase(),
        sourceReferences: [...references]
          .map((x: Reference) => `${x.kind}:${x.id}:${x.revisionId ?? ''}`)
          .sort(),
        followUpQuestionId: input.followUpQuestionId,
      });
      const existing = sqlite
        .prepare('select * from daily_check_in_questions where user_id=? and deduplication_key=?')
        .get(userId, deduplicationKey) as SqlRow | undefined;
      if (existing) return detail(sqlite, userId, string(existing, 'id'));
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

const answerRevision = (row: SqlRow): DailyCheckInAnswerAuditRevision => ({
  id: string(row, 'id'),
  answerId: string(row, 'answer_id'),
  questionId: string(row, 'question_id'),
  questionRevisionId: string(row, 'question_revision_id'),
  subjectUserId: string(row, 'user_id'),
  revision: integer(row, 'revision'),
  priorRevisionId: nullable(row, 'prior_revision_id'),
  state: string(row, 'state') as CheckInAnswerRevision['state'],
  ...(nullable(row, 'value') === null ? {} : { value: string(row, 'value') }),
  source: json<Provenance>(string(row, 'source_json')),
  answeredAt: string(row, 'answered_at'),
  correctionReason: nullable(row, 'reason'),
  recordedBy: json<ActivityJournalActor>(string(row, 'actor_json')),
});
const nullable = (row: SqlRow, field: string): string | null => {
  const value = row[field];
  if (value === null) return null;
  return string(row, field);
};
const nullableNumber = (row: SqlRow, field: string): number | null => {
  const value = row[field];
  if (value === null) return null;
  return integer(row, field);
};
const instantOrNull = (row: SqlRow, field: string): string | null => {
  const value = row[field];
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return new Date(value).toISOString();
  throw new Error(`Invalid daily check-in row ${field}`);
};
const detail = (sqlite: Database.Database, userId: string, id: string) => {
  const q = question(sqlite, userId, id);
  if (!q) throw new CheckInNotFoundError();
  const questionHistory = (
    sqlite
      .prepare(
        'select snapshot_json,actor_json from daily_check_in_question_revisions where question_id=? and user_id=? order by revision',
      )
      .all(id, userId) as SqlRow[]
  ).map((row) => ({
    revision: json<CheckInQuestionRevision>(string(row, 'snapshot_json')),
    recordedBy: json<ActivityJournalActor>(string(row, 'actor_json')),
  }));
  const currentQuestion = questionHistory.at(-1)?.revision;
  if (!currentQuestion) throw new Error('Current check-in question revision was unavailable.');
  const a = sqlite
    .prepare('select * from daily_check_in_answers where question_id=? and user_id=?')
    .get(id, userId) as SqlRow | undefined;
  const history = a
    ? (
        sqlite
          .prepare(
            'select id,answer_id,question_id,question_revision_id,user_id,revision,prior_revision_id,state,value,source_json,answered_at,reason,actor_json from daily_check_in_answer_revisions where answer_id=? and user_id=? order by revision',
          )
          .all(string(a, 'id'), userId) as SqlRow[]
      ).map(answerRevision)
    : [];
  return {
    question: currentQuestion,
    questionHistory,
    currentAnswer: history.at(-1) ?? null,
    answerHistory: history,
    followUpQuestionId: nullable(q, 'follow_up_question_id'),
  };
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
  if (string(q, 'current_revision_id') !== input.expectedQuestionRevisionId)
    throw new CheckInStaleQuestionError(
      string(q, 'current_revision_id'),
      input.expectedQuestionRevisionId,
    );
  const existing = sqlite
    .prepare('select * from daily_check_in_answers where question_id=? and user_id=?')
    .get(questionId, userId) as SqlRow | undefined;
  const current = existing ? integer(existing, 'revision') : 0;
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
  let questionRevisionId = string(q, 'current_revision_id');
  if (!existing) {
    answerId = randomUUID();
    const priorQuestionRevisionId = questionRevisionId;
    questionRevisionId = randomUUID();
    sqlite
      .prepare(
        "update daily_check_in_questions set state='answered',revision=?,current_revision_id=?,updated_at=? where id=? and user_id=? and revision=?",
      )
      .run(
        integer(q, 'revision') + 1,
        questionRevisionId,
        at,
        questionId,
        userId,
        integer(q, 'revision'),
      );
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
        integer(answeredQuestion, 'revision'),
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
    answerId = string(existing, 'id');
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
      existing ? string(existing, 'current_revision_id') : null,
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
      const a = s
        .prepare('select question_id from daily_check_in_answers where id=? and user_id=?')
        .get(id, userId) as SqlRow | undefined;
      if (!a) throw new CheckInNotFoundError();
      return writeAnswer(s, userId, actor, string(a, 'question_id'), input, true);
    },
  });

export const readDailyContext = async (userId: string, date?: string) => {
  const sqlite = await getSqlite();
  const resolved = await resolveUserTimeZoneForUser(userId);
  if (!resolved) throw new UserTimeZoneRequiredError();
  const localDate = date ?? (await getUserLocalDate(userId));
  const qrows = sqlite
    .prepare(
      'select * from daily_check_in_questions where user_id=? and local_date=? order by created_at limit 200',
    )
    .all(userId, localDate) as SqlRow[];
  const pending = qrows
    .filter((q) => string(q, 'state') === 'pending')
    .map((q) => questionRevision(q));
  const answers = qrows
    .map((q) => detail(sqlite, userId, string(q, 'id')).currentAnswer)
    .filter((answer): answer is DailyCheckInAnswerAuditRevision => answer !== null);
  const assignments = (
    sqlite
      .prepare(
        'select a.id,a.user_id,a.activity_id,a.planned_local_date,a.time_zone,a.recurrence_revision_id,a.state,a.created_at,a.updated_at,a.revision,a.current_revision_id,ar.prior_revision_id from activity_assignments a join activity_assignment_revisions ar on ar.id=a.current_revision_id and ar.user_id=a.user_id where a.user_id=? and a.planned_local_date=? order by a.created_at,a.id limit 200',
      )
      .all(userId, localDate) as SqlRow[]
  ).map((r) => ({
    id: string(r, 'id'),
    subjectUserId: string(r, 'user_id'),
    activityId: string(r, 'activity_id'),
    plannedLocalDate: string(r, 'planned_local_date'),
    timeZone: string(r, 'time_zone'),
    recurrenceRevisionId: nullable(r, 'recurrence_revision_id'),
    priorAssignmentRevisionId: nullable(r, 'prior_revision_id'),
    revision: integer(r, 'revision'),
    state: string(r, 'state') as 'planned' | 'completed' | 'skipped' | 'cancelled',
    createdAt: string(r, 'created_at'),
    updatedAt: string(r, 'updated_at'),
  }));
  const executions = (
    sqlite
      .prepare(
        'select id,user_id,activity_id,assignment_id,actual_occurred_at,actual_local_date,time_zone,duration_minutes,outcome,structured_workout_session_id,source_json,current_revision_id,created_at from activity_executions where user_id=? and actual_local_date=? order by created_at,id limit 200',
      )
      .all(userId, localDate) as SqlRow[]
  ).map((r) => ({
    id: string(r, 'id'),
    subjectUserId: string(r, 'user_id'),
    activityId: string(r, 'activity_id'),
    assignmentId: nullable(r, 'assignment_id'),
    actualOccurredAt: string(r, 'actual_occurred_at'),
    actualLocalDate: string(r, 'actual_local_date'),
    timeZone: string(r, 'time_zone'),
    durationMinutes: nullableNumber(r, 'duration_minutes'),
    outcome: string(r, 'outcome') as 'completed' | 'partial' | 'skipped' | 'unknown',
    structuredWorkoutSessionId: nullable(r, 'structured_workout_session_id'),
    source: json<Provenance>(string(r, 'source_json')),
    createdAt: string(r, 'created_at'),
  }));
  const activities = (
    sqlite
      .prepare(
        `select a.* from canonical_activities a
         where a.user_id=? and a.id in (
           select activity_id from activity_assignments where user_id=? and planned_local_date=?
           union
           select activity_id from activity_executions where user_id=? and actual_local_date=?
         )
         order by a.created_at,a.id limit 200`,
      )
      .all(userId, userId, localDate, userId, localDate) as SqlRow[]
  ).map((row) => {
    const activityId = string(row, 'id');
    const goalIds = (
      sqlite
        .prepare(
          'select goal_id from activity_goal_links where activity_id=? and user_id=? order by goal_id limit 20',
        )
        .all(activityId, userId) as SqlRow[]
    ).map((goal) => string(goal, 'goal_id'));
    return {
      id: activityId,
      subjectUserId: string(row, 'user_id'),
      kind: string(row, 'kind'),
      name: string(row, 'name'),
      source: json<Provenance>(string(row, 'source_json')),
      actor: json<ActivityJournalActor>(string(row, 'actor_json')),
      revision: integer(row, 'revision'),
      currentRevisionId: string(row, 'current_revision_id'),
      goalIds,
      assignmentIds: assignments
        .filter((assignment) => assignment.activityId === activityId)
        .map((assignment) => assignment.id),
      executionIds: executions
        .filter((execution) => execution.activityId === activityId)
        .map((execution) => execution.id),
      structuredWorkoutSessionId: nullable(row, 'structured_workout_session_id'),
      createdAt: string(row, 'created_at'),
      updatedAt: string(row, 'updated_at'),
      sourceReference: sourceReference(sqlite, userId, 'activity', activityId),
    };
  });
  const concerns = (
    sqlite
      .prepare(
        "select * from body_context_concerns where user_id=? and management_state!='archived' order by created_at,id limit 200",
      )
      .all(userId) as SqlRow[]
  ).map((r) => ({
    id: string(r, 'id'),
    subjectUserId: string(r, 'user_id'),
    label: string(r, 'label'),
    bodyRegion: nullable(r, 'body_region'),
    symptomState: string(r, 'symptom_state') as 'affirmed' | 'denied' | 'unknown' | 'not_asked',
    managementState: string(r, 'management_state') as
      | 'active'
      | 'monitoring'
      | 'maintenance'
      | 'resolved'
      | 'archived',
    source: json<Provenance>(string(r, 'source_json')),
    currentRevisionId: string(r, 'current_revision_id'),
    createdAt: string(r, 'created_at'),
    updatedAt: string(r, 'updated_at'),
  }));
  const capabilities = (
    sqlite
      .prepare(
        'select * from body_context_capabilities where user_id=? order by updated_at,id limit 200',
      )
      .all(userId) as SqlRow[]
  ).map((r) => ({
    id: string(r, 'id'),
    subjectUserId: string(r, 'user_id'),
    label: string(r, 'label'),
    state: string(r, 'state') as 'developing' | 'stable' | 'limited' | 'unknown',
    source: json<Provenance>(string(r, 'source_json')),
    currentRevisionId: string(r, 'current_revision_id'),
    updatedAt: string(r, 'updated_at'),
  }));
  const guidance = (
    sqlite
      .prepare(
        "select * from body_context_guidance where user_id=? and state='current' order by created_at,id limit 200",
      )
      .all(userId) as SqlRow[]
  ).map((r) => ({
    id: string(r, 'id'),
    subjectUserId: string(r, 'user_id'),
    concernId: nullable(r, 'concern_id'),
    capabilityId: nullable(r, 'capability_id'),
    text: string(r, 'text'),
    source: json<Provenance>(string(r, 'source_json')),
    state: 'current' as const,
    currentRevisionId: string(r, 'current_revision_id'),
    createdAt: string(r, 'created_at'),
  }));
  const observations = (
    sqlite
      .prepare(
        'select f.*, c.current_revision_id from body_context_flares f join body_context_concerns c on c.id=f.concern_id and c.user_id=f.user_id where f.user_id=? and f.local_date=? order by f.occurred_at,f.id limit 200',
      )
      .all(userId, localDate) as SqlRow[]
  ).map((r) => ({
    id: string(r, 'id'),
    subjectUserId: string(r, 'user_id'),
    category: 'injury' as const,
    text: string(r, 'observation'),
    finding: 'affirmed' as const,
    occurredAt: string(r, 'occurred_at'),
    localDate: string(r, 'local_date'),
    timeZone: string(r, 'time_zone'),
    source: json<Provenance>(string(r, 'source_json')),
    concernIds: [string(r, 'concern_id')],
    capabilityIds: [],
    activityExecutionIds: [],
    workoutSessionIds: [],
    currentRevisionId: sourceReference(sqlite, userId, 'observation', string(r, 'id')).revisionId,
  }));
  const sessions = sqlite
    .prepare(
      `select * from workout_sessions ws
       where ws.user_id=? and ws.deleted_at is null and ws.status!='cancelled' and (
         ws.date=? or
         ws.id in (select session_id from scheduled_workouts where user_id=? and date=? and session_id is not null) or
         ws.scheduled_workout_id in (select id from scheduled_workouts where user_id=? and date=?)
       )
       order by ws.started_at,ws.id limit 200`,
    )
    .all(userId, localDate, userId, localDate, userId, localDate) as SqlRow[];
  const planned = sqlite
    .prepare(
      `select s.*,t.name from scheduled_workouts s
       left join workout_templates t on t.id=s.template_id and t.user_id=s.user_id
       where s.user_id=? and s.date=? and s.session_id is null
         and not exists (
           select 1 from workout_sessions ws
           where ws.user_id=s.user_id and ws.scheduled_workout_id=s.id and ws.deleted_at is null
         )
       order by s.created_at,s.id limit 200`,
    )
    .all(userId, localDate) as SqlRow[];
  const nutritionRow = sqlite
    .prepare('select * from nutrition_logs where user_id=? and date=?')
    .get(userId, localDate) as SqlRow | undefined;
  const meals = nutritionRow
    ? (sqlite
        .prepare('select * from meals where nutrition_log_id=? order by created_at,id limit 200')
        .all(string(nutritionRow, 'id')) as SqlRow[])
    : [];
  const totals = nutritionRow
    ? (sqlite
        .prepare(
          'select coalesce(sum(calories),0) calories,coalesce(sum(protein),0) protein,coalesce(sum(carbs),0) carbs,coalesce(sum(fat),0) fat from meal_items where meal_id in (select id from meals where nutrition_log_id=?)',
        )
        .get(string(nutritionRow, 'id')) as SqlRow)
    : null;
  if (nutritionRow && !totals)
    throw new Error('Nutrition totals were unavailable for an existing log.');
  const nutrition =
    nutritionRow && totals
      ? {
          status: string(nutritionRow, 'status'),
          meals: meals.map((m) => ({
            id: string(m, 'id'),
            name: string(m, 'name'),
            summary: nullable(m, 'summary'),
            time: nullable(m, 'time'),
            sourceReference: sourceReference(sqlite, userId, 'meal', string(m, 'id')),
          })),
          totals: {
            calories: integer(totals, 'calories'),
            protein: integer(totals, 'protein'),
            carbs: integer(totals, 'carbs'),
            fat: integer(totals, 'fat'),
          },
          sourceReference: sourceReference(
            sqlite,
            userId,
            'nutrition_log',
            string(nutritionRow, 'id'),
          ),
        }
      : null;
  const sessionWorkouts = sessions.map((session) => {
    const sessionId = string(session, 'id');
    const scheduled = sqlite
      .prepare(
        `select * from scheduled_workouts
         where user_id=? and (id=? or session_id=?)
         order by case when id=? then 0 else 1 end,created_at limit 1`,
      )
      .get(
        userId,
        nullable(session, 'scheduled_workout_id'),
        sessionId,
        nullable(session, 'scheduled_workout_id'),
      ) as SqlRow | undefined;
    const status = string(session, 'status') as
      | 'scheduled'
      | 'in-progress'
      | 'paused'
      | 'completed';
    const kind =
      status === 'completed'
        ? ('completed' as const)
        : status === 'paused'
          ? ('paused' as const)
          : status === 'scheduled'
            ? ('planned' as const)
            : ('in_progress' as const);
    return {
      id: sessionId,
      kind,
      plannedLocalDate: scheduled ? string(scheduled, 'date') : null,
      actualLocalDate: string(session, 'date'),
      name: string(session, 'name'),
      status,
      scheduledWorkoutId: scheduled ? string(scheduled, 'id') : null,
      workoutSessionId: sessionId,
      sourceReference: sourceReference(sqlite, userId, 'workout_session', sessionId),
      sourceTime: instantOrNull(session, 'completed_at') ?? instantOrNull(session, 'started_at'),
    };
  });
  const plannedWorkouts = planned.map((scheduled) => ({
    id: string(scheduled, 'id'),
    kind: 'planned' as const,
    plannedLocalDate: string(scheduled, 'date'),
    actualLocalDate: null,
    name: nullable(scheduled, 'name') ?? 'Scheduled workout',
    status: 'scheduled' as const,
    scheduledWorkoutId: string(scheduled, 'id'),
    workoutSessionId: null,
    sourceReference: sourceReference(sqlite, userId, 'scheduled_workout', string(scheduled, 'id')),
    sourceTime: instantOrNull(scheduled, 'created_at'),
  }));
  const sourceReferences = [
    ...pending.map((item) => sourceReference(sqlite, userId, 'check_in_question', item.questionId)),
    ...answers.map((item) => sourceReference(sqlite, userId, 'check_in_answer', item.answerId)),
    ...activities.map((item) => item.sourceReference),
    ...activities.flatMap((item) =>
      item.goalIds.map((goalId) => sourceReference(sqlite, userId, 'activity_goal', goalId)),
    ),
    ...assignments.map((item) => sourceReference(sqlite, userId, 'activity_assignment', item.id)),
    ...assignments.flatMap((item) =>
      item.recurrenceRevisionId
        ? [
            sourceReference(
              sqlite,
              userId,
              'activity_recurrence_revision',
              item.recurrenceRevisionId,
            ),
          ]
        : [],
    ),
    ...executions.map((item) => sourceReference(sqlite, userId, 'activity_execution', item.id)),
    ...concerns.map((item) => sourceReference(sqlite, userId, 'body_concern', item.id)),
    ...capabilities.map((item) => sourceReference(sqlite, userId, 'capability', item.id)),
    ...guidance.map((item) => sourceReference(sqlite, userId, 'guidance', item.id)),
    ...observations.map((item) => sourceReference(sqlite, userId, 'observation', item.id)),
    ...plannedWorkouts.map((item) => item.sourceReference),
    ...sessionWorkouts.map((item) => item.sourceReference),
    ...(nutrition
      ? [nutrition.sourceReference, ...nutrition.meals.map((meal) => meal.sourceReference)]
      : []),
  ]
    .filter(
      (reference, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.kind === reference.kind &&
            candidate.id === reference.id &&
            candidate.revisionId === reference.revisionId,
        ) === index,
    )
    .slice(0, 1000);
  return dailyContextRuntimeResponseSchema.parse({
    contractVersion: 'activity-journal-v1',
    subjectUserId: userId,
    localDate,
    timeZone: resolved.timeZone,
    pendingQuestions: pending,
    currentAnswers: answers,
    observations,
    assignments,
    executions,
    activities,
    concerns,
    capabilities,
    guidance,
    workoutSessionIds: sessionWorkouts.map((workout) => workout.workoutSessionId),
    nutritionLocalDate: localDate,
    generatedAt: now(),
    nutrition,
    workouts: [...plannedWorkouts, ...sessionWorkouts],
    sourceReferences,
  });
};
