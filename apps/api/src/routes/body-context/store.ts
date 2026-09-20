import { createHash, randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import {
  bodyCapabilityDetailSchema,
  bodyConcernDetailSchema,
  bodyGuidanceDetailSchema,
  isConcernManagementTransitionAllowed,
  planChangeProposalSchema,
  proposalApprovalStatementSchema,
  type ActivityJournalActor,
  type ApprovePlanChangeProposalApiInput,
  type BodyContextProvenanceInput,
  type CorrectBodyCapabilityApiInput,
  type CorrectBodyConcernApiInput,
  type CorrectBodyGuidanceApiInput,
  type CreateBodyCapabilityApiInput,
  type CreateBodyConcernApiInput,
  type CreateBodyGuidanceApiInput,
  type CreatePlanChangeProposalApiInput,
  type PlanChangeEffect,
  type PlanChangeProposal,
  type Provenance,
  type RecordBodyFlareApiInput,
  type RecordProposalApprovalStatementApiInput,
  type RevisePlanChangeProposalApiInput,
  type TransitionBodyConcernApiInput,
} from '@pulse/shared';

import { getApplicationNow } from '../../lib/clock.js';
import { getUserLocalDate } from '../../lib/user-time-zone.js';
import {
  rescheduleScheduledWorkoutGuarded,
  ScheduledWorkoutGuardConflictError,
} from '../scheduled-workouts/guarded-reschedule.js';

export type BodyContextActor = ActivityJournalActor;
type MutationResult<T> = { data: T; replayed: boolean; statusCode: number };

export class BodyContextNotFoundError extends Error {
  readonly code = 'BODY_CONTEXT_NOT_FOUND';
}
export class BodyContextOwnedLinkNotFoundError extends Error {
  readonly code = 'OWNED_LINK_NOT_FOUND';
}
export class BodyContextStaleRevisionError extends Error {
  readonly code = 'STALE_REVISION';
  constructor(
    readonly currentRevision: number | string,
    readonly expectedRevision: number | string,
  ) {
    super('The record changed before this write was applied.');
  }
}
export class BodyContextIdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSE';
  constructor() {
    super('The idempotency key was already used with a different request.');
  }
}
export class BodyContextInvalidTransitionError extends Error {
  readonly code = 'INVALID_MANAGEMENT_TRANSITION';
}
export class BodyContextApprovalRequiredError extends Error {
  readonly code = 'EXPLICIT_USER_APPROVAL_REQUIRED';

  constructor(message = 'An explicit user approval bound to this exact change is required.') {
    super(message);
  }
}
export class BodyContextProposalStaleError extends Error {
  readonly code = 'STALE_PROPOSAL';
}
export class BodyContextStaleTargetError extends Error {
  readonly code = 'STALE_TARGET';

  constructor(message = 'A proposal target changed or is no longer eligible.') {
    super(message);
  }
}
export class BodyContextTargetIneligibleError extends Error {
  readonly code = 'TARGET_NOT_ELIGIBLE';
}

const parseJson = <T>(value: string): T => JSON.parse(value) as T;
const requiredValue = <T>(value: T | null | undefined, message: string): T => {
  if (value === null || value === undefined) throw new Error(message);
  return value;
};
const instant = () => getApplicationNow().toISOString();
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
};
const fingerprint = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
const withoutKey = <T extends { idempotencyKey: string }>(input: T) => {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== 'idempotencyKey'),
  ) as Omit<T, 'idempotencyKey'>;
};
const provenance = (
  source: BodyContextProvenanceInput,
  actor: BodyContextActor,
  capturedAt: string,
): Provenance => ({ ...source, capturedAt, capturedBy: actor });
const getSqlite = async () => (await import('../../db/index.js')).sqlite;

const executeIdempotent = async <T>(options: {
  actor: BodyContextActor;
  idempotencyKey: string;
  operation: string;
  route: string;
  semanticPayload: unknown;
  statusCode: number;
  userId: string;
  write: (sqlite: Database.Database) => T;
}): Promise<MutationResult<T>> => {
  const sqlite = await getSqlite();
  const requestFingerprint = fingerprint(options.semanticPayload);
  return sqlite
    .transaction(() => {
      const prior = sqlite
        .prepare(
          `select request_fingerprint as requestFingerprint, status_code as statusCode,
                response_json as responseJson
           from body_context_idempotency_receipts
          where user_id = ? and route = ? and operation = ? and idempotency_key = ?`,
        )
        .get(options.userId, options.route, options.operation, options.idempotencyKey) as
        | { requestFingerprint: string; responseJson: string; statusCode: number }
        | undefined;
      if (prior) {
        if (prior.requestFingerprint !== requestFingerprint) {
          throw new BodyContextIdempotencyConflictError();
        }
        return {
          data: parseJson<T>(prior.responseJson),
          replayed: true,
          statusCode: prior.statusCode,
        };
      }
      const data = options.write(sqlite);
      sqlite
        .prepare(
          `insert into body_context_idempotency_receipts
          (id,user_id,actor_kind,actor_id,route,operation,idempotency_key,request_fingerprint,
           status_code,response_json,created_at) values (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          options.userId,
          options.actor.kind,
          options.actor.id,
          options.route,
          options.operation,
          options.idempotencyKey,
          requestFingerprint,
          options.statusCode,
          JSON.stringify(data),
          instant(),
        );
      return { data, replayed: false, statusCode: options.statusCode };
    })
    .immediate();
};

type ConcernRow = {
  bodyRegion: string | null;
  createdAt: string;
  currentRevisionId: string;
  id: string;
  label: string;
  legacyHealthConditionId: string | null;
  managementState: 'active' | 'monitoring' | 'maintenance' | 'resolved' | 'archived';
  revision: number;
  sourceJson: string;
  symptomState: 'affirmed' | 'denied' | 'unknown' | 'not_asked';
  updatedAt: string;
  userId: string;
};

const concernRow = (sqlite: Database.Database, userId: string, id: string) =>
  sqlite
    .prepare(
      `select id,user_id as userId,label,body_region as bodyRegion,symptom_state as symptomState,
              management_state as managementState,source_json as sourceJson,revision,
              current_revision_id as currentRevisionId,
              legacy_health_condition_id as legacyHealthConditionId,
              created_at as createdAt,updated_at as updatedAt
         from body_context_concerns where id=? and user_id=?`,
    )
    .get(id, userId) as ConcernRow | undefined;

const concernModel = (row: ConcernRow) => ({
  id: row.id,
  subjectUserId: row.userId,
  label: row.label,
  bodyRegion: row.bodyRegion,
  symptomState: row.symptomState,
  managementState: row.managementState,
  source: parseJson<Provenance>(row.sourceJson),
  currentRevisionId: row.currentRevisionId,
  revision: row.revision,
  legacyHealthConditionId: row.legacyHealthConditionId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const revisionModels = (
  sqlite: Database.Database,
  table: string,
  idColumn: string,
  userId: string,
  recordId: string,
) =>
  sqlite
    .prepare(
      `select id, ${idColumn} as recordId, user_id as subjectUserId, revision,
              prior_revision_id as priorRevisionId, change_kind as changeKind,
              snapshot_json as snapshotJson, corrected_fields_json as correctedFieldsJson,
              reason, actor_json as actorJson,
              ${table === 'body_context_concern_revisions' ? 'decision_authority_json' : 'null'} as decisionAuthorityJson,
              created_at as createdAt
         from ${table} where user_id=? and ${idColumn}=? order by revision asc`,
    )
    .all(userId, recordId)
    .map((row) => {
      const value = row as Record<string, unknown>;
      return {
        id: value.id,
        recordId: value.recordId,
        subjectUserId: value.subjectUserId,
        revision: value.revision,
        priorRevisionId: value.priorRevisionId,
        changeKind: value.changeKind,
        snapshot: parseJson(String(value.snapshotJson)),
        correctedFields: value.correctedFieldsJson
          ? parseJson(String(value.correctedFieldsJson))
          : null,
        reason: value.reason,
        actor: parseJson(String(value.actorJson)),
        decisionAuthority: value.decisionAuthorityJson
          ? parseJson(String(value.decisionAuthorityJson))
          : null,
        createdAt: value.createdAt,
      };
    });

const flareModels = (sqlite: Database.Database, userId: string, concernId: string) => {
  const rows = sqlite
    .prepare(
      `select id,concern_id as concernId,user_id as subjectUserId,occurred_at as occurredAt,
              local_date as localDate,time_zone as timeZone,observation,source_json as sourceJson,
              created_at as createdAt from body_context_flares
        where user_id=? and concern_id=? order by occurred_at asc,id asc`,
    )
    .all(userId, concernId) as Array<Record<string, unknown>>;
  const followUp = sqlite.prepare(
    `select id,key,prompt,state,answer from body_context_flare_follow_ups
      where user_id=? and flare_id=? order by created_at asc,id asc`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    subjectUserId: String(row.subjectUserId),
    concernId: String(row.concernId),
    occurredAt: String(row.occurredAt),
    localDate: String(row.localDate),
    timeZone: String(row.timeZone),
    observation: String(row.observation),
    symptomState: 'affirmed' as const,
    source: parseJson<Provenance>(String(row.sourceJson)),
    followUps: followUp.all(userId, row.id),
    createdAt: String(row.createdAt),
  }));
};

const concernDetail = (sqlite: Database.Database, userId: string, id: string) => {
  const row = concernRow(sqlite, userId, id);
  if (!row) throw new BodyContextNotFoundError();
  return bodyConcernDetailSchema.parse({
    concern: concernModel(row),
    revisions: revisionModels(sqlite, 'body_context_concern_revisions', 'concern_id', userId, id),
    flares: flareModels(sqlite, userId, id),
  });
};

const checkLegacyLink = (
  sqlite: Database.Database,
  userId: string,
  legacyHealthConditionId: string | null,
) => {
  if (!legacyHealthConditionId) return;
  const found = sqlite
    .prepare('select 1 from health_conditions where id=? and user_id=?')
    .get(legacyHealthConditionId, userId);
  if (!found) throw new BodyContextOwnedLinkNotFoundError();
};

export const listBodyConcerns = async (userId: string, page: number, limit: number) => {
  const sqlite = await getSqlite();
  const rows = sqlite
    .prepare(
      `select id,user_id as userId,label,body_region as bodyRegion,symptom_state as symptomState,
              management_state as managementState,source_json as sourceJson,revision,
              current_revision_id as currentRevisionId,
              legacy_health_condition_id as legacyHealthConditionId,
              created_at as createdAt,updated_at as updatedAt
         from body_context_concerns where user_id=? order by updated_at desc,id asc limit ? offset ?`,
    )
    .all(userId, limit, (page - 1) * limit) as ConcernRow[];
  const total = (
    sqlite
      .prepare('select count(*) as count from body_context_concerns where user_id=?')
      .get(userId) as { count: number }
  ).count;
  return { data: rows.map(concernModel), total };
};

export const getBodyConcern = async (userId: string, id: string) => {
  const sqlite = await getSqlite();
  const row = concernRow(sqlite, userId, id);
  return row ? concernDetail(sqlite, userId, id) : null;
};

export const createBodyConcern = async (
  userId: string,
  actor: BodyContextActor,
  input: CreateBodyConcernApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'create_concern',
    route: '/api/v1/body-context/concerns',
    semanticPayload: withoutKey(input),
    statusCode: 201,
    userId,
    write: (sqlite) => {
      checkLegacyLink(sqlite, userId, input.legacyHealthConditionId);
      const id = randomUUID();
      const revisionId = randomUUID();
      const timestamp = instant();
      const source = provenance(input.source, actor, timestamp);
      sqlite
        .prepare(
          `insert into body_context_concerns
            (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,
             current_revision_id,legacy_health_condition_id,created_at,updated_at)
           values (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          userId,
          input.label,
          input.bodyRegion,
          input.symptomState,
          input.managementState,
          JSON.stringify(source),
          1,
          revisionId,
          input.legacyHealthConditionId,
          timestamp,
          timestamp,
        );
      const snapshot = concernModel(
        requiredValue(concernRow(sqlite, userId, id), 'Created concern could not be read back.'),
      );
      sqlite
        .prepare(
          `insert into body_context_concern_revisions
            (id,concern_id,user_id,revision,prior_revision_id,change_kind,snapshot_json,
             corrected_fields_json,reason,actor_json,decision_authority_json,created_at)
           values (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          revisionId,
          id,
          userId,
          1,
          null,
          'created',
          JSON.stringify(snapshot),
          null,
          null,
          JSON.stringify(actor),
          null,
          timestamp,
        );
      return concernDetail(sqlite, userId, id);
    },
  });

const appendConcernRevision = (
  sqlite: Database.Database,
  current: ConcernRow,
  actor: BodyContextActor,
  values: {
    changeKind: 'correction' | 'transition' | 'flare';
    correctedFields: Record<string, unknown> | null;
    decisionAuthority?: Record<string, unknown> | null;
    label?: string;
    bodyRegion?: string | null;
    symptomState?: ConcernRow['symptomState'];
    managementState?: ConcernRow['managementState'];
    source?: Provenance;
    reason: string;
  },
) => {
  const revisionId = randomUUID();
  const nextRevision = current.revision + 1;
  const timestamp = instant();
  const result = sqlite
    .prepare(
      `update body_context_concerns
          set label=?,body_region=?,symptom_state=?,management_state=?,source_json=?,revision=?,
              current_revision_id=?,updated_at=? where id=? and user_id=? and revision=?`,
    )
    .run(
      values.label ?? current.label,
      values.bodyRegion === undefined ? current.bodyRegion : values.bodyRegion,
      values.symptomState ?? current.symptomState,
      values.managementState ?? current.managementState,
      JSON.stringify(values.source ?? parseJson(current.sourceJson)),
      nextRevision,
      revisionId,
      timestamp,
      current.id,
      current.userId,
      current.revision,
    );
  if (result.changes !== 1) {
    throw new BodyContextStaleRevisionError(
      concernRow(sqlite, current.userId, current.id)?.revision ?? 'missing',
      current.revision,
    );
  }
  const snapshot = concernModel(
    requiredValue(
      concernRow(sqlite, current.userId, current.id),
      'Updated concern could not be read back.',
    ),
  );
  sqlite
    .prepare(
      `insert into body_context_concern_revisions
        (id,concern_id,user_id,revision,prior_revision_id,change_kind,snapshot_json,
         corrected_fields_json,reason,actor_json,decision_authority_json,created_at)
       values (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      revisionId,
      current.id,
      current.userId,
      nextRevision,
      current.currentRevisionId,
      values.changeKind,
      JSON.stringify(snapshot),
      values.correctedFields ? JSON.stringify(values.correctedFields) : null,
      values.reason,
      JSON.stringify(actor),
      values.decisionAuthority ? JSON.stringify(values.decisionAuthority) : null,
      timestamp,
    );
};

export const correctBodyConcern = async (
  userId: string,
  id: string,
  actor: BodyContextActor,
  input: CorrectBodyConcernApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'correct_concern',
    route: '/api/v1/body-context/concerns/:id',
    semanticPayload: { id, ...withoutKey(input) },
    statusCode: 200,
    userId,
    write: (sqlite) => {
      const current = concernRow(sqlite, userId, id);
      if (!current) throw new BodyContextNotFoundError();
      if (current.revision !== input.expectedRevision) {
        throw new BodyContextStaleRevisionError(current.revision, input.expectedRevision);
      }
      appendConcernRevision(sqlite, current, actor, {
        changeKind: 'correction',
        correctedFields: input.correctedFields,
        ...input.correctedFields,
        source: input.correctedFields.source
          ? provenance(input.correctedFields.source, actor, instant())
          : undefined,
        reason: input.reason,
      });
      return concernDetail(sqlite, userId, id);
    },
  });

export const transitionBodyConcern = async (
  userId: string,
  id: string,
  actor: BodyContextActor,
  input: TransitionBodyConcernApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'transition_concern',
    route: '/api/v1/body-context/concerns/:id/transitions',
    semanticPayload: { id, ...withoutKey(input) },
    statusCode: 200,
    userId,
    write: (sqlite) => {
      const current = concernRow(sqlite, userId, id);
      if (!current) throw new BodyContextNotFoundError();
      if (current.revision !== input.expectedRevision) {
        throw new BodyContextStaleRevisionError(current.revision, input.expectedRevision);
      }
      if (!isConcernManagementTransitionAllowed(current.managementState, input.to)) {
        throw new BodyContextInvalidTransitionError('Invalid concern management transition.');
      }
      const requiresDecision = input.to === 'resolved' || input.to === 'archived';
      if (requiresDecision && !input.explicitDecision) {
        throw new BodyContextApprovalRequiredError('Resolution requires explicit user authority.');
      }
      if (input.explicitDecision?.kind === 'authenticated_user' && actor.kind !== 'user') {
        throw new BodyContextApprovalRequiredError('Agent credentials cannot impersonate a user.');
      }
      if (input.explicitDecision?.kind === 'agent_relay' && actor.kind !== 'agent_token') {
        throw new BodyContextApprovalRequiredError(
          'A relay decision must be recorded by an agent.',
        );
      }
      const authority = input.explicitDecision
        ? {
            ...input.explicitDecision,
            authorizingUserId: userId,
            relayedBy: input.explicitDecision.kind === 'agent_relay' ? actor : null,
          }
        : null;
      appendConcernRevision(sqlite, current, actor, {
        changeKind: 'transition',
        correctedFields: { managementState: input.to },
        managementState: input.to,
        source: provenance(input.source, actor, instant()),
        reason: input.reason,
        decisionAuthority: authority,
      });
      return concernDetail(sqlite, userId, id);
    },
  });

export const recordBodyFlare = async (
  userId: string,
  id: string,
  actor: BodyContextActor,
  input: RecordBodyFlareApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'record_flare',
    route: '/api/v1/body-context/concerns/:id/flares',
    semanticPayload: { id, ...withoutKey(input) },
    statusCode: 201,
    userId,
    write: (sqlite) => {
      const current = concernRow(sqlite, userId, id);
      if (!current) throw new BodyContextNotFoundError();
      const flareId = randomUUID();
      const timestamp = instant();
      const source = provenance(input.source, actor, timestamp);
      sqlite
        .prepare(
          `insert into body_context_flares
            (id,concern_id,user_id,occurred_at,local_date,time_zone,observation,source_json,created_at)
           values (?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          flareId,
          id,
          userId,
          input.occurredAt,
          input.localDate,
          input.timeZone,
          input.observation,
          JSON.stringify(source),
          timestamp,
        );
      const insertQuestion = sqlite.prepare(
        `insert into body_context_flare_follow_ups
          (id,flare_id,user_id,key,prompt,state,answer,created_at,updated_at)
         values (?,?,?,?,?,'pending',null,?,?)`,
      );
      for (const question of input.followUpQuestions) {
        insertQuestion.run(
          randomUUID(),
          flareId,
          userId,
          question.key,
          question.prompt,
          timestamp,
          timestamp,
        );
      }
      appendConcernRevision(sqlite, current, actor, {
        changeKind: 'flare',
        correctedFields: { symptomState: 'affirmed' },
        symptomState: 'affirmed',
        managementState: current.managementState === 'resolved' ? 'active' : undefined,
        source,
        reason: 'Flare recorded; management state is not resolved automatically.',
      });
      return requiredValue(
        flareModels(sqlite, userId, id).find((flare) => flare.id === flareId),
        'Created flare could not be read back.',
      );
    },
  });

type SimpleRow = {
  createdAt: string;
  currentRevisionId: string;
  id: string;
  label?: string;
  revision: number;
  sourceJson: string;
  state: string;
  updatedAt: string;
  userId: string;
};

const capabilityRow = (sqlite: Database.Database, userId: string, id: string) =>
  sqlite
    .prepare(
      `select id,user_id as userId,label,state,source_json as sourceJson,revision,
              current_revision_id as currentRevisionId,created_at as createdAt,updated_at as updatedAt
         from body_context_capabilities where id=? and user_id=?`,
    )
    .get(id, userId) as (SimpleRow & { label: string }) | undefined;
const capabilityModel = (row: SimpleRow & { label: string }) => ({
  id: row.id,
  subjectUserId: row.userId,
  label: row.label,
  state: row.state as 'developing' | 'stable' | 'limited' | 'unknown',
  source: parseJson<Provenance>(row.sourceJson),
  currentRevisionId: row.currentRevisionId,
  revision: row.revision,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
const capabilityDetail = (sqlite: Database.Database, userId: string, id: string) => {
  const row = capabilityRow(sqlite, userId, id);
  if (!row) throw new BodyContextNotFoundError();
  return bodyCapabilityDetailSchema.parse({
    capability: capabilityModel(row),
    revisions: revisionModels(
      sqlite,
      'body_context_capability_revisions',
      'capability_id',
      userId,
      id,
    ),
  });
};

export const listBodyCapabilities = async (userId: string, page: number, limit: number) => {
  const sqlite = await getSqlite();
  const rows = sqlite
    .prepare(
      `select id,user_id as userId,label,state,source_json as sourceJson,revision,
              current_revision_id as currentRevisionId,created_at as createdAt,updated_at as updatedAt
         from body_context_capabilities where user_id=? order by updated_at desc,id asc limit ? offset ?`,
    )
    .all(userId, limit, (page - 1) * limit) as Array<SimpleRow & { label: string }>;
  const total = (
    sqlite
      .prepare('select count(*) as count from body_context_capabilities where user_id=?')
      .get(userId) as { count: number }
  ).count;
  return { data: rows.map(capabilityModel), total };
};
export const getBodyCapability = async (userId: string, id: string) => {
  const sqlite = await getSqlite();
  return capabilityRow(sqlite, userId, id) ? capabilityDetail(sqlite, userId, id) : null;
};
export const createBodyCapability = async (
  userId: string,
  actor: BodyContextActor,
  input: CreateBodyCapabilityApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'create_capability',
    route: '/api/v1/body-context/capabilities',
    semanticPayload: withoutKey(input),
    statusCode: 201,
    userId,
    write: (sqlite) => {
      const id = randomUUID();
      const revisionId = randomUUID();
      const timestamp = instant();
      const source = provenance(input.source, actor, timestamp);
      sqlite
        .prepare(
          `insert into body_context_capabilities
            (id,user_id,label,state,source_json,revision,current_revision_id,created_at,updated_at)
           values (?,?,?,?,?,1,?,?,?)`,
        )
        .run(
          id,
          userId,
          input.label,
          input.state,
          JSON.stringify(source),
          revisionId,
          timestamp,
          timestamp,
        );
      const snapshot = capabilityModel(
        requiredValue(
          capabilityRow(sqlite, userId, id),
          'Created capability could not be read back.',
        ),
      );
      sqlite
        .prepare(
          `insert into body_context_capability_revisions
            (id,capability_id,user_id,revision,prior_revision_id,change_kind,snapshot_json,
             corrected_fields_json,reason,actor_json,created_at) values (?,?,?,1,null,'created',?,null,null,?,?)`,
        )
        .run(revisionId, id, userId, JSON.stringify(snapshot), JSON.stringify(actor), timestamp);
      return capabilityDetail(sqlite, userId, id);
    },
  });

export const correctBodyCapability = async (
  userId: string,
  id: string,
  actor: BodyContextActor,
  input: CorrectBodyCapabilityApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'correct_capability',
    route: '/api/v1/body-context/capabilities/:id',
    semanticPayload: { id, ...withoutKey(input) },
    statusCode: 200,
    userId,
    write: (sqlite) => {
      const current = capabilityRow(sqlite, userId, id);
      if (!current) throw new BodyContextNotFoundError();
      if (current.revision !== input.expectedRevision) {
        throw new BodyContextStaleRevisionError(current.revision, input.expectedRevision);
      }
      const revisionId = randomUUID();
      const timestamp = instant();
      const nextRevision = current.revision + 1;
      const source = input.correctedFields.source
        ? provenance(input.correctedFields.source, actor, timestamp)
        : parseJson(current.sourceJson);
      const result = sqlite
        .prepare(
          `update body_context_capabilities set label=?,state=?,source_json=?,revision=?,
                  current_revision_id=?,updated_at=? where id=? and user_id=? and revision=?`,
        )
        .run(
          input.correctedFields.label ?? current.label,
          input.correctedFields.state ?? current.state,
          JSON.stringify(source),
          nextRevision,
          revisionId,
          timestamp,
          id,
          userId,
          current.revision,
        );
      if (result.changes !== 1)
        throw new BodyContextStaleRevisionError('changed', current.revision);
      const snapshot = capabilityModel(
        requiredValue(
          capabilityRow(sqlite, userId, id),
          'Updated capability could not be read back.',
        ),
      );
      sqlite
        .prepare(
          `insert into body_context_capability_revisions
            (id,capability_id,user_id,revision,prior_revision_id,change_kind,snapshot_json,
             corrected_fields_json,reason,actor_json,created_at) values (?,?,?,?,?,'correction',?,?,?,?,?)`,
        )
        .run(
          revisionId,
          id,
          userId,
          nextRevision,
          current.currentRevisionId,
          JSON.stringify(snapshot),
          JSON.stringify(input.correctedFields),
          input.reason,
          JSON.stringify(actor),
          timestamp,
        );
      return capabilityDetail(sqlite, userId, id);
    },
  });

type GuidanceRow = SimpleRow & {
  capabilityId: string | null;
  concernId: string | null;
  text: string;
};
const guidanceRow = (sqlite: Database.Database, userId: string, id: string) =>
  sqlite
    .prepare(
      `select id,user_id as userId,concern_id as concernId,capability_id as capabilityId,text,state,
              source_json as sourceJson,revision,current_revision_id as currentRevisionId,
              created_at as createdAt,updated_at as updatedAt
         from body_context_guidance where id=? and user_id=?`,
    )
    .get(id, userId) as GuidanceRow | undefined;
const guidanceModel = (row: GuidanceRow) => ({
  id: row.id,
  subjectUserId: row.userId,
  concernId: row.concernId,
  capabilityId: row.capabilityId,
  text: row.text,
  source: parseJson<Provenance>(row.sourceJson),
  state: row.state as 'current' | 'superseded' | 'retired',
  currentRevisionId: row.currentRevisionId,
  revision: row.revision,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
const guidanceDetail = (sqlite: Database.Database, userId: string, id: string) => {
  const row = guidanceRow(sqlite, userId, id);
  if (!row) throw new BodyContextNotFoundError();
  return bodyGuidanceDetailSchema.parse({
    guidance: guidanceModel(row),
    revisions: revisionModels(sqlite, 'body_context_guidance_revisions', 'guidance_id', userId, id),
  });
};
const checkGuidanceLinks = (
  sqlite: Database.Database,
  userId: string,
  concernId: string | null,
  capabilityId: string | null,
) => {
  if (concernId && !concernRow(sqlite, userId, concernId)) {
    throw new BodyContextOwnedLinkNotFoundError();
  }
  if (capabilityId && !capabilityRow(sqlite, userId, capabilityId)) {
    throw new BodyContextOwnedLinkNotFoundError();
  }
};
export const listBodyGuidance = async (
  userId: string,
  page: number,
  limit: number,
  concernId?: string,
  capabilityId?: string,
) => {
  const sqlite = await getSqlite();
  const where = ['user_id=?'];
  const values: Array<string | number> = [userId];
  if (concernId) {
    where.push('concern_id=?');
    values.push(concernId);
  }
  if (capabilityId) {
    where.push('capability_id=?');
    values.push(capabilityId);
  }
  const clause = where.join(' and ');
  const rows = sqlite
    .prepare(
      `select id,user_id as userId,concern_id as concernId,capability_id as capabilityId,text,state,
              source_json as sourceJson,revision,current_revision_id as currentRevisionId,
              created_at as createdAt,updated_at as updatedAt
         from body_context_guidance where ${clause} order by updated_at desc,id asc limit ? offset ?`,
    )
    .all(...values, limit, (page - 1) * limit) as GuidanceRow[];
  const total = (
    sqlite
      .prepare(`select count(*) as count from body_context_guidance where ${clause}`)
      .get(...values) as { count: number }
  ).count;
  return { data: rows.map(guidanceModel), total };
};
export const getBodyGuidance = async (userId: string, id: string) => {
  const sqlite = await getSqlite();
  return guidanceRow(sqlite, userId, id) ? guidanceDetail(sqlite, userId, id) : null;
};
export const createBodyGuidance = async (
  userId: string,
  actor: BodyContextActor,
  input: CreateBodyGuidanceApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'create_guidance',
    route: '/api/v1/body-context/guidance',
    semanticPayload: withoutKey(input),
    statusCode: 201,
    userId,
    write: (sqlite) => {
      checkGuidanceLinks(sqlite, userId, input.concernId, input.capabilityId);
      const id = randomUUID();
      const revisionId = randomUUID();
      const timestamp = instant();
      const source = provenance(input.source, actor, timestamp);
      sqlite
        .prepare(
          `insert into body_context_guidance
            (id,user_id,concern_id,capability_id,text,source_json,state,revision,current_revision_id,
             created_at,updated_at) values (?,?,?,?,?,?,'current',1,?,?,?)`,
        )
        .run(
          id,
          userId,
          input.concernId,
          input.capabilityId,
          input.text,
          JSON.stringify(source),
          revisionId,
          timestamp,
          timestamp,
        );
      const snapshot = guidanceModel(
        requiredValue(guidanceRow(sqlite, userId, id), 'Created guidance could not be read back.'),
      );
      sqlite
        .prepare(
          `insert into body_context_guidance_revisions
            (id,guidance_id,user_id,revision,prior_revision_id,change_kind,snapshot_json,
             corrected_fields_json,reason,actor_json,created_at) values (?,?,?,1,null,'created',?,null,null,?,?)`,
        )
        .run(revisionId, id, userId, JSON.stringify(snapshot), JSON.stringify(actor), timestamp);
      return guidanceDetail(sqlite, userId, id);
    },
  });

export const correctBodyGuidance = async (
  userId: string,
  id: string,
  actor: BodyContextActor,
  input: CorrectBodyGuidanceApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'correct_guidance',
    route: '/api/v1/body-context/guidance/:id',
    semanticPayload: { id, ...withoutKey(input) },
    statusCode: 200,
    userId,
    write: (sqlite) => {
      const current = guidanceRow(sqlite, userId, id);
      if (!current) throw new BodyContextNotFoundError();
      if (current.revision !== input.expectedRevision) {
        throw new BodyContextStaleRevisionError(current.revision, input.expectedRevision);
      }
      const revisionId = randomUUID();
      const timestamp = instant();
      const nextRevision = current.revision + 1;
      const source = input.correctedFields.source
        ? provenance(input.correctedFields.source, actor, timestamp)
        : parseJson(current.sourceJson);
      const result = sqlite
        .prepare(
          `update body_context_guidance set text=?,state=?,source_json=?,revision=?,
                  current_revision_id=?,updated_at=? where id=? and user_id=? and revision=?`,
        )
        .run(
          input.correctedFields.text ?? current.text,
          input.correctedFields.state ?? current.state,
          JSON.stringify(source),
          nextRevision,
          revisionId,
          timestamp,
          id,
          userId,
          current.revision,
        );
      if (result.changes !== 1)
        throw new BodyContextStaleRevisionError('changed', current.revision);
      const snapshot = guidanceModel(
        requiredValue(guidanceRow(sqlite, userId, id), 'Updated guidance could not be read back.'),
      );
      sqlite
        .prepare(
          `insert into body_context_guidance_revisions
            (id,guidance_id,user_id,revision,prior_revision_id,change_kind,snapshot_json,
             corrected_fields_json,reason,actor_json,created_at) values (?,?,?,?,?,'correction',?,?,?,?,?)`,
        )
        .run(
          revisionId,
          id,
          userId,
          nextRevision,
          current.currentRevisionId,
          JSON.stringify(snapshot),
          JSON.stringify(input.correctedFields),
          input.reason,
          JSON.stringify(actor),
          timestamp,
        );
      return guidanceDetail(sqlite, userId, id);
    },
  });

type Target = {
  expectedRevision: number;
  reference: {
    id: string;
    kind: 'activity_assignment' | 'scheduled_workout';
    revisionId: string;
    subjectUserId: string;
  };
};
const targetsForEffects = (
  sqlite: Database.Database,
  userId: string,
  effects: PlanChangeEffect[],
  today: string,
): Target[] => {
  const seen = new Set<string>();
  return effects.map((effect) => {
    if (effect.plannedLocalDate < today) {
      throw new BodyContextTargetIneligibleError('Proposal effects must remain prospective.');
    }
    const key = `${effect.kind}:${effect.kind === 'activity_assignment_reschedule' ? effect.assignmentId : effect.scheduledWorkoutId}`;
    if (seen.has(key)) throw new BodyContextTargetIneligibleError('Duplicate proposal target.');
    seen.add(key);
    if (effect.kind === 'activity_assignment_reschedule') {
      const row = sqlite
        .prepare(
          `select revision,current_revision_id as currentRevisionId,state,planned_local_date as plannedLocalDate
             from activity_assignments where id=? and user_id=?`,
        )
        .get(effect.assignmentId, userId) as
        | { currentRevisionId: string; plannedLocalDate: string; revision: number; state: string }
        | undefined;
      if (!row) throw new BodyContextOwnedLinkNotFoundError();
      if (row.revision !== effect.expectedRevision) {
        throw new BodyContextStaleRevisionError(row.revision, effect.expectedRevision);
      }
      if (row.state !== 'planned' || row.plannedLocalDate < today) {
        throw new BodyContextTargetIneligibleError('Only upcoming planned activities can change.');
      }
      return {
        expectedRevision: row.revision,
        reference: {
          kind: 'activity_assignment' as const,
          id: effect.assignmentId,
          subjectUserId: userId,
          revisionId: row.currentRevisionId,
        },
      };
    }
    const row = sqlite
      .prepare(
        'select updated_at as updatedAt,date,session_id as sessionId from scheduled_workouts where id=? and user_id=?',
      )
      .get(effect.scheduledWorkoutId, userId) as
      | { date: string; sessionId: string | null; updatedAt: number }
      | undefined;
    if (!row) throw new BodyContextOwnedLinkNotFoundError();
    if (row.updatedAt !== effect.expectedUpdatedAt) {
      throw new BodyContextStaleRevisionError(row.updatedAt, effect.expectedUpdatedAt);
    }
    if (row.sessionId !== null || row.date < today) {
      throw new BodyContextTargetIneligibleError('Only upcoming unstarted workouts can change.');
    }
    return {
      expectedRevision: row.updatedAt,
      reference: {
        kind: 'scheduled_workout' as const,
        id: effect.scheduledWorkoutId,
        subjectUserId: userId,
        revisionId: String(row.updatedAt),
      },
    };
  });
};

const checkSourceReferences = (
  sqlite: Database.Database,
  userId: string,
  references: CreatePlanChangeProposalApiInput['sourceReferences'],
) => {
  for (const reference of references) {
    if (reference.subjectUserId !== userId) throw new BodyContextOwnedLinkNotFoundError();
    let revisionId: string | undefined;
    if (reference.kind === 'body_concern')
      revisionId = concernRow(sqlite, userId, reference.id)?.currentRevisionId;
    if (reference.kind === 'capability')
      revisionId = capabilityRow(sqlite, userId, reference.id)?.currentRevisionId;
    if (reference.kind === 'guidance')
      revisionId = guidanceRow(sqlite, userId, reference.id)?.currentRevisionId;
    if (!revisionId || reference.revisionId !== revisionId) {
      throw new BodyContextOwnedLinkNotFoundError();
    }
  }
};

type ProposalRow = {
  approvalJson: string | null;
  createdAt: string;
  currentRevisionId: string;
  effectsJson: string;
  executionJson: string | null;
  id: string;
  proposedAt: string;
  proposedByJson: string;
  revision: number;
  sourceReferencesJson: string;
  state: 'proposed' | 'approved' | 'stale';
  summary: string;
  targetRevisionFingerprint: string;
  targetsJson: string;
  updatedAt: string;
  userId: string;
};
const proposalRow = (sqlite: Database.Database, userId: string, id: string) =>
  sqlite
    .prepare(
      `select id,user_id as userId,state,revision,current_revision_id as currentRevisionId,summary,
              targets_json as targetsJson,effects_json as effectsJson,
              source_references_json as sourceReferencesJson,
              target_revision_fingerprint as targetRevisionFingerprint,
              proposed_by_json as proposedByJson,proposed_at as proposedAt,
              approval_json as approvalJson,execution_json as executionJson,
              created_at as createdAt,updated_at as updatedAt
         from plan_change_proposals where id=? and user_id=?`,
    )
    .get(id, userId) as ProposalRow | undefined;
const proposalModel = (sqlite: Database.Database, row: ProposalRow): PlanChangeProposal => {
  const revisions = sqlite
    .prepare(
      `select id,proposal_id as proposalId,user_id as subjectUserId,revision,
              prior_revision_id as priorRevisionId,summary,targets_json as targetsJson,
              effects_json as effectsJson,source_references_json as sourceReferencesJson,
              target_revision_fingerprint as targetRevisionFingerprint,
              proposed_by_json as proposedByJson,proposed_at as proposedAt
         from plan_change_proposal_revisions where user_id=? and proposal_id=? order by revision asc`,
    )
    .all(row.userId, row.id)
    .map((item) => {
      const value = item as Record<string, unknown>;
      return {
        id: value.id,
        proposalId: value.proposalId,
        subjectUserId: value.subjectUserId,
        revision: value.revision,
        priorRevisionId: value.priorRevisionId,
        summary: value.summary,
        targets: parseJson(String(value.targetsJson)),
        effects: parseJson(String(value.effectsJson)),
        sourceReferences: parseJson(String(value.sourceReferencesJson)),
        targetRevisionFingerprint: value.targetRevisionFingerprint,
        proposedBy: parseJson(String(value.proposedByJson)),
        proposedAt: value.proposedAt,
      };
    });
  return planChangeProposalSchema.parse({
    id: row.id,
    subjectUserId: row.userId,
    state: row.state,
    currentRevisionId: row.currentRevisionId,
    revision: row.revision,
    summary: row.summary,
    targets: parseJson(row.targetsJson),
    effects: parseJson(row.effectsJson),
    sourceReferences: parseJson(row.sourceReferencesJson),
    targetRevisionFingerprint: row.targetRevisionFingerprint,
    proposedBy: parseJson(row.proposedByJson),
    proposedAt: row.proposedAt,
    approval: row.approvalJson ? parseJson(row.approvalJson) : null,
    execution: row.executionJson ? parseJson(row.executionJson) : null,
    revisions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
};
export const getPlanChangeProposal = async (userId: string, id: string) => {
  const sqlite = await getSqlite();
  const row = proposalRow(sqlite, userId, id);
  return row ? proposalModel(sqlite, row) : null;
};

const writeProposalRevision = (
  sqlite: Database.Database,
  userId: string,
  proposalId: string,
  prior: ProposalRow | null,
  actor: BodyContextActor,
  summary: string,
  effects: PlanChangeEffect[],
  sourceReferences: CreatePlanChangeProposalApiInput['sourceReferences'],
  today: string,
) => {
  checkSourceReferences(sqlite, userId, sourceReferences);
  const targets = targetsForEffects(sqlite, userId, effects, today);
  const targetFingerprint = fingerprint({ effects, targets });
  const revisionId = randomUUID();
  const timestamp = instant();
  const revision = (prior?.revision ?? 0) + 1;
  if (!prior) {
    sqlite
      .prepare(
        `insert into plan_change_proposals
          (id,user_id,state,revision,current_revision_id,summary,targets_json,effects_json,
           source_references_json,target_revision_fingerprint,proposed_by_json,proposed_at,
           approval_json,execution_json,created_at,updated_at)
         values (?,?,'proposed',?,?,?,?,?,?,?,?,?,null,null,?,?)`,
      )
      .run(
        proposalId,
        userId,
        revision,
        revisionId,
        summary,
        JSON.stringify(targets),
        JSON.stringify(effects),
        JSON.stringify(sourceReferences),
        targetFingerprint,
        JSON.stringify(actor),
        timestamp,
        timestamp,
        timestamp,
      );
  } else {
    const result = sqlite
      .prepare(
        `update plan_change_proposals set state='proposed',revision=?,current_revision_id=?,summary=?,
                targets_json=?,effects_json=?,source_references_json=?,target_revision_fingerprint=?,
                proposed_by_json=?,proposed_at=?,approval_json=null,execution_json=null,updated_at=?
          where id=? and user_id=? and current_revision_id=? and state='proposed'`,
      )
      .run(
        revision,
        revisionId,
        summary,
        JSON.stringify(targets),
        JSON.stringify(effects),
        JSON.stringify(sourceReferences),
        targetFingerprint,
        JSON.stringify(actor),
        timestamp,
        timestamp,
        proposalId,
        userId,
        prior.currentRevisionId,
      );
    if (result.changes !== 1) throw new BodyContextProposalStaleError('Proposal changed.');
  }
  sqlite
    .prepare(
      `insert into plan_change_proposal_revisions
        (id,proposal_id,user_id,revision,prior_revision_id,summary,targets_json,effects_json,
         source_references_json,target_revision_fingerprint,proposed_by_json,proposed_at)
       values (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      revisionId,
      proposalId,
      userId,
      revision,
      prior?.currentRevisionId ?? null,
      summary,
      JSON.stringify(targets),
      JSON.stringify(effects),
      JSON.stringify(sourceReferences),
      targetFingerprint,
      JSON.stringify(actor),
      timestamp,
    );
  return proposalModel(
    sqlite,
    requiredValue(
      proposalRow(sqlite, userId, proposalId),
      'Proposal revision could not be read back.',
    ),
  );
};

export const createPlanChangeProposal = async (
  userId: string,
  actor: BodyContextActor,
  input: CreatePlanChangeProposalApiInput,
) => {
  const today = await getUserLocalDate(userId);
  return executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'create_proposal',
    route: '/api/v1/plan-change-proposals',
    semanticPayload: withoutKey(input),
    statusCode: 201,
    userId,
    write: (sqlite) =>
      writeProposalRevision(
        sqlite,
        userId,
        randomUUID(),
        null,
        actor,
        input.summary,
        input.effects,
        input.sourceReferences,
        today,
      ),
  });
};

export const revisePlanChangeProposal = async (
  userId: string,
  id: string,
  actor: BodyContextActor,
  input: RevisePlanChangeProposalApiInput,
) => {
  const today = await getUserLocalDate(userId);
  return executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'revise_proposal',
    route: '/api/v1/plan-change-proposals/:id',
    semanticPayload: { id, ...withoutKey(input) },
    statusCode: 200,
    userId,
    write: (sqlite) => {
      const current = proposalRow(sqlite, userId, id);
      if (!current) throw new BodyContextNotFoundError();
      if (current.currentRevisionId !== input.expectedProposalRevisionId) {
        throw new BodyContextProposalStaleError('Proposal revision is stale.');
      }
      return writeProposalRevision(
        sqlite,
        userId,
        id,
        current,
        actor,
        input.summary,
        input.effects,
        input.sourceReferences,
        today,
      );
    },
  });
};

export const recordProposalApprovalStatement = async (
  userId: string,
  id: string,
  actor: BodyContextActor,
  input: RecordProposalApprovalStatementApiInput,
) =>
  executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'record_approval_statement',
    route: '/api/v1/plan-change-proposals/:id/approval-statements',
    semanticPayload: { id, ...withoutKey(input) },
    statusCode: 201,
    userId,
    write: (sqlite) => {
      if (actor.kind !== 'agent_token') throw new BodyContextApprovalRequiredError();
      const proposal = proposalRow(sqlite, userId, id);
      if (!proposal) throw new BodyContextNotFoundError();
      if (
        proposal.currentRevisionId !== input.proposalRevisionId ||
        proposal.targetRevisionFingerprint !== input.targetRevisionFingerprint ||
        proposal.state !== 'proposed'
      ) {
        throw new BodyContextProposalStaleError(
          'Approval statement does not bind current proposal.',
        );
      }
      const statement = {
        id: randomUUID(),
        subjectUserId: userId,
        proposalId: id,
        proposalRevisionId: input.proposalRevisionId,
        targetRevisionFingerprint: input.targetRevisionFingerprint,
        statement: input.statement,
        sourceId: input.sourceId,
        sourceOccurredAt: input.sourceOccurredAt,
        recordedBy: actor,
        createdAt: instant(),
      };
      sqlite
        .prepare(
          `insert into proposal_approval_statements
            (id,proposal_id,user_id,proposal_revision_id,target_revision_fingerprint,statement,
             source_id,source_occurred_at,recorded_by_json,created_at) values (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          statement.id,
          id,
          userId,
          statement.proposalRevisionId,
          statement.targetRevisionFingerprint,
          statement.statement,
          statement.sourceId,
          statement.sourceOccurredAt,
          JSON.stringify(actor),
          statement.createdAt,
        );
      return proposalApprovalStatementSchema.parse(statement);
    },
  });

const validateProposalTargets = (
  sqlite: Database.Database,
  userId: string,
  proposal: ProposalRow,
  today: string,
) => {
  const effects = parseJson<PlanChangeEffect[]>(proposal.effectsJson);
  let targets: Target[];
  try {
    targets = targetsForEffects(sqlite, userId, effects, today);
  } catch (error) {
    if (
      error instanceof BodyContextStaleRevisionError ||
      error instanceof BodyContextTargetIneligibleError ||
      error instanceof BodyContextOwnedLinkNotFoundError
    ) {
      throw new BodyContextStaleTargetError();
    }
    throw error;
  }
  const expectedTargets = parseJson<Target[]>(proposal.targetsJson);
  const currentFingerprint = fingerprint({ effects, targets });
  if (
    currentFingerprint !== proposal.targetRevisionFingerprint ||
    JSON.stringify(canonicalize(targets)) !== JSON.stringify(canonicalize(expectedTargets))
  ) {
    throw new BodyContextStaleTargetError();
  }
  return effects;
};

const executeActivityEffect = (
  sqlite: Database.Database,
  userId: string,
  actor: BodyContextActor,
  effect: Extract<PlanChangeEffect, { kind: 'activity_assignment_reschedule' }>,
) => {
  const current = sqlite
    .prepare(
      `select revision,current_revision_id as currentRevisionId,recurrence_revision_id as recurrenceRevisionId,
              state from activity_assignments where id=? and user_id=?`,
    )
    .get(effect.assignmentId, userId) as
    | {
        currentRevisionId: string;
        recurrenceRevisionId: string | null;
        revision: number;
        state: string;
      }
    | undefined;
  if (!current || current.revision !== effect.expectedRevision || current.state !== 'planned') {
    throw new BodyContextProposalStaleError('Activity assignment changed.');
  }
  const revisionId = randomUUID();
  const timestamp = instant();
  const nextRevision = current.revision + 1;
  const result = sqlite
    .prepare(
      `update activity_assignments set planned_local_date=?,time_zone=?,revision=?,current_revision_id=?,updated_at=?
        where id=? and user_id=? and revision=? and state='planned'`,
    )
    .run(
      effect.plannedLocalDate,
      effect.timeZone,
      nextRevision,
      revisionId,
      timestamp,
      effect.assignmentId,
      userId,
      current.revision,
    );
  if (result.changes !== 1) throw new BodyContextProposalStaleError('Activity assignment changed.');
  sqlite
    .prepare(
      `insert into activity_assignment_revisions
        (id,assignment_id,user_id,revision,prior_revision_id,planned_local_date,time_zone,
         recurrence_revision_id,state,reason,actor_json,created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      revisionId,
      effect.assignmentId,
      userId,
      nextRevision,
      current.currentRevisionId,
      effect.plannedLocalDate,
      effect.timeZone,
      current.recurrenceRevisionId,
      current.state,
      effect.reason,
      JSON.stringify(actor),
      timestamp,
    );
  return { kind: effect.kind, id: effect.assignmentId, revision: nextRevision };
};

const executeScheduledWorkoutEffect = (
  sqlite: Database.Database,
  userId: string,
  effect: Extract<PlanChangeEffect, { kind: 'scheduled_workout_reschedule' }>,
) => {
  try {
    const result = rescheduleScheduledWorkoutGuarded({
      sqlite,
      userId,
      scheduledWorkoutId: effect.scheduledWorkoutId,
      expectedUpdatedAt: effect.expectedUpdatedAt,
      plannedLocalDate: effect.plannedLocalDate,
    });
    return { kind: effect.kind, ...result };
  } catch (error) {
    if (error instanceof ScheduledWorkoutGuardConflictError) {
      throw new BodyContextStaleTargetError();
    }
    throw error;
  }
};

export const approvePlanChangeProposal = async (
  userId: string,
  id: string,
  actor: BodyContextActor,
  input: ApprovePlanChangeProposalApiInput,
) => {
  const today = await getUserLocalDate(userId);
  return executeIdempotent({
    actor,
    idempotencyKey: input.idempotencyKey,
    operation: 'approve_proposal',
    route: '/api/v1/plan-change-proposals/:id/approval',
    semanticPayload: { id, ...withoutKey(input) },
    statusCode: 200,
    userId,
    write: (sqlite) => {
      const proposal = proposalRow(sqlite, userId, id);
      if (!proposal) throw new BodyContextNotFoundError();
      if (
        proposal.state !== 'proposed' ||
        proposal.currentRevisionId !== input.proposalRevisionId ||
        proposal.targetRevisionFingerprint !== input.targetRevisionFingerprint
      ) {
        throw new BodyContextProposalStaleError('Approval does not bind current proposal.');
      }
      let statementId: string | null = null;
      if (actor.kind === 'agent_token') {
        if (!input.relayApprovalStatementId) throw new BodyContextApprovalRequiredError();
        const statement = sqlite
          .prepare(
            `select id from proposal_approval_statements where id=? and proposal_id=? and user_id=?
              and proposal_revision_id=? and target_revision_fingerprint=?`,
          )
          .get(
            input.relayApprovalStatementId,
            id,
            userId,
            input.proposalRevisionId,
            input.targetRevisionFingerprint,
          ) as { id: string } | undefined;
        if (!statement) throw new BodyContextApprovalRequiredError();
        statementId = statement.id;
      } else if (actor.kind !== 'user') {
        throw new BodyContextApprovalRequiredError();
      }
      const effects = validateProposalTargets(sqlite, userId, proposal, today);
      const executionEffects = effects.map((effect) =>
        effect.kind === 'activity_assignment_reschedule'
          ? executeActivityEffect(sqlite, userId, actor, effect)
          : executeScheduledWorkoutEffect(sqlite, userId, effect),
      );
      const approvedAt = instant();
      const approval = {
        proposalRevisionId: input.proposalRevisionId,
        targetRevisionFingerprint: input.targetRevisionFingerprint,
        approvedBy: { kind: 'user' as const, id: userId, label: null },
        relayedBy: actor.kind === 'agent_token' ? actor : null,
        approvalStatementId: statementId,
        approvedAt,
      };
      const execution = { executedAt: approvedAt, effects: executionEffects };
      const result = sqlite
        .prepare(
          `update plan_change_proposals set state='approved',approval_json=?,execution_json=?,updated_at=?
            where id=? and user_id=? and state='proposed' and current_revision_id=?
              and target_revision_fingerprint=?`,
        )
        .run(
          JSON.stringify(approval),
          JSON.stringify(execution),
          approvedAt,
          id,
          userId,
          input.proposalRevisionId,
          input.targetRevisionFingerprint,
        );
      if (result.changes !== 1) throw new BodyContextProposalStaleError('Proposal changed.');
      return proposalModel(
        sqlite,
        requiredValue(proposalRow(sqlite, userId, id), 'Approved proposal could not be read back.'),
      );
    },
  });
};
