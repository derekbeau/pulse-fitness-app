import { createHash, randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import {
  activityExecutionSchema,
  type ActivityAssignment,
  type ActivityDetail,
  type ActivityGoalRuntime,
  type ActivityJournalActor,
  type ActivityListQuery,
  type ActivityMaterializationResult,
  type CanonicalActivity,
  type CanonicalActivityDetail,
  type CorrectActivityApiInput,
  type CorrectActivityExecutionApiInput,
  type CreateActivityApiInput,
  type CreateActivityAssignmentApiInput,
  type CreateActivityGoalApiInput,
  type CreateActivityOwnedLinkApiInput,
  type CreateActivityRecurrenceApiInput,
  type LegacyActivityReadModel,
  type MaterializeActivityRecurrenceApiInput,
  type Provenance,
  type RecordActivityExecutionApiInput,
  type ReplaceActivityGoalLinksApiInput,
  type RescheduleActivityAssignmentApiInput,
  type ReviseActivityRecurrenceApiInput,
  type UpdateActivityGoalApiInput,
} from '@pulse/shared';

export type ActivityMutationActor = ActivityJournalActor;

type IdempotentResult<T> = { data: T; replayed: boolean; statusCode: number };

type CanonicalActivityRow = {
  actorJson: string;
  createdAt: string;
  currentRevisionId: string;
  id: string;
  kind: CanonicalActivity['kind'];
  name: string;
  revision: number;
  sourceJson: string;
  structuredWorkoutSessionId: string | null;
  updatedAt: string;
  userId: string;
};

type AssignmentRow = {
  activityId: string;
  createdAt: string;
  currentRevisionId: string;
  id: string;
  plannedLocalDate: string;
  recurrenceId: string | null;
  recurrenceRevisionId: string | null;
  revision: number;
  state: ActivityAssignment['state'];
  timeZone: string;
  updatedAt: string;
  userId: string;
};

type ExecutionRow = {
  actualLocalDate: string;
  actualOccurredAt: string;
  activityId: string;
  assignmentId: string | null;
  createdAt: string;
  currentRevisionId: string;
  durationMinutes: number | null;
  id: string;
  outcome: 'completed' | 'partial' | 'skipped' | 'unknown';
  revision: number;
  sourceJson: string;
  structuredWorkoutSessionId: string | null;
  timeZone: string;
  updatedAt: string;
  userId: string;
};

type RecurrenceRevisionRow = {
  actorJson: string;
  assignmentPolicy: 'unassigned_on_or_after_effective_date';
  createdAt: string;
  effectiveFromLocalDate: string;
  frequency: 'daily' | 'weekly' | 'specific_weekdays';
  id: string;
  interval: number;
  priorRevisionId: string | null;
  recurrenceId: string;
  sequence: number;
  timeZone: string;
  userId: string;
  weekdaysJson: string;
};

export class ActivityNotFoundError extends Error {
  readonly code = 'ACTIVITY_NOT_FOUND';
}

export class ActivityOwnedLinkNotFoundError extends Error {
  readonly code = 'OWNED_LINK_NOT_FOUND';
}

export class ActivityStaleRevisionError extends Error {
  readonly code = 'STALE_REVISION';
  constructor(
    readonly currentRevision: number,
    readonly expectedRevision: number,
  ) {
    super('The record changed before this write was applied.');
  }
}

export class ActivityStaleRecurrenceError extends Error {
  readonly code = 'STALE_REVISION';
  constructor(
    readonly currentRevisionId: string,
    readonly expectedRevisionId: string,
  ) {
    super('The recurrence changed before this revision was applied.');
  }
}

export class ActivityIdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSE';
  constructor(readonly key: string) {
    super('The idempotency key was already used with a different request.');
  }
}

export class ActivityExecutionConflictError extends Error {
  readonly code = 'ACTIVITY_ASSIGNMENT_ALREADY_EXECUTED';
  constructor() {
    super('The assignment already has an execution.');
  }
}

export class ActivityInvalidRangeError extends Error {
  readonly code = 'ACTIVITY_RANGE_INVALID';
}

const nowInstant = () => new Date().toISOString();

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

const requiredValue = <T>(value: T | null | undefined, message: string): T => {
  if (value === null || value === undefined) throw new Error(message);
  return value;
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
};

const fingerprint = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');

const withoutIdempotencyKey = <T extends { idempotencyKey: string }>(input: T) => {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== 'idempotencyKey'),
  ) as Omit<T, 'idempotencyKey'>;
};

const capturedProvenance = (
  source: Omit<Provenance, 'capturedBy'>,
  actor: ActivityMutationActor,
): Provenance => ({ ...source, capturedBy: actor });

const getSqlite = async () => (await import('../../db/index.js')).sqlite;

const executeIdempotent = async <T>({
  actor,
  idempotencyKey,
  operation,
  route,
  semanticPayload,
  statusCode,
  userId,
  write,
}: {
  actor: ActivityMutationActor;
  idempotencyKey: string;
  operation: string;
  route: string;
  semanticPayload: unknown;
  statusCode: number;
  userId: string;
  write: (sqlite: Database.Database) => T;
}): Promise<IdempotentResult<T>> => {
  const sqlite = await getSqlite();
  const requestFingerprint = fingerprint(semanticPayload);
  const transaction = sqlite.transaction(() => {
    const receipt = sqlite
      .prepare(
        `select request_fingerprint as requestFingerprint,
                status_code as statusCode,
                response_json as responseJson
           from activity_idempotency_receipts
          where user_id = ? and route = ? and operation = ? and idempotency_key = ?`,
      )
      .get(userId, route, operation, idempotencyKey) as
      | { requestFingerprint: string; responseJson: string; statusCode: number }
      | undefined;

    if (receipt) {
      if (receipt.requestFingerprint !== requestFingerprint) {
        throw new ActivityIdempotencyConflictError(idempotencyKey);
      }
      return {
        data: parseJson<T>(receipt.responseJson),
        replayed: true,
        statusCode: receipt.statusCode,
      };
    }

    const data = write(sqlite);
    sqlite
      .prepare(
        `insert into activity_idempotency_receipts
           (id, user_id, actor_kind, actor_id, route, operation, idempotency_key,
            request_fingerprint, status_code, response_json, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        userId,
        actor.kind,
        actor.id,
        route,
        operation,
        idempotencyKey,
        requestFingerprint,
        statusCode,
        JSON.stringify(data),
        nowInstant(),
      );
    return { data, replayed: false, statusCode };
  });

  return transaction.immediate();
};

const activityRow = (sqlite: Database.Database, userId: string, id: string) =>
  sqlite
    .prepare(
      `select id, user_id as userId, kind, name,
              structured_workout_session_id as structuredWorkoutSessionId,
              source_json as sourceJson, actor_json as actorJson, revision,
              current_revision_id as currentRevisionId, created_at as createdAt, updated_at as updatedAt
         from canonical_activities where id = ? and user_id = ?`,
    )
    .get(id, userId) as CanonicalActivityRow | undefined;

const requireActivity = (sqlite: Database.Database, userId: string, id: string) => {
  const row = activityRow(sqlite, userId, id);
  if (!row) throw new ActivityNotFoundError('Activity not found.');
  return row;
};

const requireWorkoutSession = (
  sqlite: Database.Database,
  userId: string,
  workoutSessionId: string | null,
) => {
  if (workoutSessionId === null) return;
  const found = sqlite
    .prepare(`select 1 from workout_sessions where id = ? and user_id = ?`)
    .get(workoutSessionId, userId);
  if (!found) throw new ActivityOwnedLinkNotFoundError('Linked record was not found.');
};

const requireGoals = (sqlite: Database.Database, userId: string, goalIds: string[]) => {
  if (new Set(goalIds).size !== goalIds.length) {
    throw new ActivityOwnedLinkNotFoundError('Linked record was not found.');
  }
  for (const goalId of goalIds) {
    const found = sqlite
      .prepare(`select 1 from activity_goals where id = ? and user_id = ?`)
      .get(goalId, userId);
    if (!found) throw new ActivityOwnedLinkNotFoundError('Linked record was not found.');
  }
};

const goalRows = (
  sqlite: Database.Database,
  userId: string,
  activityId?: string,
): ActivityGoalRuntime[] => {
  const rows = activityId
    ? sqlite
        .prepare(
          `select g.id, g.user_id as subjectUserId, g.kind, g.label, g.state, g.revision,
                  g.created_at as createdAt, g.updated_at as updatedAt
             from activity_goals g
             join activity_goal_links l on l.goal_id = g.id and l.user_id = g.user_id
            where g.user_id = ? and l.activity_id = ?
            order by g.created_at, g.id`,
        )
        .all(userId, activityId)
    : sqlite
        .prepare(
          `select id, user_id as subjectUserId, kind, label, state, revision,
                  created_at as createdAt, updated_at as updatedAt
             from activity_goals where user_id = ? order by created_at, id`,
        )
        .all(userId);
  return rows as ActivityGoalRuntime[];
};

const toCanonicalActivity = (
  row: CanonicalActivityRow,
  goals: ActivityGoalRuntime[],
): CanonicalActivity => ({
  contractVersion: 'activity-journal-v1',
  id: row.id,
  subjectUserId: row.userId,
  kind: row.kind,
  name: row.name,
  goalIds: goals.map((goal) => goal.id),
  structuredWorkoutSessionId: row.structuredWorkoutSessionId,
  ownership: { subjectUserId: row.userId, actor: parseJson(row.actorJson) },
  source: parseJson(row.sourceJson),
  revision: row.revision,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const assignmentRows = (
  sqlite: Database.Database,
  userId: string,
  activityId: string,
): ActivityAssignment[] => {
  const rows = sqlite
    .prepare(
      `select a.id, a.user_id as userId, a.activity_id as activityId,
              a.planned_local_date as plannedLocalDate, a.time_zone as timeZone,
              a.recurrence_revision_id as recurrenceRevisionId, a.revision, a.state,
              a.created_at as createdAt, a.updated_at as updatedAt,
              r.prior_revision_id as priorAssignmentRevisionId
         from activity_assignments a
         join activity_assignment_revisions r on r.id = a.current_revision_id
        where a.user_id = ? and a.activity_id = ?
        order by a.planned_local_date, a.created_at, a.id`,
    )
    .all(userId, activityId) as Array<AssignmentRow & { priorAssignmentRevisionId: string | null }>;
  return rows.map((row) => ({
    id: row.id,
    subjectUserId: row.userId,
    activityId: row.activityId,
    plannedLocalDate: row.plannedLocalDate,
    timeZone: row.timeZone,
    recurrenceRevisionId: row.recurrenceRevisionId,
    priorAssignmentRevisionId: row.priorAssignmentRevisionId,
    revision: row.revision,
    state: row.state,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
};

const assignmentHistoryRows = (
  sqlite: Database.Database,
  userId: string,
  activityId: string,
): ActivityAssignment[] => {
  const rows = sqlite
    .prepare(
      `select r.id as revisionId, r.assignment_id as id, r.user_id as userId,
              a.activity_id as activityId, r.planned_local_date as plannedLocalDate,
              r.time_zone as timeZone, r.recurrence_revision_id as recurrenceRevisionId,
              r.prior_revision_id as priorAssignmentRevisionId, r.revision, r.state,
              a.created_at as createdAt, r.created_at as updatedAt
         from activity_assignment_revisions r
         join activity_assignments a on a.id = r.assignment_id
        where r.user_id = ? and a.activity_id = ?
        order by r.created_at, r.assignment_id, r.revision`,
    )
    .all(userId, activityId) as Array<AssignmentRow & { priorAssignmentRevisionId: string | null }>;
  return rows.map((row) => ({
    id: row.id,
    subjectUserId: row.userId,
    activityId: row.activityId,
    plannedLocalDate: row.plannedLocalDate,
    timeZone: row.timeZone,
    recurrenceRevisionId: row.recurrenceRevisionId,
    priorAssignmentRevisionId: row.priorAssignmentRevisionId,
    revision: row.revision,
    state: row.state,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
};

const executionRows = (sqlite: Database.Database, userId: string, activityId: string) => {
  const rows = sqlite
    .prepare(
      `select id, user_id as userId, activity_id as activityId, assignment_id as assignmentId,
              actual_occurred_at as actualOccurredAt, actual_local_date as actualLocalDate,
              time_zone as timeZone, duration_minutes as durationMinutes, outcome,
              structured_workout_session_id as structuredWorkoutSessionId,
              source_json as sourceJson, revision, current_revision_id as currentRevisionId,
              created_at as createdAt, updated_at as updatedAt
         from activity_executions where user_id = ? and activity_id = ?
        order by actual_occurred_at, created_at, id`,
    )
    .all(userId, activityId) as ExecutionRow[];
  return rows.map((row) => ({
    id: row.id,
    subjectUserId: row.userId,
    activityId: row.activityId,
    assignmentId: row.assignmentId,
    actualOccurredAt: row.actualOccurredAt,
    actualLocalDate: row.actualLocalDate,
    timeZone: row.timeZone,
    durationMinutes: row.durationMinutes,
    outcome: row.outcome,
    structuredWorkoutSessionId: row.structuredWorkoutSessionId,
    source: parseJson<Provenance>(row.sourceJson),
    createdAt: row.createdAt,
  }));
};

const buildCanonicalDetail = (
  sqlite: Database.Database,
  userId: string,
  activityId: string,
): CanonicalActivityDetail => {
  const row = requireActivity(sqlite, userId, activityId);
  const goals = goalRows(sqlite, userId, activityId);
  const revisions = sqlite
    .prepare(
      `select id, activity_id as activityId, user_id as subjectUserId, revision,
              prior_revision_id as priorRevisionId, change_kind as changeKind,
              corrected_fields_json as correctedFieldsJson, reason,
              actor_json as actorJson, created_at as createdAt
         from activity_revisions where user_id = ? and activity_id = ? order by revision`,
    )
    .all(userId, activityId)
    .map((revision) => {
      const value = revision as {
        activityId: string;
        actorJson: string;
        changeKind: 'created' | 'correction' | 'goal_links';
        correctedFieldsJson: string | null;
        createdAt: string;
        id: string;
        priorRevisionId: string | null;
        reason: string | null;
        revision: number;
        subjectUserId: string;
      };
      return {
        id: value.id,
        activityId: value.activityId,
        subjectUserId: value.subjectUserId,
        revision: value.revision,
        priorRevisionId: value.priorRevisionId,
        changeKind: value.changeKind,
        actor: parseJson(value.actorJson),
        correctedFields: value.correctedFieldsJson ? parseJson(value.correctedFieldsJson) : null,
        reason: value.reason,
        createdAt: value.createdAt,
      };
    });
  const recurrences = sqlite
    .prepare(
      `select id, activity_id as activityId, user_id as subjectUserId
         from activity_recurrences where user_id = ? and activity_id = ? order by created_at, id`,
    )
    .all(userId, activityId)
    .map((recurrence) => {
      const root = recurrence as { activityId: string; id: string; subjectUserId: string };
      const revisionsForRecurrence = recurrenceRevisionRows(sqlite, userId, root.id).map(
        mapRecurrenceRevision,
      );
      return { ...root, revisions: revisionsForRecurrence };
    });
  const corrections = sqlite
    .prepare(
      `select r.id, r.execution_id as executionId, r.user_id as userId, r.revision,
              r.prior_revision_id as priorRevisionId, r.corrected_fields_json as correctedFieldsJson,
              r.reason, r.actor_json as actorJson, r.created_at as createdAt
         from activity_execution_revisions r
         join activity_executions e on e.id = r.execution_id
        where r.user_id = ? and e.activity_id = ? order by r.created_at, r.execution_id, r.revision`,
    )
    .all(userId, activityId)
    .map((entry) => {
      const value = entry as {
        actorJson: string;
        correctedFieldsJson: string;
        createdAt: string;
        executionId: string;
        id: string;
        priorRevisionId: string | null;
        reason: string;
        revision: number;
        userId: string;
      };
      return {
        id: value.id,
        record: {
          kind: 'activity_execution' as const,
          id: value.executionId,
          subjectUserId: value.userId,
          revisionId: value.id,
        },
        revision: value.revision,
        priorRevisionId: value.priorRevisionId,
        correctedFields: parseJson<Record<string, unknown>>(value.correctedFieldsJson),
        reason: value.reason,
        actor: parseJson<ActivityJournalActor>(value.actorJson),
        createdAt: value.createdAt,
      };
    });
  const links = sqlite
    .prepare(
      `select id, user_id as userId, activity_id as activityId, target_kind as targetKind,
              target_id as targetId, target_revision_id as targetRevisionId, relation, created_at as createdAt
         from activity_owned_links where user_id = ? and activity_id = ? order by created_at, id`,
    )
    .all(userId, activityId)
    .map((entry) => {
      const link = entry as {
        activityId: string;
        createdAt: string;
        id: string;
        relation: 'structured_workout_reference' | 'observed_during';
        targetId: string;
        targetKind: 'activity' | 'workout_session' | 'scheduled_workout';
        targetRevisionId: string | null;
        userId: string;
      };
      return {
        id: link.id,
        subjectUserId: link.userId,
        source: {
          kind: 'activity' as const,
          id: link.activityId,
          subjectUserId: link.userId,
          revisionId: row.currentRevisionId,
        },
        target: {
          kind: link.targetKind,
          id: link.targetId,
          subjectUserId: link.userId,
          revisionId: link.targetRevisionId,
        },
        relation: link.relation,
        createdAt: link.createdAt,
      };
    });

  return {
    recordType: 'canonical',
    activity: toCanonicalActivity(row, goals),
    goals,
    revisions: revisions as CanonicalActivityDetail['revisions'],
    assignments: assignmentRows(sqlite, userId, activityId),
    assignmentHistory: assignmentHistoryRows(sqlite, userId, activityId),
    executions: executionRows(sqlite, userId, activityId),
    executionCorrections: corrections,
    recurrences,
    sourceLinks: links,
  };
};

const legacyDetail = (
  sqlite: Database.Database,
  userId: string,
  activityId: string,
): LegacyActivityReadModel | null => {
  const row = sqlite
    .prepare(
      `select id, user_id as userId, date as localDate, type as kind, name,
              duration_minutes as durationMinutes, notes, created_at as createdAt, updated_at as updatedAt
         from activities where id = ? and user_id = ?`,
    )
    .get(activityId, userId) as
    | {
        createdAt: number;
        durationMinutes: number;
        id: string;
        kind:
          | 'walking'
          | 'running'
          | 'stretching'
          | 'yoga'
          | 'cycling'
          | 'swimming'
          | 'hiking'
          | 'other';
        localDate: string;
        name: string;
        notes: string | null;
        updatedAt: number;
        userId: string;
      }
    | undefined;
  if (!row) return null;
  return {
    recordType: 'legacy_date_only',
    id: row.id,
    subjectUserId: row.userId,
    localDate: row.localDate,
    kind: row.kind,
    name: row.name,
    durationMinutes: row.durationMinutes,
    notes: row.notes,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    ambiguity: 'No occurrence time, timezone, actor, or provenance was recorded.',
  };
};

export const getActivityDetail = async (
  userId: string,
  activityId: string,
): Promise<ActivityDetail | null> => {
  const sqlite = await getSqlite();
  if (activityRow(sqlite, userId, activityId)) {
    return buildCanonicalDetail(sqlite, userId, activityId);
  }
  return legacyDetail(sqlite, userId, activityId);
};

export const listActivities = async (userId: string, query: ActivityListQuery) => {
  const sqlite = await getSqlite();
  const canonicalRows = sqlite
    .prepare(
      `select id, user_id as userId, kind, name,
              structured_workout_session_id as structuredWorkoutSessionId,
              source_json as sourceJson, actor_json as actorJson, revision,
              current_revision_id as currentRevisionId, created_at as createdAt, updated_at as updatedAt,
              (select max(planned_local_date) from activity_assignments a where a.activity_id = canonical_activities.id) as latestPlannedLocalDate,
              (select max(actual_local_date) from activity_executions e where e.activity_id = canonical_activities.id) as latestActualLocalDate
         from canonical_activities
        where user_id = ?
          and ((? is null and ? is null)
            or exists (
              select 1 from activity_assignments a
               where a.activity_id = canonical_activities.id
                 and (? is null or a.planned_local_date >= ?)
                 and (? is null or a.planned_local_date <= ?)
            )
            or exists (
              select 1 from activity_executions e
               where e.activity_id = canonical_activities.id
                 and (? is null or e.actual_local_date >= ?)
                 and (? is null or e.actual_local_date <= ?)
            ))
        order by created_at desc, id desc`,
    )
    .all(
      userId,
      query.from ?? null,
      query.to ?? null,
      query.from ?? null,
      query.from ?? null,
      query.to ?? null,
      query.to ?? null,
      query.from ?? null,
      query.from ?? null,
      query.to ?? null,
      query.to ?? null,
    ) as Array<
    CanonicalActivityRow & {
      latestActualLocalDate: string | null;
      latestPlannedLocalDate: string | null;
    }
  >;

  const canonicalItems = canonicalRows.map((row) => {
    const goals = goalRows(sqlite, userId, row.id);
    return {
      recordType: 'canonical' as const,
      activity: toCanonicalActivity(row, goals),
      goals,
      latestPlannedLocalDate: row.latestPlannedLocalDate,
      latestActualLocalDate: row.latestActualLocalDate,
    };
  });
  const legacyItems = query.includeLegacy
    ? (
        sqlite
          .prepare(
            `select id from activities where user_id = ?
             and (? is null or date >= ?) and (? is null or date <= ?)
           order by date desc, created_at desc, id desc`,
          )
          .all(
            userId,
            query.from ?? null,
            query.from ?? null,
            query.to ?? null,
            query.to ?? null,
          ) as Array<{
          id: string;
        }>
      ).map((row) =>
        requiredValue(
          legacyDetail(sqlite, userId, row.id),
          'Legacy activity disappeared during read.',
        ),
      )
    : [];
  const items = [...canonicalItems, ...legacyItems].sort((left, right) => {
    const leftDate =
      left.recordType === 'canonical'
        ? (left.latestActualLocalDate ?? left.latestPlannedLocalDate ?? left.activity.createdAt)
        : left.localDate;
    const rightDate =
      right.recordType === 'canonical'
        ? (right.latestActualLocalDate ?? right.latestPlannedLocalDate ?? right.activity.createdAt)
        : right.localDate;
    return (
      rightDate.localeCompare(leftDate) || JSON.stringify(right).localeCompare(JSON.stringify(left))
    );
  });
  const offset = (query.page - 1) * query.limit;
  return { data: items.slice(offset, offset + query.limit), total: items.length };
};

const replaceGoalLinks = (
  sqlite: Database.Database,
  userId: string,
  activityId: string,
  goalIds: string[],
  createdAt: string,
) => {
  requireGoals(sqlite, userId, goalIds);
  sqlite
    .prepare(`delete from activity_goal_links where activity_id = ? and user_id = ?`)
    .run(activityId, userId);
  const insert = sqlite.prepare(
    `insert into activity_goal_links (activity_id, goal_id, user_id, created_at) values (?, ?, ?, ?)`,
  );
  for (const goalId of goalIds) insert.run(activityId, goalId, userId, createdAt);
};

const activitySnapshot = (row: CanonicalActivityRow, goalIds: string[]) => ({
  kind: row.kind,
  name: row.name,
  goalIds,
  structuredWorkoutSessionId: row.structuredWorkoutSessionId,
  source: parseJson(row.sourceJson),
});

export const createActivity = async (
  userId: string,
  actor: ActivityMutationActor,
  input: CreateActivityApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'create_activity',
    route: '/api/v1/activities',
    semanticPayload: withoutIdempotencyKey(input),
    statusCode: 201,
    userId,
    write: (sqlite) => {
      requireGoals(sqlite, userId, input.goalIds);
      requireWorkoutSession(sqlite, userId, input.structuredWorkoutSessionId);
      const activityId = randomUUID();
      const revisionId = randomUUID();
      const timestamp = nowInstant();
      const source = capturedProvenance(input.source, actor);
      const row: CanonicalActivityRow = {
        id: activityId,
        userId,
        kind: input.kind,
        name: input.name,
        structuredWorkoutSessionId: input.structuredWorkoutSessionId,
        sourceJson: JSON.stringify(source),
        actorJson: JSON.stringify(actor),
        revision: 1,
        currentRevisionId: revisionId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      sqlite
        .prepare(
          `insert into canonical_activities
             (id, user_id, kind, name, structured_workout_session_id, source_json, actor_json,
              revision, current_revision_id, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .run(
          row.id,
          row.userId,
          row.kind,
          row.name,
          row.structuredWorkoutSessionId,
          row.sourceJson,
          row.actorJson,
          revisionId,
          timestamp,
          timestamp,
        );
      replaceGoalLinks(sqlite, userId, activityId, input.goalIds, timestamp);
      sqlite
        .prepare(
          `insert into activity_revisions
             (id, activity_id, user_id, revision, prior_revision_id, change_kind, snapshot_json,
              corrected_fields_json, reason, actor_json, created_at)
           values (?, ?, ?, 1, null, 'created', ?, null, null, ?, ?)`,
        )
        .run(
          revisionId,
          activityId,
          userId,
          JSON.stringify(activitySnapshot(row, input.goalIds)),
          JSON.stringify(actor),
          timestamp,
        );
      return buildCanonicalDetail(sqlite, userId, activityId);
    },
  });

export const correctActivity = async (
  userId: string,
  activityId: string,
  actor: ActivityMutationActor,
  input: CorrectActivityApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'correct_activity',
    route: '/api/v1/activities/:id',
    semanticPayload: { activityId, ...withoutIdempotencyKey(input) },
    statusCode: 200,
    userId,
    write: (sqlite) => {
      const current = requireActivity(sqlite, userId, activityId);
      if (current.revision !== input.expectedRevision) {
        throw new ActivityStaleRevisionError(current.revision, input.expectedRevision);
      }
      const existingGoalIds = goalRows(sqlite, userId, activityId).map((goal) => goal.id);
      const goalIds = input.correctedFields.goalIds ?? existingGoalIds;
      requireGoals(sqlite, userId, goalIds);
      const structuredWorkoutSessionId =
        input.correctedFields.structuredWorkoutSessionId !== undefined
          ? input.correctedFields.structuredWorkoutSessionId
          : current.structuredWorkoutSessionId;
      requireWorkoutSession(sqlite, userId, structuredWorkoutSessionId);
      const nextSource = input.correctedFields.source
        ? capturedProvenance(input.correctedFields.source, actor)
        : parseJson<Provenance>(current.sourceJson);
      const nextRevision = current.revision + 1;
      const revisionId = randomUUID();
      const timestamp = nowInstant();
      const result = sqlite
        .prepare(
          `update canonical_activities
              set kind = ?, name = ?, structured_workout_session_id = ?, source_json = ?,
                  revision = ?, current_revision_id = ?, updated_at = ?
            where id = ? and user_id = ? and revision = ?`,
        )
        .run(
          input.correctedFields.kind ?? current.kind,
          input.correctedFields.name ?? current.name,
          structuredWorkoutSessionId,
          JSON.stringify(nextSource),
          nextRevision,
          revisionId,
          timestamp,
          activityId,
          userId,
          input.expectedRevision,
        );
      if (result.changes !== 1) {
        const latest = requireActivity(sqlite, userId, activityId);
        throw new ActivityStaleRevisionError(latest.revision, input.expectedRevision);
      }
      if (input.correctedFields.goalIds) {
        replaceGoalLinks(sqlite, userId, activityId, goalIds, timestamp);
      }
      const nextRow = requireActivity(sqlite, userId, activityId);
      sqlite
        .prepare(
          `insert into activity_revisions
             (id, activity_id, user_id, revision, prior_revision_id, change_kind, snapshot_json,
              corrected_fields_json, reason, actor_json, created_at)
           values (?, ?, ?, ?, ?, 'correction', ?, ?, ?, ?, ?)`,
        )
        .run(
          revisionId,
          activityId,
          userId,
          nextRevision,
          current.currentRevisionId,
          JSON.stringify(activitySnapshot(nextRow, goalIds)),
          JSON.stringify(input.correctedFields),
          input.reason,
          JSON.stringify(actor),
          timestamp,
        );
      return buildCanonicalDetail(sqlite, userId, activityId);
    },
  });

export const createActivityGoal = async (
  userId: string,
  actor: ActivityMutationActor,
  input: CreateActivityGoalApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'create_activity_goal',
    route: '/api/v1/activity-goals',
    semanticPayload: withoutIdempotencyKey(input),
    statusCode: 201,
    userId,
    write: (sqlite) => {
      const timestamp = nowInstant();
      const goal: ActivityGoalRuntime = {
        id: randomUUID(),
        subjectUserId: userId,
        kind: input.kind,
        label: input.label,
        state: 'active',
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      sqlite
        .prepare(
          `insert into activity_goals
             (id, user_id, kind, label, state, revision, created_at, updated_at)
           values (?, ?, ?, ?, 'active', 1, ?, ?)`,
        )
        .run(goal.id, userId, goal.kind, goal.label, timestamp, timestamp);
      return goal;
    },
  });

export const listActivityGoals = async (userId: string) => {
  const sqlite = await getSqlite();
  return goalRows(sqlite, userId);
};

export const updateActivityGoal = async (
  userId: string,
  goalId: string,
  actor: ActivityMutationActor,
  input: UpdateActivityGoalApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'update_activity_goal',
    route: '/api/v1/activity-goals/:id',
    semanticPayload: { goalId, ...withoutIdempotencyKey(input) },
    statusCode: 200,
    userId,
    write: (sqlite) => {
      const current = sqlite
        .prepare(
          `select id, user_id as subjectUserId, kind, label, state, revision,
                  created_at as createdAt, updated_at as updatedAt
             from activity_goals where id = ? and user_id = ?`,
        )
        .get(goalId, userId) as ActivityGoalRuntime | undefined;
      if (!current) throw new ActivityOwnedLinkNotFoundError('Linked record was not found.');
      if (current.revision !== input.expectedRevision) {
        throw new ActivityStaleRevisionError(current.revision, input.expectedRevision);
      }
      const timestamp = nowInstant();
      sqlite
        .prepare(
          `update activity_goals set label = ?, state = ?, revision = revision + 1, updated_at = ?
            where id = ? and user_id = ? and revision = ?`,
        )
        .run(
          input.label ?? current.label,
          input.state ?? current.state,
          timestamp,
          goalId,
          userId,
          input.expectedRevision,
        );
      return sqlite
        .prepare(
          `select id, user_id as subjectUserId, kind, label, state, revision,
                  created_at as createdAt, updated_at as updatedAt
             from activity_goals where id = ? and user_id = ?`,
        )
        .get(goalId, userId) as ActivityGoalRuntime;
    },
  });

export const replaceActivityGoals = async (
  userId: string,
  activityId: string,
  actor: ActivityMutationActor,
  input: ReplaceActivityGoalLinksApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'replace_activity_goals',
    route: '/api/v1/activities/:id/goals',
    semanticPayload: { activityId, ...withoutIdempotencyKey(input) },
    statusCode: 200,
    userId,
    write: (sqlite) => {
      const current = requireActivity(sqlite, userId, activityId);
      if (current.revision !== input.expectedRevision) {
        throw new ActivityStaleRevisionError(current.revision, input.expectedRevision);
      }
      requireGoals(sqlite, userId, input.goalIds);
      const timestamp = nowInstant();
      const revisionId = randomUUID();
      const nextRevision = current.revision + 1;
      const result = sqlite
        .prepare(
          `update canonical_activities set revision = ?, current_revision_id = ?, updated_at = ?
            where id = ? and user_id = ? and revision = ?`,
        )
        .run(nextRevision, revisionId, timestamp, activityId, userId, input.expectedRevision);
      if (result.changes !== 1) {
        const latest = requireActivity(sqlite, userId, activityId);
        throw new ActivityStaleRevisionError(latest.revision, input.expectedRevision);
      }
      replaceGoalLinks(sqlite, userId, activityId, input.goalIds, timestamp);
      const next = requireActivity(sqlite, userId, activityId);
      sqlite
        .prepare(
          `insert into activity_revisions
             (id, activity_id, user_id, revision, prior_revision_id, change_kind, snapshot_json,
              corrected_fields_json, reason, actor_json, created_at)
           values (?, ?, ?, ?, ?, 'goal_links', ?, ?, 'Goal links replaced', ?, ?)`,
        )
        .run(
          revisionId,
          activityId,
          userId,
          nextRevision,
          current.currentRevisionId,
          JSON.stringify(activitySnapshot(next, input.goalIds)),
          JSON.stringify({ goalIds: input.goalIds }),
          JSON.stringify(actor),
          timestamp,
        );
      return buildCanonicalDetail(sqlite, userId, activityId);
    },
  });

const insertAssignment = (
  sqlite: Database.Database,
  userId: string,
  activityId: string,
  actor: ActivityMutationActor,
  input: {
    plannedLocalDate: string;
    recurrenceId: string | null;
    recurrenceRevisionId: string | null;
    timeZone: string;
  },
) => {
  const assignmentId = randomUUID();
  const revisionId = randomUUID();
  const timestamp = nowInstant();
  sqlite
    .prepare(
      `insert into activity_assignments
         (id, user_id, activity_id, recurrence_id, planned_local_date, time_zone,
          recurrence_revision_id, revision, current_revision_id, state, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, 1, ?, 'planned', ?, ?)`,
    )
    .run(
      assignmentId,
      userId,
      activityId,
      input.recurrenceId,
      input.plannedLocalDate,
      input.timeZone,
      input.recurrenceRevisionId,
      revisionId,
      timestamp,
      timestamp,
    );
  sqlite
    .prepare(
      `insert into activity_assignment_revisions
         (id, assignment_id, user_id, revision, prior_revision_id, planned_local_date,
          time_zone, recurrence_revision_id, state, reason, actor_json, created_at)
       values (?, ?, ?, 1, null, ?, ?, ?, 'planned', null, ?, ?)`,
    )
    .run(
      revisionId,
      assignmentId,
      userId,
      input.plannedLocalDate,
      input.timeZone,
      input.recurrenceRevisionId,
      JSON.stringify(actor),
      timestamp,
    );
  return requiredValue(
    assignmentRows(sqlite, userId, activityId).find((entry) => entry.id === assignmentId),
    'Created assignment could not be read back.',
  );
};

const recurrenceRevisionRow = (sqlite: Database.Database, userId: string, revisionId: string) =>
  sqlite
    .prepare(
      `select id, recurrence_id as recurrenceId, user_id as userId, sequence,
              prior_revision_id as priorRevisionId, effective_from_local_date as effectiveFromLocalDate,
              time_zone as timeZone, frequency, interval, weekdays_json as weekdaysJson,
              assignment_policy as assignmentPolicy, actor_json as actorJson, created_at as createdAt
         from activity_recurrence_revisions where id = ? and user_id = ?`,
    )
    .get(revisionId, userId) as RecurrenceRevisionRow | undefined;

const recurrenceRevisionRows = (sqlite: Database.Database, userId: string, recurrenceId: string) =>
  sqlite
    .prepare(
      `select id, recurrence_id as recurrenceId, user_id as userId, sequence,
              prior_revision_id as priorRevisionId, effective_from_local_date as effectiveFromLocalDate,
              time_zone as timeZone, frequency, interval, weekdays_json as weekdaysJson,
              assignment_policy as assignmentPolicy, actor_json as actorJson, created_at as createdAt
         from activity_recurrence_revisions where recurrence_id = ? and user_id = ? order by sequence`,
    )
    .all(recurrenceId, userId) as RecurrenceRevisionRow[];

const mapRecurrenceRevision = (row: RecurrenceRevisionRow) => ({
  id: row.id,
  recurrenceId: row.recurrenceId,
  subjectUserId: row.userId,
  sequence: row.sequence,
  priorRevisionId: row.priorRevisionId,
  effectiveFromLocalDate: row.effectiveFromLocalDate,
  timeZone: row.timeZone,
  frequency: row.frequency,
  interval: row.interval,
  weekdays: parseJson<number[]>(row.weekdaysJson),
  assignmentPolicy: row.assignmentPolicy,
  createdAt: row.createdAt,
  actor: parseJson<ActivityJournalActor>(row.actorJson),
});

export const createActivityAssignment = async (
  userId: string,
  activityId: string,
  actor: ActivityMutationActor,
  input: CreateActivityAssignmentApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'create_activity_assignment',
    route: '/api/v1/activities/:id/assignments',
    semanticPayload: { activityId, ...withoutIdempotencyKey(input) },
    statusCode: 201,
    userId,
    write: (sqlite) => {
      requireActivity(sqlite, userId, activityId);
      let recurrenceId: string | null = null;
      if (input.recurrenceRevisionId) {
        const revision = recurrenceRevisionRow(sqlite, userId, input.recurrenceRevisionId);
        if (!revision) throw new ActivityOwnedLinkNotFoundError('Linked record was not found.');
        const recurrence = sqlite
          .prepare(
            `select activity_id as activityId from activity_recurrences where id = ? and user_id = ?`,
          )
          .get(revision.recurrenceId, userId) as { activityId: string } | undefined;
        if (!recurrence || recurrence.activityId !== activityId) {
          throw new ActivityOwnedLinkNotFoundError('Linked record was not found.');
        }
        recurrenceId = revision.recurrenceId;
      }
      return insertAssignment(sqlite, userId, activityId, actor, {
        plannedLocalDate: input.plannedLocalDate,
        recurrenceId,
        recurrenceRevisionId: input.recurrenceRevisionId,
        timeZone: input.timeZone,
      });
    },
  });

const requireAssignment = (sqlite: Database.Database, userId: string, assignmentId: string) => {
  const row = sqlite
    .prepare(
      `select id, user_id as userId, activity_id as activityId, recurrence_id as recurrenceId,
              planned_local_date as plannedLocalDate, time_zone as timeZone,
              recurrence_revision_id as recurrenceRevisionId, revision,
              current_revision_id as currentRevisionId, state, created_at as createdAt, updated_at as updatedAt
         from activity_assignments where id = ? and user_id = ?`,
    )
    .get(assignmentId, userId) as AssignmentRow | undefined;
  if (!row) throw new ActivityOwnedLinkNotFoundError('Linked record was not found.');
  return row;
};

export const rescheduleActivityAssignment = async (
  userId: string,
  assignmentId: string,
  actor: ActivityMutationActor,
  input: RescheduleActivityAssignmentApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'reschedule_activity_assignment',
    route: '/api/v1/activity-assignments/:id/reschedule',
    semanticPayload: { assignmentId, ...withoutIdempotencyKey(input) },
    statusCode: 200,
    userId,
    write: (sqlite) => {
      const current = requireAssignment(sqlite, userId, assignmentId);
      if (current.revision !== input.expectedRevision) {
        throw new ActivityStaleRevisionError(current.revision, input.expectedRevision);
      }
      const revisionId = randomUUID();
      const nextRevision = current.revision + 1;
      const timestamp = nowInstant();
      const result = sqlite
        .prepare(
          `update activity_assignments
              set planned_local_date = ?, time_zone = ?, revision = ?, current_revision_id = ?, updated_at = ?
            where id = ? and user_id = ? and revision = ?`,
        )
        .run(
          input.plannedLocalDate,
          input.timeZone,
          nextRevision,
          revisionId,
          timestamp,
          assignmentId,
          userId,
          input.expectedRevision,
        );
      if (result.changes !== 1) {
        const latest = requireAssignment(sqlite, userId, assignmentId);
        throw new ActivityStaleRevisionError(latest.revision, input.expectedRevision);
      }
      sqlite
        .prepare(
          `insert into activity_assignment_revisions
             (id, assignment_id, user_id, revision, prior_revision_id, planned_local_date,
              time_zone, recurrence_revision_id, state, reason, actor_json, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          revisionId,
          assignmentId,
          userId,
          nextRevision,
          current.currentRevisionId,
          input.plannedLocalDate,
          input.timeZone,
          current.recurrenceRevisionId,
          current.state,
          input.reason,
          JSON.stringify(actor),
          timestamp,
        );
      return requiredValue(
        assignmentRows(sqlite, userId, current.activityId).find(
          (entry) => entry.id === assignmentId,
        ),
        'Rescheduled assignment could not be read back.',
      );
    },
  });

const appendAssignmentStateRevision = (
  sqlite: Database.Database,
  current: AssignmentRow,
  state: ActivityAssignment['state'],
  actor: ActivityMutationActor,
  reason: string,
) => {
  const revisionId = randomUUID();
  const nextRevision = current.revision + 1;
  const timestamp = nowInstant();
  sqlite
    .prepare(
      `update activity_assignments set state = ?, revision = ?, current_revision_id = ?, updated_at = ?
        where id = ? and user_id = ? and revision = ?`,
    )
    .run(state, nextRevision, revisionId, timestamp, current.id, current.userId, current.revision);
  sqlite
    .prepare(
      `insert into activity_assignment_revisions
         (id, assignment_id, user_id, revision, prior_revision_id, planned_local_date,
          time_zone, recurrence_revision_id, state, reason, actor_json, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      revisionId,
      current.id,
      current.userId,
      nextRevision,
      current.currentRevisionId,
      current.plannedLocalDate,
      current.timeZone,
      current.recurrenceRevisionId,
      state,
      reason,
      JSON.stringify(actor),
      timestamp,
    );
};

export const recordActivityExecution = async (
  userId: string,
  activityId: string,
  actor: ActivityMutationActor,
  input: RecordActivityExecutionApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'record_activity_execution',
    route: '/api/v1/activities/:id/executions',
    semanticPayload: { activityId, ...withoutIdempotencyKey(input) },
    statusCode: 201,
    userId,
    write: (sqlite) => {
      requireActivity(sqlite, userId, activityId);
      requireWorkoutSession(sqlite, userId, input.structuredWorkoutSessionId);
      const assignment = input.assignmentId
        ? requireAssignment(sqlite, userId, input.assignmentId)
        : null;
      if (assignment && assignment.activityId !== activityId) {
        throw new ActivityOwnedLinkNotFoundError('Linked record was not found.');
      }
      if (
        assignment &&
        sqlite
          .prepare(`select 1 from activity_executions where assignment_id = ?`)
          .get(assignment.id)
      ) {
        throw new ActivityExecutionConflictError();
      }
      const executionId = randomUUID();
      const revisionId = randomUUID();
      const timestamp = nowInstant();
      const source = capturedProvenance(input.source, actor);
      const candidate = activityExecutionSchema.parse({
        id: executionId,
        subjectUserId: userId,
        activityId,
        assignmentId: input.assignmentId,
        actualOccurredAt: input.actualOccurredAt,
        actualLocalDate: input.actualLocalDate,
        timeZone: input.timeZone,
        durationMinutes: input.durationMinutes,
        outcome: input.outcome,
        structuredWorkoutSessionId: input.structuredWorkoutSessionId,
        source,
        createdAt: timestamp,
      });
      sqlite
        .prepare(
          `insert into activity_executions
             (id, user_id, activity_id, assignment_id, actual_occurred_at, actual_local_date,
              time_zone, duration_minutes, outcome, structured_workout_session_id, source_json,
              revision, current_revision_id, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .run(
          executionId,
          userId,
          activityId,
          input.assignmentId,
          input.actualOccurredAt,
          input.actualLocalDate,
          input.timeZone,
          input.durationMinutes,
          input.outcome,
          input.structuredWorkoutSessionId,
          JSON.stringify(source),
          revisionId,
          timestamp,
          timestamp,
        );
      sqlite
        .prepare(
          `insert into activity_execution_revisions
             (id, execution_id, user_id, revision, prior_revision_id, snapshot_json,
              corrected_fields_json, reason, actor_json, created_at)
           values (?, ?, ?, 1, null, ?, ?, 'Initial captured execution', ?, ?)`,
        )
        .run(
          revisionId,
          executionId,
          userId,
          JSON.stringify(candidate),
          JSON.stringify({ captured: true }),
          JSON.stringify(actor),
          timestamp,
        );
      if (assignment) {
        appendAssignmentStateRevision(sqlite, assignment, 'completed', actor, 'Execution recorded');
      }
      return candidate;
    },
  });

const requireExecution = (sqlite: Database.Database, userId: string, executionId: string) => {
  const row = sqlite
    .prepare(
      `select id, user_id as userId, activity_id as activityId, assignment_id as assignmentId,
              actual_occurred_at as actualOccurredAt, actual_local_date as actualLocalDate,
              time_zone as timeZone, duration_minutes as durationMinutes, outcome,
              structured_workout_session_id as structuredWorkoutSessionId,
              source_json as sourceJson, revision, current_revision_id as currentRevisionId,
              created_at as createdAt, updated_at as updatedAt
         from activity_executions where id = ? and user_id = ?`,
    )
    .get(executionId, userId) as ExecutionRow | undefined;
  if (!row) throw new ActivityOwnedLinkNotFoundError('Linked record was not found.');
  return row;
};

export const correctActivityExecution = async (
  userId: string,
  executionId: string,
  actor: ActivityMutationActor,
  input: CorrectActivityExecutionApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'correct_activity_execution',
    route: '/api/v1/activity-executions/:id/corrections',
    semanticPayload: { executionId, ...withoutIdempotencyKey(input) },
    statusCode: 200,
    userId,
    write: (sqlite) => {
      const current = requireExecution(sqlite, userId, executionId);
      if (current.revision !== input.expectedRevision) {
        throw new ActivityStaleRevisionError(current.revision, input.expectedRevision);
      }
      const source = input.correctedFields.source
        ? capturedProvenance(input.correctedFields.source, actor)
        : parseJson<Provenance>(current.sourceJson);
      const next = activityExecutionSchema.parse({
        id: current.id,
        subjectUserId: userId,
        activityId: current.activityId,
        assignmentId: current.assignmentId,
        actualOccurredAt: input.correctedFields.actualOccurredAt ?? current.actualOccurredAt,
        actualLocalDate: input.correctedFields.actualLocalDate ?? current.actualLocalDate,
        timeZone: input.correctedFields.timeZone ?? current.timeZone,
        durationMinutes:
          input.correctedFields.durationMinutes !== undefined
            ? input.correctedFields.durationMinutes
            : current.durationMinutes,
        outcome: input.correctedFields.outcome ?? current.outcome,
        structuredWorkoutSessionId: current.structuredWorkoutSessionId,
        source,
        createdAt: current.createdAt,
      });
      const revisionId = randomUUID();
      const nextRevision = current.revision + 1;
      const timestamp = nowInstant();
      const result = sqlite
        .prepare(
          `update activity_executions
              set actual_occurred_at = ?, actual_local_date = ?, time_zone = ?, duration_minutes = ?,
                  outcome = ?, source_json = ?, revision = ?, current_revision_id = ?, updated_at = ?
            where id = ? and user_id = ? and revision = ?`,
        )
        .run(
          next.actualOccurredAt,
          next.actualLocalDate,
          next.timeZone,
          next.durationMinutes,
          next.outcome,
          JSON.stringify(next.source),
          nextRevision,
          revisionId,
          timestamp,
          executionId,
          userId,
          input.expectedRevision,
        );
      if (result.changes !== 1) {
        const latest = requireExecution(sqlite, userId, executionId);
        throw new ActivityStaleRevisionError(latest.revision, input.expectedRevision);
      }
      sqlite
        .prepare(
          `insert into activity_execution_revisions
             (id, execution_id, user_id, revision, prior_revision_id, snapshot_json,
              corrected_fields_json, reason, actor_json, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          revisionId,
          executionId,
          userId,
          nextRevision,
          current.currentRevisionId,
          JSON.stringify(next),
          JSON.stringify(input.correctedFields),
          input.reason,
          JSON.stringify(actor),
          timestamp,
        );
      return next;
    },
  });

const insertRecurrenceRevision = (
  sqlite: Database.Database,
  userId: string,
  recurrenceId: string,
  sequence: number,
  priorRevisionId: string | null,
  actor: ActivityMutationActor,
  input: CreateActivityRecurrenceApiInput | ReviseActivityRecurrenceApiInput,
) => {
  const id = randomUUID();
  const timestamp = nowInstant();
  sqlite
    .prepare(
      `insert into activity_recurrence_revisions
         (id, recurrence_id, user_id, sequence, prior_revision_id, effective_from_local_date,
          time_zone, frequency, interval, weekdays_json, assignment_policy, actor_json, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      recurrenceId,
      userId,
      sequence,
      priorRevisionId,
      input.effectiveFromLocalDate,
      input.timeZone,
      input.frequency,
      input.interval,
      JSON.stringify(input.weekdays),
      input.assignmentPolicy,
      JSON.stringify(actor),
      timestamp,
    );
  return { id, timestamp };
};

export const createActivityRecurrence = async (
  userId: string,
  activityId: string,
  actor: ActivityMutationActor,
  input: CreateActivityRecurrenceApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'create_activity_recurrence',
    route: '/api/v1/activities/:id/recurrences',
    semanticPayload: { activityId, ...withoutIdempotencyKey(input) },
    statusCode: 201,
    userId,
    write: (sqlite) => {
      requireActivity(sqlite, userId, activityId);
      const recurrenceId = randomUUID();
      const timestamp = nowInstant();
      const revisionId = randomUUID();
      sqlite
        .prepare(
          `insert into activity_recurrences
             (id, activity_id, user_id, current_revision_id, created_at) values (?, ?, ?, ?, ?)`,
        )
        .run(recurrenceId, activityId, userId, revisionId, timestamp);
      sqlite
        .prepare(
          `insert into activity_recurrence_revisions
             (id, recurrence_id, user_id, sequence, prior_revision_id, effective_from_local_date,
              time_zone, frequency, interval, weekdays_json, assignment_policy, actor_json, created_at)
           values (?, ?, ?, 1, null, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          revisionId,
          recurrenceId,
          userId,
          input.effectiveFromLocalDate,
          input.timeZone,
          input.frequency,
          input.interval,
          JSON.stringify(input.weekdays),
          input.assignmentPolicy,
          JSON.stringify(actor),
          timestamp,
        );
      return {
        id: recurrenceId,
        activityId,
        subjectUserId: userId,
        revisions: [
          mapRecurrenceRevision(
            requiredValue(
              recurrenceRevisionRow(sqlite, userId, revisionId),
              'Created recurrence revision could not be read back.',
            ),
          ),
        ],
      };
    },
  });

const requireRecurrence = (sqlite: Database.Database, userId: string, recurrenceId: string) => {
  const row = sqlite
    .prepare(
      `select id, activity_id as activityId, user_id as userId,
              current_revision_id as currentRevisionId, created_at as createdAt
         from activity_recurrences where id = ? and user_id = ?`,
    )
    .get(recurrenceId, userId) as
    | {
        activityId: string;
        createdAt: string;
        currentRevisionId: string;
        id: string;
        userId: string;
      }
    | undefined;
  if (!row) throw new ActivityOwnedLinkNotFoundError('Linked record was not found.');
  return row;
};

export const reviseActivityRecurrence = async (
  userId: string,
  recurrenceId: string,
  actor: ActivityMutationActor,
  input: ReviseActivityRecurrenceApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'revise_activity_recurrence',
    route: '/api/v1/activity-recurrences/:id/revisions',
    semanticPayload: { recurrenceId, ...withoutIdempotencyKey(input) },
    statusCode: 201,
    userId,
    write: (sqlite) => {
      const recurrence = requireRecurrence(sqlite, userId, recurrenceId);
      if (recurrence.currentRevisionId !== input.expectedRevisionId) {
        throw new ActivityStaleRecurrenceError(
          recurrence.currentRevisionId,
          input.expectedRevisionId,
        );
      }
      const prior = requiredValue(
        recurrenceRevisionRow(sqlite, userId, recurrence.currentRevisionId),
        'Current recurrence revision was not found.',
      );
      const next = insertRecurrenceRevision(
        sqlite,
        userId,
        recurrenceId,
        prior.sequence + 1,
        prior.id,
        actor,
        input,
      );
      const updated = sqlite
        .prepare(
          `update activity_recurrences set current_revision_id = ?
            where id = ? and user_id = ? and current_revision_id = ?`,
        )
        .run(next.id, recurrenceId, userId, input.expectedRevisionId);
      if (updated.changes !== 1) {
        const latest = requireRecurrence(sqlite, userId, recurrenceId);
        throw new ActivityStaleRecurrenceError(latest.currentRevisionId, input.expectedRevisionId);
      }
      return {
        id: recurrenceId,
        activityId: recurrence.activityId,
        subjectUserId: userId,
        revisions: recurrenceRevisionRows(sqlite, userId, recurrenceId).map(mapRecurrenceRevision),
      };
    },
  });

const utcDay = (date: string) => Date.parse(`${date}T00:00:00Z`);
const dateFromUtcDay = (millis: number) => new Date(millis).toISOString().slice(0, 10);

const revisionAppliesOnDate = (revision: RecurrenceRevisionRow, date: string) => {
  const deltaDays = Math.floor(
    (utcDay(date) - utcDay(revision.effectiveFromLocalDate)) / 86_400_000,
  );
  if (deltaDays < 0) return false;
  if (revision.frequency === 'daily') return deltaDays % revision.interval === 0;
  const weekIndex = Math.floor(deltaDays / 7);
  if (weekIndex % revision.interval !== 0) return false;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (revision.frequency === 'specific_weekdays') {
    return parseJson<number[]>(revision.weekdaysJson).includes(weekday);
  }
  return weekday === new Date(`${revision.effectiveFromLocalDate}T00:00:00Z`).getUTCDay();
};

export const materializeActivityRecurrence = async (
  userId: string,
  recurrenceId: string,
  actor: ActivityMutationActor,
  input: MaterializeActivityRecurrenceApiInput,
) =>
  executeIdempotent<ActivityMaterializationResult>({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'materialize_activity_recurrence',
    route: '/api/v1/activity-recurrences/:id/materialize',
    semanticPayload: { recurrenceId, ...withoutIdempotencyKey(input) },
    statusCode: 200,
    userId,
    write: (sqlite) => {
      const recurrence = requireRecurrence(sqlite, userId, recurrenceId);
      const revisions = recurrenceRevisionRows(sqlite, userId, recurrenceId);
      const dayCount = Math.floor((utcDay(input.to) - utcDay(input.from)) / 86_400_000);
      if (dayCount < 0 || dayCount > 366) throw new ActivityInvalidRangeError();
      const created: ActivityAssignment[] = [];
      const existing: ActivityAssignment[] = [];
      for (let offset = 0; offset <= dayCount; offset += 1) {
        const date = dateFromUtcDay(utcDay(input.from) + offset * 86_400_000);
        const applicable = [...revisions]
          .reverse()
          .find((revision) => revision.effectiveFromLocalDate <= date);
        if (!applicable || !revisionAppliesOnDate(applicable, date)) continue;
        const found = sqlite
          .prepare(
            `select id from activity_assignments
              where recurrence_id = ? and planned_local_date = ? and user_id = ?`,
          )
          .get(recurrenceId, date, userId) as { id: string } | undefined;
        if (found) {
          existing.push(
            requiredValue(
              assignmentRows(sqlite, userId, recurrence.activityId).find(
                (entry) => entry.id === found.id,
              ),
              'Materialized assignment could not be read back.',
            ),
          );
          continue;
        }
        created.push(
          insertAssignment(sqlite, userId, recurrence.activityId, actor, {
            plannedLocalDate: date,
            recurrenceId,
            recurrenceRevisionId: applicable.id,
            timeZone: applicable.timeZone,
          }),
        );
      }
      return {
        recurrenceId,
        revisionId: recurrence.currentRevisionId,
        created,
        existing,
      };
    },
  });

export const createActivityOwnedLink = async (
  userId: string,
  activityId: string,
  actor: ActivityMutationActor,
  input: CreateActivityOwnedLinkApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'create_activity_owned_link',
    route: '/api/v1/activities/:id/links',
    semanticPayload: { activityId, ...withoutIdempotencyKey(input) },
    statusCode: 201,
    userId,
    write: (sqlite) => {
      const activity = requireActivity(sqlite, userId, activityId);
      const targetTable = {
        activity: 'canonical_activities',
        scheduled_workout: 'scheduled_workouts',
        workout_session: 'workout_sessions',
      }[input.target.kind];
      const found = sqlite
        .prepare(`select 1 from ${targetTable} where id = ? and user_id = ?`)
        .get(input.target.id, userId);
      if (!found) throw new ActivityOwnedLinkNotFoundError('Linked record was not found.');
      if (input.target.revisionId !== null) {
        if (input.target.kind !== 'activity') {
          throw new ActivityOwnedLinkNotFoundError('Linked record was not found.');
        }
        const revisionFound = sqlite
          .prepare(
            `select 1 from activity_revisions
              where id = ? and activity_id = ? and user_id = ?`,
          )
          .get(input.target.revisionId, input.target.id, userId);
        if (!revisionFound) {
          throw new ActivityOwnedLinkNotFoundError('Linked record was not found.');
        }
      }
      const timestamp = nowInstant();
      const linkId = randomUUID();
      sqlite
        .prepare(
          `insert into activity_owned_links
             (id, user_id, activity_id, target_kind, target_id, target_revision_id, relation, created_at)
           values (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          linkId,
          userId,
          activityId,
          input.target.kind,
          input.target.id,
          input.target.revisionId,
          input.relation,
          timestamp,
        );
      return {
        id: linkId,
        subjectUserId: userId,
        source: {
          kind: 'activity' as const,
          id: activityId,
          subjectUserId: userId,
          revisionId: activity.currentRevisionId,
        },
        target: {
          ...input.target,
          subjectUserId: userId,
        },
        relation: input.relation,
        createdAt: timestamp,
      };
    },
  });
