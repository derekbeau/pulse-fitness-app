import { createHash, randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import type {
  ActivityJournalActor,
  CheckInAnswerRevision,
  CheckInQuestionRevision,
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
type Reference = { kind: string; id: string; revisionId: string | null };
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

const ownedTables: Record<string, { table: string; revision?: string }> = {
  activity: { table: 'canonical_activities', revision: 'current_revision_id' },
  activity_assignment: { table: 'activity_assignments', revision: 'current_revision_id' },
  activity_execution: { table: 'activity_executions', revision: 'current_revision_id' },
  activity_goal: { table: 'activity_goals' },
  activity_recurrence_revision: { table: 'activity_recurrence_revisions' },
  workout_session: { table: 'workout_sessions' },
  scheduled_workout: { table: 'scheduled_workouts' },
  body_concern: { table: 'body_context_concerns', revision: 'current_revision_id' },
  capability: { table: 'body_context_capabilities', revision: 'current_revision_id' },
  guidance: { table: 'body_context_guidance', revision: 'current_revision_id' },
  proposal: { table: 'plan_change_proposals', revision: 'current_revision_id' },
  check_in_question: { table: 'daily_check_in_questions', revision: 'current_revision_id' },
  check_in_answer: { table: 'daily_check_in_answers', revision: 'current_revision_id' },
};
const validateReferences = (
  sqlite: Database.Database,
  userId: string,
  refs: Reference[],
): Reference[] => {
  const hydrated: Reference[] = [];
  for (const ref of refs) {
    const entry = ownedTables[ref.kind];
    if (!entry) throw new CheckInOwnedLinkNotFoundError();
    const row = sqlite
      .prepare(
        `select id${entry.revision ? `, ${entry.revision} as revisionId` : ''} from ${entry.table} where id=? and user_id=?`,
      )
      .get(ref.id, userId) as { id: string; revisionId?: string } | undefined;
    if (!row || (ref.revisionId !== null && entry.revision && row.revisionId !== ref.revisionId))
      throw new CheckInOwnedLinkNotFoundError();
    hydrated.push({ ...ref, revisionId: entry.revision ? (row.revisionId ?? null) : null });
  }
  return hydrated;
};
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
const questionRevision = (row: SqlRow): CheckInQuestionRevision => ({
  id: string(row, 'current_revision_id'),
  questionId: string(row, 'id'),
  subjectUserId: string(row, 'user_id'),
  revision: integer(row, 'revision'),
  priorRevisionId: null,
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
      const references = validateReferences(
        sqlite,
        userId,
        input.sourceReferences.map((reference) => ({
          ...reference,
          revisionId: reference.revisionId ?? null,
        })),
      );
      const parent = input.followUpQuestionId
        ? question(sqlite, userId, input.followUpQuestionId)
        : null;
      if (input.followUpQuestionId && !parent) throw new CheckInOwnedLinkNotFoundError();
      if (
        parent &&
        !json<Reference[]>(string(parent, 'source_references_json')).every((p) =>
          references.some(
            (r) => r.kind === p.kind && r.id === p.id && r.revisionId === p.revisionId,
          ),
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

const answerRevision = (row: SqlRow): CheckInAnswerRevision => ({
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
  const a = sqlite
    .prepare('select * from daily_check_in_answers where question_id=? and user_id=?')
    .get(id, userId) as SqlRow | undefined;
  const history = a
    ? (
        sqlite
          .prepare(
            'select id,answer_id,question_id,question_revision_id,user_id,revision,prior_revision_id,state,value,source_json,answered_at from daily_check_in_answer_revisions where answer_id=? and user_id=? order by revision',
          )
          .all(string(a, 'id'), userId) as SqlRow[]
      ).map(answerRevision)
    : [];
  return {
    question: questionRevision(q),
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
  if (!existing) {
    answerId = randomUUID();
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
    sqlite
      .prepare(
        "update daily_check_in_questions set state='answered',updated_at=? where id=? and user_id=? and state='pending'",
      )
      .run(at, questionId, userId);
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
      string(q, 'current_revision_id'),
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
      'select * from daily_check_in_questions where user_id=? and local_date=? order by created_at',
    )
    .all(userId, localDate) as SqlRow[];
  const pending = qrows.filter((q) => string(q, 'state') === 'pending').map(questionRevision);
  const answers = qrows
    .map((q) => detail(sqlite, userId, string(q, 'id')).currentAnswer)
    .filter((answer): answer is CheckInAnswerRevision => answer !== null);
  const assignments = (
    sqlite
      .prepare(
        'select a.id,a.user_id,a.activity_id,a.planned_local_date,a.time_zone,a.recurrence_revision_id,a.state,a.created_at,a.updated_at,a.revision,ar.prior_revision_id from activity_assignments a join activity_assignment_revisions ar on ar.id=a.current_revision_id and ar.user_id=a.user_id where a.user_id=? and a.planned_local_date=?',
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
        'select id,user_id,activity_id,assignment_id,actual_occurred_at,actual_local_date,time_zone,duration_minutes,outcome,structured_workout_session_id,source_json,created_at from activity_executions where user_id=? and actual_local_date=?',
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
  const concerns = (
    sqlite
      .prepare(
        "select * from body_context_concerns where user_id=? and management_state!='archived'",
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
      .prepare('select * from body_context_capabilities where user_id=?')
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
      .prepare("select * from body_context_guidance where user_id=? and state='current'")
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
        'select f.*, c.current_revision_id from body_context_flares f join body_context_concerns c on c.id=f.concern_id and c.user_id=f.user_id where f.user_id=? and f.local_date=?',
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
    currentRevisionId: string(r, 'current_revision_id'),
  }));
  const sessions = sqlite
    .prepare(
      'select id,name,date,status,completed_at,started_at from workout_sessions where user_id=? and date=? and deleted_at is null',
    )
    .all(userId, localDate) as SqlRow[];
  const planned = sqlite
    .prepare(
      'select s.id,s.date,t.name from scheduled_workouts s left join workout_templates t on t.id=s.template_id where s.user_id=? and s.date=?',
    )
    .all(userId, localDate) as SqlRow[];
  const nutritionRow = sqlite
    .prepare('select id,status from nutrition_logs where user_id=? and date=?')
    .get(userId, localDate) as SqlRow | undefined;
  const meals = nutritionRow
    ? (sqlite
        .prepare(
          'select id,name,summary,time from meals where nutrition_log_id=? order by created_at',
        )
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
          })),
          totals: {
            calories: integer(totals, 'calories'),
            protein: integer(totals, 'protein'),
            carbs: integer(totals, 'carbs'),
            fat: integer(totals, 'fat'),
          },
        }
      : null;
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
    concerns,
    capabilities,
    guidance,
    workoutSessionIds: sessions.map((s) => string(s, 'id')),
    nutritionLocalDate: localDate,
    generatedAt: now(),
    nutrition,
    workouts: [
      ...planned.map((s) => ({
        id: string(s, 'id'),
        kind: 'planned' as const,
        localDate: string(s, 'date'),
        name: nullable(s, 'name') ?? 'Scheduled workout',
        status: 'planned',
        sourceId: string(s, 'id'),
        sourceTime: null,
      })),
      ...sessions.map((s) => ({
        id: string(s, 'id'),
        kind: 'completed' as const,
        localDate: string(s, 'date'),
        name: string(s, 'name'),
        status: string(s, 'status'),
        sourceId: string(s, 'id'),
        sourceTime: instantOrNull(s, 'completed_at') ?? instantOrNull(s, 'started_at'),
      })),
    ],
  });
};
