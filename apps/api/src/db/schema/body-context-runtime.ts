import type { ActivityJournalActor, PlanChangeEffect, Provenance } from '@pulse/shared';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export const bodyContextConcerns = sqliteTable(
  'body_context_concerns',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    bodyRegion: text('body_region'),
    symptomState: text('symptom_state').notNull(),
    managementState: text('management_state').notNull(),
    source: text('source_json', { mode: 'json' }).$type<Provenance>().notNull(),
    revision: integer('revision').notNull().default(1),
    currentRevisionId: text('current_revision_id').notNull(),
    legacyHealthConditionId: text('legacy_health_condition_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('body_context_concerns_user_state_idx').on(
      table.userId,
      table.managementState,
      table.updatedAt,
    ),
  ],
);

export const bodyContextConcernRevisions = sqliteTable(
  'body_context_concern_revisions',
  {
    id: text('id').primaryKey(),
    concernId: text('concern_id')
      .notNull()
      .references(() => bodyContextConcerns.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    priorRevisionId: text('prior_revision_id'),
    changeKind: text('change_kind').notNull(),
    snapshot: text('snapshot_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    correctedFields: text('corrected_fields_json', { mode: 'json' }).$type<Record<
      string,
      unknown
    > | null>(),
    reason: text('reason'),
    actor: text('actor_json', { mode: 'json' }).$type<ActivityJournalActor>().notNull(),
    decisionAuthority: text('decision_authority_json', { mode: 'json' }).$type<Record<
      string,
      unknown
    > | null>(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('body_context_concern_revisions_record_revision_unique').on(
      table.concernId,
      table.revision,
    ),
    index('body_context_concern_revisions_user_record_idx').on(
      table.userId,
      table.concernId,
      table.revision,
    ),
  ],
);

export const bodyContextCapabilities = sqliteTable(
  'body_context_capabilities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    state: text('state').notNull(),
    source: text('source_json', { mode: 'json' }).$type<Provenance>().notNull(),
    revision: integer('revision').notNull().default(1),
    currentRevisionId: text('current_revision_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('body_context_capabilities_user_state_idx').on(
      table.userId,
      table.state,
      table.updatedAt,
    ),
  ],
);

export const bodyContextCapabilityRevisions = sqliteTable(
  'body_context_capability_revisions',
  {
    id: text('id').primaryKey(),
    capabilityId: text('capability_id')
      .notNull()
      .references(() => bodyContextCapabilities.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    priorRevisionId: text('prior_revision_id'),
    changeKind: text('change_kind').notNull(),
    snapshot: text('snapshot_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    correctedFields: text('corrected_fields_json', { mode: 'json' }).$type<Record<
      string,
      unknown
    > | null>(),
    reason: text('reason'),
    actor: text('actor_json', { mode: 'json' }).$type<ActivityJournalActor>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('body_context_capability_revisions_record_revision_unique').on(
      table.capabilityId,
      table.revision,
    ),
    index('body_context_capability_revisions_user_record_idx').on(
      table.userId,
      table.capabilityId,
      table.revision,
    ),
  ],
);

export const bodyContextGuidance = sqliteTable(
  'body_context_guidance',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    concernId: text('concern_id').references(() => bodyContextConcerns.id, {
      onDelete: 'cascade',
    }),
    capabilityId: text('capability_id').references(() => bodyContextCapabilities.id, {
      onDelete: 'cascade',
    }),
    text: text('text').notNull(),
    source: text('source_json', { mode: 'json' }).$type<Provenance>().notNull(),
    state: text('state').notNull().default('current'),
    revision: integer('revision').notNull().default(1),
    currentRevisionId: text('current_revision_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('body_context_guidance_user_state_idx').on(table.userId, table.state, table.updatedAt),
    index('body_context_guidance_user_concern_idx').on(table.userId, table.concernId),
    index('body_context_guidance_user_capability_idx').on(table.userId, table.capabilityId),
  ],
);

export const bodyContextGuidanceRevisions = sqliteTable(
  'body_context_guidance_revisions',
  {
    id: text('id').primaryKey(),
    guidanceId: text('guidance_id')
      .notNull()
      .references(() => bodyContextGuidance.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    priorRevisionId: text('prior_revision_id'),
    changeKind: text('change_kind').notNull(),
    snapshot: text('snapshot_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    correctedFields: text('corrected_fields_json', { mode: 'json' }).$type<Record<
      string,
      unknown
    > | null>(),
    reason: text('reason'),
    actor: text('actor_json', { mode: 'json' }).$type<ActivityJournalActor>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('body_context_guidance_revisions_record_revision_unique').on(
      table.guidanceId,
      table.revision,
    ),
    index('body_context_guidance_revisions_user_record_idx').on(
      table.userId,
      table.guidanceId,
      table.revision,
    ),
  ],
);

export const bodyContextFlares = sqliteTable(
  'body_context_flares',
  {
    id: text('id').primaryKey(),
    concernId: text('concern_id')
      .notNull()
      .references(() => bodyContextConcerns.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    occurredAt: text('occurred_at').notNull(),
    localDate: text('local_date').notNull(),
    timeZone: text('time_zone').notNull(),
    observation: text('observation').notNull(),
    source: text('source_json', { mode: 'json' }).$type<Provenance>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('body_context_flares_user_date_idx').on(table.userId, table.localDate, table.occurredAt),
    index('body_context_flares_user_concern_idx').on(table.userId, table.concernId),
  ],
);

export const bodyContextFlareFollowUps = sqliteTable(
  'body_context_flare_follow_ups',
  {
    id: text('id').primaryKey(),
    flareId: text('flare_id')
      .notNull()
      .references(() => bodyContextFlares.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    prompt: text('prompt').notNull(),
    state: text('state').notNull().default('pending'),
    answer: text('answer'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('body_context_flare_follow_ups_flare_key_unique').on(table.flareId, table.key),
    index('body_context_flare_follow_ups_user_state_idx').on(table.userId, table.state),
  ],
);

export const planChangeProposals = sqliteTable(
  'plan_change_proposals',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    state: text('state').notNull().default('proposed'),
    revision: integer('revision').notNull().default(1),
    currentRevisionId: text('current_revision_id').notNull(),
    summary: text('summary').notNull(),
    targets: text('targets_json', { mode: 'json' }).$type<Record<string, unknown>[]>().notNull(),
    effects: text('effects_json', { mode: 'json' }).$type<PlanChangeEffect[]>().notNull(),
    sourceReferences: text('source_references_json', { mode: 'json' })
      .$type<Record<string, unknown>[]>()
      .notNull(),
    targetRevisionFingerprint: text('target_revision_fingerprint').notNull(),
    proposedBy: text('proposed_by_json', { mode: 'json' }).$type<ActivityJournalActor>().notNull(),
    proposedAt: text('proposed_at').notNull(),
    approval: text('approval_json', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    execution: text('execution_json', { mode: 'json' }).$type<Record<string, unknown> | null>(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('plan_change_proposals_user_state_idx').on(table.userId, table.state, table.updatedAt),
  ],
);

export const planChangeProposalRevisions = sqliteTable(
  'plan_change_proposal_revisions',
  {
    id: text('id').primaryKey(),
    proposalId: text('proposal_id')
      .notNull()
      .references(() => planChangeProposals.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    priorRevisionId: text('prior_revision_id'),
    summary: text('summary').notNull(),
    targets: text('targets_json', { mode: 'json' }).$type<Record<string, unknown>[]>().notNull(),
    effects: text('effects_json', { mode: 'json' }).$type<PlanChangeEffect[]>().notNull(),
    sourceReferences: text('source_references_json', { mode: 'json' })
      .$type<Record<string, unknown>[]>()
      .notNull(),
    targetRevisionFingerprint: text('target_revision_fingerprint').notNull(),
    proposedBy: text('proposed_by_json', { mode: 'json' }).$type<ActivityJournalActor>().notNull(),
    proposedAt: text('proposed_at').notNull(),
  },
  (table) => [
    uniqueIndex('plan_change_proposal_revisions_record_revision_unique').on(
      table.proposalId,
      table.revision,
    ),
    index('plan_change_proposal_revisions_user_record_idx').on(
      table.userId,
      table.proposalId,
      table.revision,
    ),
  ],
);

export const proposalApprovalStatements = sqliteTable(
  'proposal_approval_statements',
  {
    id: text('id').primaryKey(),
    proposalId: text('proposal_id')
      .notNull()
      .references(() => planChangeProposals.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    proposalRevisionId: text('proposal_revision_id').notNull(),
    targetRevisionFingerprint: text('target_revision_fingerprint').notNull(),
    statement: text('statement').notNull(),
    sourceId: text('source_id').notNull(),
    sourceOccurredAt: text('source_occurred_at').notNull(),
    recordedBy: text('recorded_by_json', { mode: 'json' }).$type<ActivityJournalActor>().notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('proposal_approval_statements_user_proposal_idx').on(table.userId, table.proposalId),
  ],
);

export const bodyContextIdempotencyReceipts = sqliteTable(
  'body_context_idempotency_receipts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),
    route: text('route').notNull(),
    operation: text('operation').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    statusCode: integer('status_code').notNull(),
    responseJson: text('response_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('body_context_receipts_scope_key_unique').on(
      table.userId,
      table.route,
      table.operation,
      table.idempotencyKey,
    ),
    index('body_context_receipts_user_created_idx').on(table.userId, table.createdAt),
  ],
);
