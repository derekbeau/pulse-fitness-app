import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

import {
  applyFeedbackPrecautionDecisionInputSchema,
  FEEDBACK_PLANNING_SET_LIMIT,
  feedbackPlanningContextResponseSchema,
  feedbackPlanningEvidenceSchema,
  feedbackPrecautionDecisionSchema,
  workoutFeedbackAnswerRevisionSchema,
  workoutFeedbackQuestionDefinitionSchema,
  type ApplyFeedbackPrecautionDecisionInput,
  type FeedbackPlanningContextQuery,
  type FeedbackPlanningContextResponse,
  type FeedbackPlanningDependency,
  type FeedbackPlanningEvidence,
  type FeedbackPrecautionDecision,
} from '@pulse/shared';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import {
  feedbackMigrationLedger,
  feedbackNoteDispositions,
  feedbackProvenanceAudit,
  scheduledWorkoutExercises,
  scheduledWorkouts,
  sessionSets,
  workoutFeedbackAnswerCurrent,
  workoutFeedbackAnswerRevisions,
  workoutFeedbackPlanningDecisionResponses,
  workoutFeedbackPlanningDecisions,
  workoutFeedbackQuestionDefinitions,
  workoutFeedbackQuestionListRevisions,
  workoutFeedbackQuestionLists,
  workoutSessions,
} from '../../db/schema/index.js';
import { parseWorkoutSessionExerciseProgrammingNotes } from '../../db/schema/workout-session-programming-notes.js';
import { getApplicationNowMs } from '../../lib/clock.js';
import { addUtcDays } from '../../lib/date.js';

type PulseDb = typeof import('../../db/index.js').db;
type PulseTx = Parameters<Parameters<PulseDb['transaction']>[0]>[0];
type FeedbackDatabase = PulseDb | PulseTx;

export type FeedbackPlanningActor = {
  kind: 'agent_token';
  id: string;
  label: string;
};

type RawEvidenceRow = {
  definitionRowId: string;
  definition: string;
  responseRevisionId: string | null;
  answer: string | null;
  sessionId: string;
  workoutName: string;
  date: string;
  startedAt: number;
  completedAt: number | null;
  updatedAt: number;
  deletedAt: string | null;
  answerSetUpdatedAt: number | null;
};

type DecisionRow = typeof workoutFeedbackPlanningDecisions.$inferSelect;

export class FeedbackPlanningNotFoundError extends Error {}
export class FeedbackPlanningConflictError extends Error {}
export class FeedbackPlanningInvalidDecisionError extends Error {}
export class FeedbackPlanningIdempotencyConflictError extends Error {}

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
};

const stableJson = (value: unknown) => JSON.stringify(stableValue(value));
const fingerprint = (value: unknown) =>
  createHash('sha256').update(stableJson(value)).digest('hex');
const hashText = (value: string) => createHash('sha256').update(value).digest('hex');

const pageMeta = (page: number, limit: number, total: number, itemCount: number) => ({
  page,
  limit,
  total,
  hasMore: (page - 1) * limit + itemCount < total,
});

const exactText = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
};

function sessionDependencies(
  database: FeedbackDatabase,
  row: RawEvidenceRow,
): FeedbackPlanningDependency[] {
  const sets = database
    .select({
      id: sessionSets.id,
      exerciseId: sessionSets.exerciseId,
      exerciseIdSnapshot: sessionSets.exerciseIdSnapshot,
      exerciseNameSnapshot: sessionSets.exerciseNameSnapshot,
      setNumber: sessionSets.setNumber,
      weight: sessionSets.weight,
      reps: sessionSets.reps,
      seconds: sessionSets.seconds,
      distance: sessionSets.distance,
      rpe: sessionSets.rpe,
      rir: sessionSets.rir,
      completed: sessionSets.completed,
      skipped: sessionSets.skipped,
      notes: sessionSets.notes,
    })
    .from(sessionSets)
    .where(eq(sessionSets.sessionId, row.sessionId))
    .orderBy(asc(sessionSets.orderIndex), asc(sessionSets.setNumber), asc(sessionSets.id))
    .all();
  const noteStates = database
    .select({
      id: feedbackNoteDispositions.id,
      checksum: feedbackNoteDispositions.noteChecksum,
      state: feedbackNoteDispositions.state,
      reason: feedbackNoteDispositions.reason,
      rolledBackAt: feedbackNoteDispositions.rolledBackAt,
    })
    .from(feedbackNoteDispositions)
    .where(
      and(
        eq(feedbackNoteDispositions.userId, getEvidenceOwner(database, row.sessionId)),
        eq(feedbackNoteDispositions.kind, 'session'),
        eq(feedbackNoteDispositions.parentId, row.sessionId),
      ),
    )
    .orderBy(asc(feedbackNoteDispositions.classifiedAt), asc(feedbackNoteDispositions.id))
    .all();
  const migration = database
    .select({
      sourceChecksum: feedbackMigrationLedger.sourceChecksum,
      projectedChecksum: feedbackMigrationLedger.projectedChecksum,
      sourceVersion: feedbackMigrationLedger.sourceVersion,
      reason: feedbackMigrationLedger.reason,
      rolledBackAt: feedbackMigrationLedger.rolledBackAt,
    })
    .from(feedbackMigrationLedger)
    .where(eq(feedbackMigrationLedger.sessionId, row.sessionId))
    .all();
  const provenance = database
    .select({
      sourceChecksum: feedbackProvenanceAudit.sourceChecksum,
      projectedChecksum: feedbackProvenanceAudit.projectedChecksum,
      sourceVersion: feedbackProvenanceAudit.sourceVersion,
      reason: feedbackProvenanceAudit.reason,
    })
    .from(feedbackProvenanceAudit)
    .where(eq(feedbackProvenanceAudit.sessionId, row.sessionId))
    .orderBy(asc(feedbackProvenanceAudit.classifiedAt), asc(feedbackProvenanceAudit.sourceChecksum))
    .all();

  return [
    {
      kind: 'session',
      id: row.sessionId,
      version: stableJson({ updatedAt: row.updatedAt, deletedAt: row.deletedAt }),
    },
    { kind: 'session_sets', id: row.sessionId, version: fingerprint(sets) },
    { kind: 'note_disposition', id: row.sessionId, version: fingerprint(noteStates) },
    {
      kind: 'migration_classification',
      id: row.sessionId,
      version: fingerprint({ migration, provenance }),
    },
  ];
}

function getEvidenceOwner(database: FeedbackDatabase, sessionId: string): string {
  const owner = database
    .select({ userId: workoutSessions.userId })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId))
    .limit(1)
    .get();
  return owner?.userId ?? '__unavailable__';
}

function mapEvidence(
  database: FeedbackDatabase,
  row: RawEvidenceRow,
  projection: 'current' | 'historical',
): FeedbackPlanningEvidence {
  const definition = workoutFeedbackQuestionDefinitionSchema.parse(JSON.parse(row.definition));
  const answer = row.answer
    ? workoutFeedbackAnswerRevisionSchema.parse(JSON.parse(row.answer))
    : null;
  const sourceAvailability = row.deletedAt === null ? 'available' : 'soft_deleted';
  const nonAnswerState = answer === null || answer.state !== 'answered';
  const legacy = definition.sourceKind === 'legacy_import';
  const classification = legacy
    ? 'legacy_untrusted'
    : projection === 'historical'
      ? 'historical_observation'
      : nonAnswerState
        ? 'unknown_skipped_unanswered'
        : 'current_explicit';
  const dependencies: FeedbackPlanningDependency[] = [
    {
      kind: 'question_revision',
      id: definition.revisionId,
      version: fingerprint(definition),
    },
    ...(answer && row.responseRevisionId
      ? [
          {
            kind: 'answer_revision' as const,
            id: row.responseRevisionId,
            version: stableJson({
              revision: answer.revision,
              projection,
              answer: fingerprint(answer),
            }),
          },
        ]
      : []),
    ...sessionDependencies(database, row),
  ];
  const stalenessReasons = [
    ...(row.deletedAt === null ? [] : ['source_soft_deleted']),
    ...(projection === 'historical' ? ['superseded_by_answer_revision'] : []),
  ];
  const sourceLink = row.deletedAt === null ? `/api/v1/workout-sessions/${row.sessionId}` : null;

  return feedbackPlanningEvidenceSchema.parse({
    id: row.responseRevisionId ?? `missing:${row.definitionRowId}:${row.sessionId}`,
    projection,
    classification,
    actionable:
      projection === 'current' &&
      !legacy &&
      answer?.state === 'answered' &&
      sourceAvailability === 'available',
    contentRole: 'quoted_data',
    question: {
      id: definition.id,
      version: definition.version,
      revisionId: definition.revisionId,
      priorRevisionId: definition.priorRevisionId,
      prompt: definition.prompt,
      type: definition.type,
      timing: definition.timing,
      sourceKind: definition.sourceKind,
      sourceActorId: definition.sourceActorId,
      sourceActorName: definition.sourceActorName,
      authoredAt: definition.authoredAt,
    },
    answer: {
      responseId: answer?.responseId ?? null,
      responseRevisionId: row.responseRevisionId,
      revision: answer?.revision ?? null,
      priorRevisionId: answer?.priorRevisionId ?? null,
      state: answer?.state ?? 'missing',
      nativeType: definition.type,
      nativeValue: answer?.value ?? null,
      exactText: exactText(answer?.value),
      notes: answer?.notes ?? null,
      answeredAt: answer?.answeredAt ?? null,
      respondentSource: answer?.respondentSource ?? null,
      respondentActorId: answer?.respondentActorId ?? null,
    },
    session: {
      id: row.sessionId,
      workoutName: row.workoutName,
      date: row.date,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      updatedAt: row.updatedAt,
    },
    context: {
      exerciseId: definition.exerciseIdSnapshot ?? null,
      exerciseName: definition.exerciseNameSnapshot ?? null,
      bodyRegion: definition.bodyRegion ?? null,
      laterality: definition.laterality ?? null,
      concernRef: definition.concernRef ?? null,
      label: definition.contextLabel ?? null,
    },
    source: {
      kind: answer ? 'native_feedback_response' : 'missing_native_response',
      availability: sourceAvailability,
      link: sourceLink,
      locator: {
        route: `/api/v1/workout-sessions/${row.sessionId}`,
        entityType: answer ? 'workout_feedback_answer' : 'workout_feedback_question',
        entityId: row.responseRevisionId ?? definition.revisionId,
        sessionId: row.sessionId,
      },
      lastUpdatedAt: row.answerSetUpdatedAt ?? row.updatedAt,
      stale: stalenessReasons.length > 0,
      stalenessReasons,
    },
    dependencies,
    dependencyFingerprint: fingerprint({ definition, answer, dependencies }),
  });
}

const currentRelation = `FROM workout_feedback_question_definitions d
JOIN workout_feedback_question_list_revisions lr ON lr.id=d.list_revision_id
JOIN workout_feedback_question_lists l ON l.id=lr.list_id AND l.current_revision=lr.revision AND l.scope_kind='session'
JOIN workout_sessions s ON s.id=l.scope_id AND s.user_id=l.user_id
LEFT JOIN workout_feedback_answer_sets aset ON aset.user_id=l.user_id AND aset.session_id=s.id
LEFT JOIN workout_feedback_answer_current c ON c.answer_set_id=aset.id AND c.question_id=d.question_id AND c.definition_version=d.definition_version
LEFT JOIN workout_feedback_answer_revisions ar ON ar.id=c.response_revision_id
WHERE l.user_id=? AND (? IS NULL OR s.date>=?)`;

const historyRelation = `FROM workout_feedback_answer_revisions ar
JOIN workout_sessions s ON s.id=ar.session_id AND s.user_id=ar.user_id
JOIN workout_feedback_question_lists l ON l.user_id=ar.user_id AND l.scope_kind='session' AND l.scope_id=ar.session_id
JOIN workout_feedback_question_definitions d ON d.id=(
 SELECT d2.id FROM workout_feedback_question_definitions d2
 JOIN workout_feedback_question_list_revisions lr2 ON lr2.id=d2.list_revision_id
 WHERE lr2.list_id=l.id AND d2.question_id=ar.question_id AND d2.definition_version=ar.definition_version
 ORDER BY lr2.revision DESC LIMIT 1
)
LEFT JOIN workout_feedback_answer_current c ON c.response_revision_id=ar.id AND EXISTS(
 SELECT 1 FROM workout_feedback_question_list_revisions current_lr
 JOIN workout_feedback_question_definitions current_d ON current_d.list_revision_id=current_lr.id
 WHERE current_lr.list_id=l.id AND current_lr.revision=l.current_revision
 AND current_d.question_id=ar.question_id AND current_d.definition_version=ar.definition_version
)
LEFT JOIN workout_feedback_answer_sets aset ON aset.id=ar.answer_set_id
WHERE ar.user_id=? AND c.response_revision_id IS NULL AND (? IS NULL OR s.date>=?)`;

function readEvidencePage(
  database: FeedbackDatabase,
  sqlite: Database.Database,
  userId: string,
  from: string | null,
  query: FeedbackPlanningContextQuery,
  projection: 'current' | 'historical',
) {
  const relation = projection === 'current' ? currentRelation : historyRelation;
  const select = `SELECT d.id AS definitionRowId,d.definition,ar.id AS responseRevisionId,ar.answer,
    s.id AS sessionId,s.name AS workoutName,s.date,s.started_at AS startedAt,s.completed_at AS completedAt,
    s.updated_at AS updatedAt,s.deleted_at AS deletedAt,aset.updated_at AS answerSetUpdatedAt ${relation}`;
  const order =
    projection === 'current'
      ? " ORDER BY s.date DESC,COALESCE(ar.answered_at,json_extract(d.definition,'$.authoredAt')) DESC,s.id,d.order_index,d.id"
      : ' ORDER BY s.date DESC,ar.answered_at DESC,s.id,d.order_index,ar.revision DESC,ar.id';
  const parameters = [userId, from, from];
  const total = (
    sqlite.prepare(`SELECT count(*) AS total ${relation}`).get(...parameters) as { total: number }
  ).total;
  const offset = (query.page - 1) * query.limit;
  const rows = sqlite
    .prepare(`${select}${order} LIMIT ? OFFSET ?`)
    .all(...parameters, query.limit, offset) as RawEvidenceRow[];
  const items = rows.map((row) => mapEvidence(database, row, projection));
  return { items, ...pageMeta(query.page, query.limit, total, items.length) };
}

function decisionDependencies(
  database: FeedbackDatabase,
  sourceRow: typeof workoutSessions.$inferSelect,
  sourceText: string,
  responseRevisionIds: string[],
  concernRef: string,
): FeedbackPlanningDependency[] {
  const rows = database
    .select({
      id: workoutFeedbackAnswerRevisions.id,
      answer: workoutFeedbackAnswerRevisions.answer,
      sessionId: workoutFeedbackAnswerRevisions.sessionId,
      currentId: workoutFeedbackAnswerCurrent.responseRevisionId,
      definition: workoutFeedbackQuestionDefinitions.definition,
      definitionRowId: workoutFeedbackQuestionDefinitions.id,
    })
    .from(workoutFeedbackAnswerRevisions)
    .leftJoin(
      workoutFeedbackAnswerCurrent,
      eq(workoutFeedbackAnswerCurrent.responseRevisionId, workoutFeedbackAnswerRevisions.id),
    )
    .innerJoin(
      workoutFeedbackQuestionLists,
      and(
        eq(workoutFeedbackQuestionLists.userId, workoutFeedbackAnswerRevisions.userId),
        eq(workoutFeedbackQuestionLists.scopeKind, 'session'),
        eq(workoutFeedbackQuestionLists.scopeId, workoutFeedbackAnswerRevisions.sessionId),
      ),
    )
    .innerJoin(
      workoutFeedbackQuestionListRevisions,
      and(
        eq(workoutFeedbackQuestionListRevisions.listId, workoutFeedbackQuestionLists.id),
        eq(
          workoutFeedbackQuestionListRevisions.revision,
          workoutFeedbackQuestionLists.currentRevision,
        ),
      ),
    )
    .innerJoin(
      workoutFeedbackQuestionDefinitions,
      and(
        eq(
          workoutFeedbackQuestionDefinitions.listRevisionId,
          workoutFeedbackQuestionListRevisions.id,
        ),
        eq(
          workoutFeedbackQuestionDefinitions.questionId,
          workoutFeedbackAnswerRevisions.questionId,
        ),
        eq(
          workoutFeedbackQuestionDefinitions.definitionVersion,
          workoutFeedbackAnswerRevisions.definitionVersion,
        ),
      ),
    )
    .where(
      and(
        eq(workoutFeedbackAnswerRevisions.userId, sourceRow.userId),
        inArray(workoutFeedbackAnswerRevisions.id, responseRevisionIds),
      ),
    )
    .orderBy(asc(workoutFeedbackAnswerRevisions.id))
    .all();
  if (rows.length !== new Set(responseRevisionIds).size) {
    throw new FeedbackPlanningNotFoundError('Supporting feedback response was not found.');
  }
  const baseRows = rows.map((row) => ({
    kind: 'answer_revision' as const,
    id: row.id,
    version: stableJson({
      answer: fingerprint(row.answer),
      current: row.currentId === row.id,
      definition: fingerprint(row.definition),
    }),
  }));
  const concernEvidence = database
    .select({
      responseRevisionId: workoutFeedbackAnswerRevisions.id,
      sessionId: workoutFeedbackAnswerRevisions.sessionId,
      answer: workoutFeedbackAnswerRevisions.answer,
      definition: workoutFeedbackQuestionDefinitions.definition,
    })
    .from(workoutFeedbackAnswerCurrent)
    .innerJoin(
      workoutFeedbackAnswerRevisions,
      eq(workoutFeedbackAnswerRevisions.id, workoutFeedbackAnswerCurrent.responseRevisionId),
    )
    .innerJoin(
      workoutFeedbackQuestionLists,
      and(
        eq(workoutFeedbackQuestionLists.userId, workoutFeedbackAnswerCurrent.userId),
        eq(workoutFeedbackQuestionLists.scopeKind, 'session'),
        eq(workoutFeedbackQuestionLists.scopeId, workoutFeedbackAnswerCurrent.sessionId),
      ),
    )
    .innerJoin(
      workoutFeedbackQuestionListRevisions,
      and(
        eq(workoutFeedbackQuestionListRevisions.listId, workoutFeedbackQuestionLists.id),
        eq(
          workoutFeedbackQuestionListRevisions.revision,
          workoutFeedbackQuestionLists.currentRevision,
        ),
      ),
    )
    .innerJoin(
      workoutFeedbackQuestionDefinitions,
      and(
        eq(
          workoutFeedbackQuestionDefinitions.listRevisionId,
          workoutFeedbackQuestionListRevisions.id,
        ),
        eq(
          workoutFeedbackQuestionDefinitions.questionId,
          workoutFeedbackAnswerRevisions.questionId,
        ),
        eq(
          workoutFeedbackQuestionDefinitions.definitionVersion,
          workoutFeedbackAnswerRevisions.definitionVersion,
        ),
      ),
    )
    .where(
      and(
        eq(workoutFeedbackAnswerCurrent.userId, sourceRow.userId),
        sql`json_extract(${workoutFeedbackQuestionDefinitions.definition}, '$.concernRef') = ${concernRef}`,
      ),
    )
    .orderBy(
      asc(workoutFeedbackAnswerRevisions.sessionId),
      asc(workoutFeedbackAnswerRevisions.questionId),
      asc(workoutFeedbackAnswerRevisions.definitionVersion),
      asc(workoutFeedbackAnswerRevisions.id),
    )
    .all();
  const evidenceRow: RawEvidenceRow = {
    definitionRowId: rows[0]?.definitionRowId ?? 'decision-source',
    definition: JSON.stringify(rows[0]?.definition ?? {}),
    responseRevisionId: rows[0]?.id ?? null,
    answer: JSON.stringify(rows[0]?.answer ?? {}),
    sessionId: sourceRow.id,
    workoutName: sourceRow.name,
    date: sourceRow.date,
    startedAt: sourceRow.startedAt,
    completedAt: sourceRow.completedAt,
    updatedAt: sourceRow.updatedAt,
    deletedAt: sourceRow.deletedAt,
    answerSetUpdatedAt: null,
  };
  return [
    ...baseRows,
    {
      kind: 'concern_evidence',
      id: concernRef,
      version: fingerprint(concernEvidence),
    },
    ...sessionDependencies(database, evidenceRow),
    { kind: 'programming_note', id: sourceRow.id, version: hashText(sourceText) },
  ];
}

function staleDecision(database: FeedbackDatabase, row: DecisionRow): FeedbackPrecautionDecision {
  const reasons: string[] = [];
  const source = database
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, row.sourceSessionId), eq(workoutSessions.userId, row.userId)))
    .limit(1)
    .get();
  if (!source) reasons.push('source_unavailable');
  else {
    if (source.deletedAt !== null) reasons.push('source_soft_deleted');
    const key = `${row.sourceSection}::${row.sourceExerciseId}`;
    const currentText = parseWorkoutSessionExerciseProgrammingNotes(
      source.exerciseProgrammingNotes,
    )[key];
    if (currentText === undefined || currentText === null)
      reasons.push('programming_note_unavailable');
    else if (hashText(currentText) !== row.sourceTextHash) reasons.push('programming_note_changed');
    try {
      const currentDependencies = decisionDependencies(
        database,
        source,
        currentText ?? row.sourceText,
        row.input.supportingResponseRevisionIds,
        row.concernRef,
      );
      if (fingerprint(currentDependencies) !== row.dependencyFingerprint) {
        reasons.push('dependency_changed');
      }
      for (const dependency of currentDependencies) {
        if (
          dependency.kind === 'answer_revision' &&
          dependency.version?.includes('"current":false')
        ) {
          reasons.push('supporting_response_no_longer_current');
        }
      }
    } catch {
      reasons.push('supporting_response_unavailable');
    }
  }
  const supportingResponseRevisionIds = database
    .select({ id: workoutFeedbackPlanningDecisionResponses.responseRevisionId })
    .from(workoutFeedbackPlanningDecisionResponses)
    .where(eq(workoutFeedbackPlanningDecisionResponses.decisionId, row.id))
    .orderBy(asc(workoutFeedbackPlanningDecisionResponses.responseRevisionId))
    .all()
    .map(({ id }) => id);
  const targetMutations = row.targetMutations.map((mutation) => ({
    ...mutation,
    sourceLink: `/api/v1/scheduled-workouts/${mutation.scheduledWorkoutId}`,
    expectedProgrammingNotes: mutation.before,
    programmingNotes: mutation.after,
  }));
  return feedbackPrecautionDecisionSchema.parse({
    id: row.id,
    concernRef: row.concernRef,
    sequence: row.sequence,
    priorDecisionId: row.priorDecisionId,
    source: {
      kind: 'session_programming_note',
      sessionId: row.sourceSessionId,
      exerciseId: row.sourceExerciseId,
      section: row.sourceSection,
      exactText: row.sourceText,
      textHash: row.sourceTextHash,
      sourceTimestamp: row.sourceTimestamp,
      availability: source
        ? source.deletedAt === null
          ? 'available'
          : 'soft_deleted'
        : 'inaccessible',
      link:
        source && source.deletedAt === null
          ? `/api/v1/workout-sessions/${row.sourceSessionId}`
          : null,
      classification: row.sourceClassification,
    },
    supportingResponseRevisionIds,
    disposition: row.disposition,
    interpretation: row.interpretation,
    reason: row.reason,
    safeguards: row.input.safeguards,
    noGeneralSafeguardPresent: row.input.noGeneralSafeguardPresent,
    actor: { kind: 'agent_token', id: row.actorId, label: row.actorLabel },
    dependencies: row.dependencies,
    dependencyFingerprint: row.dependencyFingerprint,
    stale: reasons.length > 0,
    stalenessReasons: [...new Set(reasons)],
    scheduledNoteMutations: targetMutations,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  });
}

function readDecisionPage(
  database: FeedbackDatabase,
  userId: string,
  query: FeedbackPlanningContextQuery,
) {
  const total =
    database
      .select({ value: count() })
      .from(workoutFeedbackPlanningDecisions)
      .where(eq(workoutFeedbackPlanningDecisions.userId, userId))
      .get()?.value ?? 0;
  const rows = database
    .select()
    .from(workoutFeedbackPlanningDecisions)
    .where(eq(workoutFeedbackPlanningDecisions.userId, userId))
    .orderBy(
      desc(workoutFeedbackPlanningDecisions.createdAt),
      desc(workoutFeedbackPlanningDecisions.id),
    )
    .limit(query.limit)
    .offset((query.page - 1) * query.limit)
    .all();
  const items = rows.map((row) => staleDecision(database, row));
  return { items, total, hasMore: (query.page - 1) * query.limit + items.length < total };
}

function readAuditPage(
  sqlite: Database.Database,
  userId: string,
  from: string | null,
  query: FeedbackPlanningContextQuery,
) {
  const relation = `FROM (
    SELECT a.id,a.session_id AS sessionId,'submission_audit' AS sourceKind,a.received_at AS sourceTimestamp,NULL AS sourceChecksum,NULL AS sourceVersion,a.raw_payload AS rawPayload,a.classification AS reason,
      CASE WHEN s.deleted_at IS NULL THEN 'available' ELSE 'soft_deleted' END AS sourceAvailability,
      'legacy_untrusted' AS classification,s.date
    FROM feedback_submission_audit a JOIN workout_sessions s ON s.id=a.session_id AND s.user_id=a.user_id WHERE a.user_id=?
    UNION ALL
    SELECT a.source_checksum,a.session_id,'provenance_audit',CAST(strftime('%s',a.classified_at) AS INTEGER)*1000,a.source_checksum,a.source_version,a.raw_payload,a.reason,
      CASE WHEN s.deleted_at IS NULL THEN 'available' ELSE 'soft_deleted' END,
      CASE WHEN a.reason LIKE '%derived%' THEN 'legacy_derived' ELSE 'legacy_untrusted' END,s.date
    FROM feedback_provenance_audit a JOIN workout_sessions s ON s.id=a.session_id AND s.user_id=a.user_id WHERE a.user_id=?
    UNION ALL
    SELECT a.session_id || ':migration',a.session_id,'migration_ledger',CAST(strftime('%s',a.classified_at) AS INTEGER)*1000,a.source_checksum,a.source_version,a.source_evidence,a.reason,
      CASE WHEN s.deleted_at IS NOT NULL THEN 'soft_deleted' WHEN a.rolled_back_at IS NULL THEN 'available' ELSE 'superseded' END,
      CASE WHEN a.reason LIKE '%derived%' THEN 'legacy_derived' ELSE 'legacy_untrusted' END,s.date
    FROM feedback_migration_ledger a JOIN workout_sessions s ON s.id=a.session_id AND s.user_id=a.user_id WHERE a.user_id=?
    UNION ALL
    SELECT a.id,CASE WHEN a.kind='session' THEN a.parent_id ELSE a.source_session_id END,'note_disposition',CAST(strftime('%s',a.classified_at) AS INTEGER)*1000,a.note_checksum,NULL,a.raw_text,a.reason,
      CASE WHEN s.deleted_at IS NOT NULL THEN 'soft_deleted' WHEN a.rolled_back_at IS NOT NULL OR a.state='superseded' THEN 'superseded' ELSE 'legacy_untrusted' END,
      CASE WHEN a.construct='clinician_guidance' THEN 'clinician_authored_guidance' WHEN a.state='superseded' THEN 'superseded_interpretation' ELSE 'legacy_untrusted' END,COALESCE(s.date,'0000-01-01')
    FROM feedback_note_dispositions a LEFT JOIN workout_sessions s ON s.id=CASE WHEN a.kind='session' THEN a.parent_id ELSE a.source_session_id END AND s.user_id=a.user_id WHERE a.user_id=?
    UNION ALL
    SELECT 'legacy:' || s.id,s.id,'legacy_session_feedback',s.updated_at,NULL,NULL,s.feedback,'Legacy session feedback remains quarantined from actionable planning.',
      CASE WHEN s.deleted_at IS NULL THEN 'legacy_untrusted' ELSE 'soft_deleted' END,
      CASE WHEN json_valid(s.feedback) AND json_extract(s.feedback,'$.schemaVersion')=2 THEN 'legacy_derived' ELSE 'legacy_untrusted' END,s.date
    FROM workout_sessions s WHERE s.user_id=? AND s.feedback IS NOT NULL
  ) audit WHERE (? IS NULL OR audit.date>=?)`;
  const parameters = [userId, userId, userId, userId, userId, from, from];
  const total = (
    sqlite.prepare(`SELECT count(*) AS total ${relation}`).get(...parameters) as { total: number }
  ).total;
  const rows = sqlite
    .prepare(
      `SELECT id,sessionId,sourceKind,sourceTimestamp,sourceChecksum,sourceVersion,rawPayload,reason,sourceAvailability,classification ${relation}
       ORDER BY sourceTimestamp DESC,id LIMIT ? OFFSET ?`,
    )
    .all(...parameters, query.limit, (query.page - 1) * query.limit) as Array<{
    id: string;
    sessionId: string | null;
    sourceKind:
      | 'submission_audit'
      | 'provenance_audit'
      | 'migration_ledger'
      | 'note_disposition'
      | 'legacy_session_feedback';
    sourceTimestamp: number;
    sourceChecksum: string | null;
    sourceVersion: number | null;
    rawPayload: string | null;
    reason: string;
    sourceAvailability: 'available' | 'soft_deleted' | 'superseded' | 'legacy_untrusted';
    classification:
      | 'legacy_untrusted'
      | 'legacy_derived'
      | 'superseded_interpretation'
      | 'clinician_authored_guidance';
  }>;
  const items = rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    classification: row.classification,
    sourceKind: row.sourceKind,
    sourceTimestamp: row.sourceTimestamp,
    sourceChecksum: row.sourceChecksum,
    sourceVersion: row.sourceVersion,
    sourceLink:
      row.sessionId && row.sourceAvailability === 'available'
        ? `/api/v1/workout-sessions/${row.sessionId}/feedback-audit`
        : null,
    sourceAvailability: row.sourceAvailability,
    ...(query.view === 'export' && row.rawPayload !== null ? { rawPayload: row.rawPayload } : {}),
    reason: row.reason,
    contentRole: 'quoted_data' as const,
  }));
  return { items, total, hasMore: (query.page - 1) * query.limit + items.length < total };
}

function readSetEvidence(sqlite: Database.Database, userId: string, sessionIds: string[]) {
  if (sessionIds.length === 0) return { items: [], total: 0, hasMore: false };
  const placeholders = sessionIds.map(() => '?').join(',');
  const parameters = [userId, ...sessionIds];
  const relation = `FROM session_sets ss JOIN workout_sessions s ON s.id=ss.session_id AND s.user_id=? LEFT JOIN exercises e ON e.id=ss.exercise_id WHERE ss.session_id IN (${placeholders})`;
  const total = (
    sqlite.prepare(`SELECT count(*) AS total ${relation}`).get(...parameters) as { total: number }
  ).total;
  const rows = sqlite
    .prepare(
      `SELECT ss.id,ss.session_id AS sessionId,ss.exercise_id AS exerciseId,COALESCE(ss.exercise_name_snapshot,e.name) AS exerciseName,
       ss.set_number AS setNumber,ss.completed,ss.skipped,ss.reps,ss.rpe,ss.rir ${relation}
       ORDER BY s.date DESC,ss.session_id,ss.order_index,ss.set_number,ss.id LIMIT ?`,
    )
    .all(...parameters, FEEDBACK_PLANNING_SET_LIMIT) as Array<{
    id: string;
    sessionId: string;
    exerciseId: string | null;
    exerciseName: string | null;
    setNumber: number;
    completed: number;
    skipped: number;
    reps: number | null;
    rpe: number | null;
    rir: number | null;
  }>;
  return {
    items: rows.map((row) => ({
      ...row,
      completed: Boolean(row.completed),
      skipped: Boolean(row.skipped),
      sourceLink: `/api/v1/workout-sessions/${row.sessionId}`,
    })),
    total,
    hasMore: rows.length < total,
  };
}

type ComparableExposureSet = {
  section: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  seconds: number | null;
  distance: number | null;
};

function readComparableExposure(
  database: FeedbackDatabase,
  userId: string,
  sessionId: string,
  exerciseId: string,
): ComparableExposureSet[] {
  return database
    .select({
      section: sessionSets.section,
      setNumber: sessionSets.setNumber,
      weight: sessionSets.weight,
      reps: sessionSets.reps,
      seconds: sessionSets.seconds,
      distance: sessionSets.distance,
    })
    .from(sessionSets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionSets.sessionId))
    .where(
      and(
        eq(sessionSets.sessionId, sessionId),
        eq(sessionSets.exerciseId, exerciseId),
        eq(sessionSets.completed, true),
        eq(sessionSets.skipped, false),
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.status, 'completed'),
        isNull(workoutSessions.deletedAt),
      ),
    )
    .orderBy(asc(sessionSets.section), asc(sessionSets.setNumber), asc(sessionSets.id))
    .all();
}

function isLaterSession(
  candidate: { date: string; startedAt: number; id: string },
  baseline: FeedbackPlanningEvidence['session'],
) {
  if (candidate.date !== baseline.date) return candidate.date > baseline.date;
  if (candidate.startedAt !== baseline.startedAt) return candidate.startedAt > baseline.startedAt;
  return candidate.id > baseline.id;
}

function isComparableExposureAnswer(evidence: FeedbackPlanningEvidence) {
  if (
    evidence.question.timing !== 'next_check_in' ||
    evidence.answer.state !== 'answered' ||
    evidence.context.exerciseId === null ||
    evidence.source.availability !== 'available'
  ) {
    return false;
  }
  const nativeValue = evidence.answer.nativeValue;
  return !(
    nativeValue === 'Not tested' ||
    (Array.isArray(nativeValue) && nativeValue.includes('Not tested'))
  );
}

function changedExposureComparison(
  database: FeedbackDatabase,
  userId: string,
  evidence: FeedbackPlanningEvidence[],
): { changed: boolean; dependencies: FeedbackPlanningDependency[] } {
  const baseline = evidence.find(isComparableExposureAnswer);
  const exerciseId = baseline?.context.exerciseId;
  if (!baseline || !exerciseId) return { changed: false, dependencies: [] };
  const baselineExposure = readComparableExposure(
    database,
    userId,
    baseline.session.id,
    exerciseId,
  );
  if (baselineExposure.length === 0) return { changed: false, dependencies: [] };
  const candidates = database
    .select({
      id: workoutSessions.id,
      date: workoutSessions.date,
      startedAt: workoutSessions.startedAt,
      completedAt: workoutSessions.completedAt,
      updatedAt: workoutSessions.updatedAt,
      deletedAt: workoutSessions.deletedAt,
    })
    .from(workoutSessions)
    .innerJoin(
      sessionSets,
      and(
        eq(sessionSets.sessionId, workoutSessions.id),
        eq(sessionSets.exerciseId, exerciseId),
        eq(sessionSets.completed, true),
        eq(sessionSets.skipped, false),
      ),
    )
    .where(
      and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.status, 'completed'),
        isNull(workoutSessions.deletedAt),
      ),
    )
    .groupBy(workoutSessions.id)
    .orderBy(desc(workoutSessions.date), desc(workoutSessions.startedAt), desc(workoutSessions.id))
    .limit(50)
    .all();
  const latest = candidates.find((candidate) => isLaterSession(candidate, baseline.session));
  if (!latest) return { changed: false, dependencies: [] };
  const latestExposure = readComparableExposure(database, userId, latest.id, exerciseId);
  if (latestExposure.length === 0) return { changed: false, dependencies: [] };
  const baselineFingerprint = fingerprint(baselineExposure);
  const latestFingerprint = fingerprint(latestExposure);
  if (baselineFingerprint === latestFingerprint) return { changed: false, dependencies: [] };
  return {
    changed: true,
    dependencies: [
      ...baseline.dependencies,
      {
        kind: 'session_sets',
        id: `${baseline.session.id}:${exerciseId}`,
        version: baselineFingerprint,
      },
      {
        kind: 'session',
        id: latest.id,
        version: stableJson({
          date: latest.date,
          startedAt: latest.startedAt,
          completedAt: latest.completedAt,
          updatedAt: latest.updatedAt,
          deletedAt: latest.deletedAt,
        }),
      },
      {
        kind: 'session_sets',
        id: `${latest.id}:${exerciseId}`,
        version: latestFingerprint,
      },
    ],
  };
}

function readOpenConcerns(
  database: FeedbackDatabase,
  sqlite: Database.Database,
  userId: string,
  from: string | null,
  query: FeedbackPlanningContextQuery,
) {
  const total = (
    sqlite
      .prepare(
        `SELECT count(DISTINCT json_extract(d.definition,'$.concernRef')) AS total
         ${currentRelation} AND json_extract(d.definition,'$.concernRef') IS NOT NULL`,
      )
      .get(userId, null, null) as { total: number }
  ).total;
  const refs = sqlite
    .prepare(
      `SELECT json_extract(d.definition,'$.concernRef') AS concernRef
       ${currentRelation} AND json_extract(d.definition,'$.concernRef') IS NOT NULL
       GROUP BY concernRef ORDER BY max(s.date) DESC,concernRef LIMIT ? OFFSET ?`,
    )
    .all(userId, null, null, query.limit, (query.page - 1) * query.limit) as Array<{
    concernRef: string;
  }>;
  const concerns = [];
  for (const { concernRef } of refs) {
    const rows = sqlite
      .prepare(
        `SELECT d.id AS definitionRowId,d.definition,ar.id AS responseRevisionId,ar.answer,
         s.id AS sessionId,s.name AS workoutName,s.date,s.started_at AS startedAt,s.completed_at AS completedAt,
         s.updated_at AS updatedAt,s.deleted_at AS deletedAt,aset.updated_at AS answerSetUpdatedAt
         ${currentRelation} AND json_extract(d.definition,'$.concernRef')=?
         ORDER BY s.date DESC,COALESCE(ar.answered_at,json_extract(d.definition,'$.authoredAt')) DESC,s.id,d.order_index,d.id LIMIT 50`,
      )
      .all(userId, null, null, concernRef) as RawEvidenceRow[];
    const evidence = rows.map((row) => mapEvidence(database, row, 'current'));
    if (evidence.length === 0) continue;
    const aggregate = sqlite
      .prepare(
        `SELECT count(*) AS total,
         count(DISTINCT CASE WHEN json_extract(ar.answer,'$.state')='answered' THEN json_extract(ar.answer,'$.value') END) AS distinctAnswered
         ${currentRelation} AND json_extract(d.definition,'$.concernRef')=?`,
      )
      .get(userId, null, null, concernRef) as { total: number; distinctAnswered: number };
    const decisionRow = database
      .select()
      .from(workoutFeedbackPlanningDecisions)
      .where(
        and(
          eq(workoutFeedbackPlanningDecisions.userId, userId),
          eq(workoutFeedbackPlanningDecisions.concernRef, concernRef),
        ),
      )
      .orderBy(desc(workoutFeedbackPlanningDecisions.sequence))
      .limit(1)
      .get();
    const decision = decisionRow ? staleDecision(database, decisionRow) : null;
    const contradictory = aggregate.distinctAnswered > 1;
    const representative = evidence[0];
    if (!representative) continue;
    const changedExposure = changedExposureComparison(database, userId, evidence);
    if (
      decision?.disposition === 'retire' &&
      !decision.stale &&
      !contradictory &&
      !changedExposure.changed
    )
      continue;
    const sourceDates = evidence.map((item) => item.session.date).sort();
    const stalenessReasons = [
      ...(from && sourceDates.every((date) => date < from) ? ['outside_recent_window'] : []),
      ...(evidence.some((item) => item.source.availability !== 'available')
        ? ['source_unavailable']
        : []),
      ...(decision?.stale ? ['latest_decision_stale'] : []),
      ...(aggregate.total > evidence.length ? ['evidence_truncated'] : []),
    ];
    const dependencyFingerprint = fingerprint(
      evidence.map((item) => item.dependencyFingerprint).sort(),
    );
    concerns.push({
      concernRef,
      contextLabel: representative.context.label,
      exerciseId: representative.context.exerciseId,
      exerciseName: representative.context.exerciseName,
      bodyRegion: representative.context.bodyRegion,
      laterality: representative.context.laterality,
      originalSourceTimestamp: evidence.map((item) => item.question.authoredAt).sort()[0],
      evidenceIds: evidence.map((item) => item.id),
      evidenceTotal: aggregate.total,
      evidenceHasMore: aggregate.total > evidence.length,
      contradictory,
      stale: stalenessReasons.length > 0,
      stalenessReasons,
      latestDisposition: decision?.disposition ?? null,
      decisionId: decision?.id ?? null,
      decisionStale: decision?.stale ?? false,
      dependencyFingerprint,
      changedExposure: changedExposure.changed,
      changedExposureDependencies: changedExposure.dependencies,
    });
  }
  return { items: concerns, ...pageMeta(query.page, query.limit, total, concerns.length) };
}

function buildFollowUpDrafts(
  concerns: ReturnType<typeof readOpenConcerns>['items'],
  currentEvidence: FeedbackPlanningEvidence[],
) {
  return concerns.flatMap((concern) => {
    const linked = currentEvidence.filter((item) => item.context.concernRef === concern.concernRef);
    const reasons = [
      ...(linked.some((item) => item.answer.state !== 'answered') ? (['missing'] as const) : []),
      ...(concern.stale ? (['stale'] as const) : []),
      ...(concern.contradictory ? (['contradictory'] as const) : []),
      ...(new Set(linked.map((item) => item.session.id)).size > 1 ? (['recurrence'] as const) : []),
      ...(concern.changedExposure ? (['changed_exposure'] as const) : []),
    ];
    if (reasons.length === 0) return [];
    const dependencies = [
      ...(linked.length > 0
        ? linked.flatMap((item) => item.dependencies)
        : concern.evidenceIds.map((id) => ({
            kind: 'answer_revision' as const,
            id,
            version: concern.dependencyFingerprint,
          }))),
      ...concern.changedExposureDependencies,
    ]
      .filter(
        (dependency, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.kind === dependency.kind &&
              candidate.id === dependency.id &&
              candidate.version === dependency.version,
          ) === index,
      )
      .slice(0, 50);
    return [
      {
        concernRef: concern.concernRef,
        prompt: `Provide a current, activity-specific update for ${concern.contextLabel ?? concern.concernRef}.`,
        timing: 'next_check_in' as const,
        reasons: [...new Set(reasons)],
        publicationState: 'draft' as const,
        dependencies,
        dependencyFingerprint: fingerprint(dependencies),
      },
    ];
  });
}

export async function readFeedbackPlanningContext(
  userId: string,
  query: FeedbackPlanningContextQuery,
  today: string,
  now = getApplicationNowMs(),
): Promise<FeedbackPlanningContextResponse> {
  const { db, sqlite } = await import('../../db/index.js');
  const from = query.view === 'export' ? null : addUtcDays(today, -(query.windowDays - 1));
  const current = readEvidencePage(db, sqlite, userId, from, query, 'current');
  const history = readEvidencePage(db, sqlite, userId, from, query, 'historical');
  const openConcerns = readOpenConcerns(db, sqlite, userId, from, query);
  const publicOpenConcerns = {
    ...openConcerns,
    items: openConcerns.items.map(({ changedExposure, changedExposureDependencies, ...item }) => {
      void changedExposure;
      void changedExposureDependencies;
      return item;
    }),
  };
  const selectedSessionIds = [
    ...new Set([
      ...current.items.map((item) => item.session.id),
      ...history.items.map((item) => item.session.id),
    ]),
  ];
  return feedbackPlanningContextResponseSchema.parse({
    generatedAt: new Date(now).toISOString(),
    query: { view: query.view, today, from, windowDays: query.windowDays },
    current,
    history,
    openConcerns: publicOpenConcerns,
    followUpDrafts: buildFollowUpDrafts(openConcerns.items, current.items),
    setEvidence: readSetEvidence(sqlite, userId, selectedSessionIds),
    audit: readAuditPage(sqlite, userId, from, query),
    decisions: readDecisionPage(db, userId, query),
    cache: { mode: 'recompute_on_read', storedDerivedContext: false },
  });
}

export async function applyFeedbackPrecautionDecision({
  actor,
  input: rawInput,
  now = getApplicationNowMs(),
  today,
  userId,
}: {
  actor: FeedbackPlanningActor;
  input: ApplyFeedbackPrecautionDecisionInput;
  now?: number;
  today: string;
  userId: string;
}): Promise<FeedbackPrecautionDecision> {
  const input = applyFeedbackPrecautionDecisionInputSchema.parse(rawInput);
  const requestFingerprint = fingerprint({ actor, input });
  const { db } = await import('../../db/index.js');
  return db.transaction((tx) => {
    const replay = tx
      .select()
      .from(workoutFeedbackPlanningDecisions)
      .where(
        and(
          eq(workoutFeedbackPlanningDecisions.userId, userId),
          eq(workoutFeedbackPlanningDecisions.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)
      .get();
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint) {
        throw new FeedbackPlanningIdempotencyConflictError(
          'Idempotency key was already used for a different precaution decision.',
        );
      }
      return staleDecision(tx, replay);
    }

    const source = tx
      .select()
      .from(workoutSessions)
      .where(
        and(eq(workoutSessions.id, input.source.sessionId), eq(workoutSessions.userId, userId)),
      )
      .limit(1)
      .get();
    if (!source || source.deletedAt !== null) {
      throw new FeedbackPlanningNotFoundError('Source workout session was not found.');
    }
    const sourceKey = `${input.source.section}::${input.source.exerciseId}`;
    const sourceText = parseWorkoutSessionExerciseProgrammingNotes(source.exerciseProgrammingNotes)[
      sourceKey
    ];
    if (sourceText === undefined || sourceText === null) {
      throw new FeedbackPlanningNotFoundError('Source programming note was not found.');
    }
    if (hashText(sourceText) !== input.source.expectedTextHash) {
      throw new FeedbackPlanningConflictError(
        'Source programming note changed; refresh and retry.',
      );
    }
    for (const safeguard of input.safeguards) {
      if (!sourceText.includes(safeguard)) {
        throw new FeedbackPlanningInvalidDecisionError(
          'Declared safeguard is not an exact substring of the source programming note.',
        );
      }
    }

    const supportRows = tx
      .select({
        id: workoutFeedbackAnswerRevisions.id,
        answer: workoutFeedbackAnswerRevisions.answer,
        currentId: workoutFeedbackAnswerCurrent.responseRevisionId,
        definition: workoutFeedbackQuestionDefinitions.definition,
      })
      .from(workoutFeedbackAnswerRevisions)
      .innerJoin(
        workoutFeedbackAnswerCurrent,
        eq(workoutFeedbackAnswerCurrent.responseRevisionId, workoutFeedbackAnswerRevisions.id),
      )
      .innerJoin(
        workoutFeedbackQuestionLists,
        and(
          eq(workoutFeedbackQuestionLists.userId, workoutFeedbackAnswerRevisions.userId),
          eq(workoutFeedbackQuestionLists.scopeKind, 'session'),
          eq(workoutFeedbackQuestionLists.scopeId, workoutFeedbackAnswerRevisions.sessionId),
        ),
      )
      .innerJoin(
        workoutFeedbackQuestionListRevisions,
        and(
          eq(workoutFeedbackQuestionListRevisions.listId, workoutFeedbackQuestionLists.id),
          eq(
            workoutFeedbackQuestionListRevisions.revision,
            workoutFeedbackQuestionLists.currentRevision,
          ),
        ),
      )
      .innerJoin(
        workoutFeedbackQuestionDefinitions,
        and(
          eq(
            workoutFeedbackQuestionDefinitions.listRevisionId,
            workoutFeedbackQuestionListRevisions.id,
          ),
          eq(
            workoutFeedbackQuestionDefinitions.questionId,
            workoutFeedbackAnswerRevisions.questionId,
          ),
          eq(
            workoutFeedbackQuestionDefinitions.definitionVersion,
            workoutFeedbackAnswerRevisions.definitionVersion,
          ),
        ),
      )
      .where(
        and(
          eq(workoutFeedbackAnswerRevisions.userId, userId),
          inArray(workoutFeedbackAnswerRevisions.id, input.supportingResponseRevisionIds),
        ),
      )
      .all();
    if (supportRows.length !== new Set(input.supportingResponseRevisionIds).size) {
      throw new FeedbackPlanningNotFoundError(
        'Current supporting feedback response was not found.',
      );
    }
    const support = supportRows.map((row) => ({
      ...row,
      answer: workoutFeedbackAnswerRevisionSchema.parse(row.answer),
      definition: workoutFeedbackQuestionDefinitionSchema.parse(row.definition),
    }));
    if (support.some((row) => row.definition.concernRef !== input.concernRef)) {
      throw new FeedbackPlanningInvalidDecisionError(
        'Supporting responses must carry the exact decision concern reference.',
      );
    }
    if (input.disposition !== 'retain' && support.every((row) => row.answer.state !== 'answered')) {
      throw new FeedbackPlanningInvalidDecisionError(
        'Revise or retire requires a current explicit answered response.',
      );
    }

    const clinicianGuidance = tx
      .select({ id: feedbackNoteDispositions.id })
      .from(feedbackNoteDispositions)
      .where(
        and(
          eq(feedbackNoteDispositions.userId, userId),
          eq(feedbackNoteDispositions.kind, 'session'),
          eq(feedbackNoteDispositions.parentId, source.id),
          eq(feedbackNoteDispositions.sourceKey, sourceKey),
          eq(feedbackNoteDispositions.rawText, sourceText),
          eq(feedbackNoteDispositions.construct, 'clinician_guidance'),
          isNull(feedbackNoteDispositions.rolledBackAt),
        ),
      )
      .limit(1)
      .get();
    const sourceClassification = clinicianGuidance
      ? 'clinician_authored_guidance'
      : 'programming_precaution';
    if (clinicianGuidance && input.disposition !== 'retain') {
      throw new FeedbackPlanningInvalidDecisionError(
        'Clinician-authored guidance requires its own source-linked clearance and cannot be revised or retired by this response.',
      );
    }

    const appliedMutations: DecisionRow['targetMutations'] = [];
    for (const mutation of input.scheduledNoteMutations) {
      const target = tx
        .select({
          id: scheduledWorkoutExercises.id,
          exerciseId: scheduledWorkoutExercises.exerciseId,
          programmingNotes: scheduledWorkoutExercises.programmingNotes,
          scheduledWorkoutId: scheduledWorkoutExercises.scheduledWorkoutId,
          date: scheduledWorkouts.date,
          sessionId: scheduledWorkouts.sessionId,
        })
        .from(scheduledWorkoutExercises)
        .innerJoin(
          scheduledWorkouts,
          eq(scheduledWorkouts.id, scheduledWorkoutExercises.scheduledWorkoutId),
        )
        .where(
          and(
            eq(scheduledWorkoutExercises.id, mutation.scheduledWorkoutExerciseId),
            eq(scheduledWorkoutExercises.scheduledWorkoutId, mutation.scheduledWorkoutId),
            eq(scheduledWorkouts.userId, userId),
          ),
        )
        .limit(1)
        .get();
      if (!target)
        throw new FeedbackPlanningNotFoundError('Future scheduled note target was not found.');
      if (target.exerciseId !== input.source.exerciseId) {
        throw new FeedbackPlanningInvalidDecisionError(
          'Future scheduled note target must reference the source precaution exercise.',
        );
      }
      if (target.sessionId !== null || target.date < today) {
        throw new FeedbackPlanningConflictError(
          'Only a not-yet-started current or future scheduled workout can be changed.',
        );
      }
      if (target.programmingNotes !== mutation.expectedProgrammingNotes) {
        throw new FeedbackPlanningConflictError(
          'Future scheduled programming note changed; refresh and retry.',
        );
      }
      for (const safeguard of input.safeguards) {
        if (!mutation.programmingNotes?.includes(safeguard)) {
          throw new FeedbackPlanningInvalidDecisionError(
            'Every changed future note must retain each declared general safeguard exactly.',
          );
        }
      }
      appliedMutations.push({
        scheduledWorkoutId: target.scheduledWorkoutId,
        scheduledWorkoutExerciseId: target.id,
        before: target.programmingNotes,
        after: mutation.programmingNotes,
      });
    }
    if (input.disposition !== 'retain' && appliedMutations.length === 0) {
      throw new FeedbackPlanningInvalidDecisionError(
        'Revise or retire requires an explicitly authorized future scheduled-note mutation.',
      );
    }

    const prior = tx
      .select()
      .from(workoutFeedbackPlanningDecisions)
      .where(
        and(
          eq(workoutFeedbackPlanningDecisions.userId, userId),
          eq(workoutFeedbackPlanningDecisions.concernRef, input.concernRef),
        ),
      )
      .orderBy(desc(workoutFeedbackPlanningDecisions.sequence))
      .limit(1)
      .get();
    const dependencies = decisionDependencies(
      tx,
      source,
      sourceText,
      input.supportingResponseRevisionIds,
      input.concernRef,
    );
    const dependencyFingerprint = fingerprint(dependencies);
    const id = randomUUID();
    for (const mutation of appliedMutations) {
      tx.update(scheduledWorkoutExercises)
        .set({ programmingNotes: mutation.after })
        .where(eq(scheduledWorkoutExercises.id, mutation.scheduledWorkoutExerciseId))
        .run();
      tx.update(scheduledWorkouts)
        .set({ updatedAt: now })
        .where(eq(scheduledWorkouts.id, mutation.scheduledWorkoutId))
        .run();
    }
    tx.insert(workoutFeedbackPlanningDecisions)
      .values({
        id,
        userId,
        concernRef: input.concernRef,
        sequence: (prior?.sequence ?? 0) + 1,
        priorDecisionId: prior?.id ?? null,
        sourceSessionId: source.id,
        sourceExerciseId: input.source.exerciseId,
        sourceSection: input.source.section,
        sourceText,
        sourceTextHash: hashText(sourceText),
        sourceTimestamp: source.startedAt,
        sourceClassification,
        disposition: input.disposition,
        interpretation: input.interpretation,
        reason: input.reason,
        actorType: 'agent_token',
        actorId: actor.id,
        actorLabel: actor.label,
        dependencies,
        dependencyFingerprint,
        input,
        targetMutations: appliedMutations,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        createdAt: now,
      })
      .run();
    tx.insert(workoutFeedbackPlanningDecisionResponses)
      .values(
        input.supportingResponseRevisionIds.map((responseRevisionId) => ({
          decisionId: id,
          userId,
          responseRevisionId,
        })),
      )
      .run();
    const inserted = tx
      .select()
      .from(workoutFeedbackPlanningDecisions)
      .where(eq(workoutFeedbackPlanningDecisions.id, id))
      .get();
    if (!inserted) throw new Error('Feedback precaution decision was not persisted.');
    return staleDecision(tx, inserted);
  });
}

export { fingerprint as feedbackPlanningFingerprint, hashText as feedbackPlanningTextHash };
