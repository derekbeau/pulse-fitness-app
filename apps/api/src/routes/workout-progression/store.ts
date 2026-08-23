import { randomUUID } from 'node:crypto';

import {
  applyWorkoutProgressionActionInputSchema,
  configureWorkoutProgressionInputSchema,
  evaluateWorkoutProgression,
  sha256Hex,
  workoutProgressionActionSchema,
  workoutProgressionEvidenceSchema,
  workoutProgressionConfigurationSchema,
  workoutProgressionRecommendationSchema,
  type ApplyWorkoutProgressionActionInput,
  type ConfigureWorkoutProgressionInput,
  type WorkoutProgressionAction,
  type WorkoutProgressionEvidence,
  type WorkoutProgressionPolicy,
  type WorkoutProgressionRecommendation,
  type WorkoutProgressionConfiguration,
  type WorkoutProgressionTarget,
} from '@pulse/shared';
import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';

import { db } from '../../db/index.js';
import {
  exercises,
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
  sessionSets,
  parseWorkoutSessionFeedback,
  workoutProgressionActions,
  workoutProgressionConfigurations,
  workoutProgressionRecommendations,
  workoutSessions,
} from '../../db/schema/index.js';

type DatabaseClient = Pick<typeof db, 'delete' | 'insert' | 'select' | 'update'>;

export class WorkoutProgressionNotFoundError extends Error {}
export class WorkoutProgressionStaleError extends Error {}
export class WorkoutProgressionAlreadyDecidedError extends Error {}
export class WorkoutProgressionIdempotencyConflictError extends Error {}
export class WorkoutProgressionInvalidEditError extends Error {}
export class WorkoutProgressionScheduleLockedError extends Error {}

type ProgressionActor =
  | { type: 'user'; id: string; label: string }
  | { type: 'agent_token'; id: string; label: string };

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const fingerprint = (value: unknown) => sha256Hex(stableJson(value));

function parseRecommendationSnapshot(snapshot: unknown): WorkoutProgressionRecommendation {
  const current = workoutProgressionRecommendationSchema.safeParse(snapshot);
  if (current.success) return current.data;

  // 0053 snapshots predate exact set identity, prescription, policy provenance, and context.
  // Preserve those immutable decisions as legacy audit facts without inventing unavailable facts.
  const legacy = snapshot as Record<string, unknown>;
  const legacyEvidence = legacy.evidence as Record<string, unknown>;
  const legacyTargets = (legacyEvidence.priorTargets as Array<Record<string, unknown>>).map(
    (target, index) => ({ ...target, setId: `legacy-current-set-${index + 1}` }),
  );
  const legacyRecommended = (legacy.recommendedTargets as Array<Record<string, unknown>>).map(
    (target, index) => ({ ...target, setId: `legacy-current-set-${index + 1}` }),
  );
  const legacyPerformance = (legacyEvidence.performance as Array<Record<string, unknown>>).map(
    (set) => ({
      completed: set.completed,
      distance: set.distance,
      prescribed: {
        distance: null,
        reps: null,
        repsMax: null,
        repsMin: null,
        seconds: null,
        setId: set.setId,
        setNumber: set.setNumber,
        weight: null,
        weightMax: null,
        weightMin: null,
        zone: null,
      },
      reps: set.reps,
      rpe: set.rpe,
      seconds: set.seconds,
      setId: set.setId,
      sourceScheduledSetId: null,
      setNumber: set.setNumber,
      skipped: set.skipped,
      weight: set.weight,
      zone: set.zone,
    }),
  );
  return workoutProgressionRecommendationSchema.parse({
    ...legacy,
    evidence: {
      ...legacyEvidence,
      context: { availability: 'unavailable', facts: [] },
      performance: legacyPerformance,
      policy: { ...(legacyEvidence.policy as object), contextRequired: false },
      policySource: {
        actorId: null,
        actorLabel: null,
        actorType: null,
        configurationId: null,
        configuredAt: null,
        revision: 0,
        type: 'none',
      },
      priorTargets: legacyTargets,
    },
    recommendedTargets: legacyRecommended,
  });
}

const orderedTargets = (targets: WorkoutProgressionTarget[]) =>
  [...targets].sort((left, right) => left.setNumber - right.setNumber);

const unsupportedPolicy: WorkoutProgressionPolicy = {
  allowReduction: false,
  contextRequired: false,
  distanceStep: null,
  effortCeiling: null,
  family: 'unsupported',
  loadIncrement: null,
  loadIncreasePercent: null,
  lowEffortThreshold: null,
  repRangeMax: null,
  repRangeMin: null,
  secondsStep: null,
  version: 1,
  zoneCeiling: null,
};

function buildEvidenceForScheduledWorkout(
  client: DatabaseClient,
  userId: string,
  scheduledWorkoutId: string,
): WorkoutProgressionEvidence[] | undefined {
  const schedule = client
    .select({
      date: scheduledWorkouts.date,
      id: scheduledWorkouts.id,
      sessionId: scheduledWorkouts.sessionId,
    })
    .from(scheduledWorkouts)
    .where(and(eq(scheduledWorkouts.id, scheduledWorkoutId), eq(scheduledWorkouts.userId, userId)))
    .get();
  if (!schedule) {
    return undefined;
  }

  const exerciseRows = client
    .select({
      exerciseId: scheduledWorkoutExercises.exerciseId,
      exerciseName: exercises.name,
      scheduledWorkoutExerciseId: scheduledWorkoutExercises.id,
      trackingType: exercises.trackingType,
    })
    .from(scheduledWorkoutExercises)
    .innerJoin(exercises, eq(exercises.id, scheduledWorkoutExercises.exerciseId))
    .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
    .orderBy(asc(scheduledWorkoutExercises.orderIndex), asc(scheduledWorkoutExercises.id))
    .all();
  if (exerciseRows.length === 0) {
    return [];
  }

  const scheduledExerciseIds = exerciseRows.map((row) => row.scheduledWorkoutExerciseId);
  const targetRows = client
    .select({
      id: scheduledWorkoutExerciseSets.id,
      distance: scheduledWorkoutExerciseSets.targetDistance,
      reps: scheduledWorkoutExerciseSets.reps,
      repsMax: scheduledWorkoutExerciseSets.repsMax,
      repsMin: scheduledWorkoutExerciseSets.repsMin,
      scheduledWorkoutExerciseId: scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId,
      seconds: scheduledWorkoutExerciseSets.targetSeconds,
      setNumber: scheduledWorkoutExerciseSets.setNumber,
      weight: scheduledWorkoutExerciseSets.targetWeight,
      weightMax: scheduledWorkoutExerciseSets.targetWeightMax,
      weightMin: scheduledWorkoutExerciseSets.targetWeightMin,
      zone: scheduledWorkoutExerciseSets.targetZone,
    })
    .from(scheduledWorkoutExerciseSets)
    .where(inArray(scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId, scheduledExerciseIds))
    .orderBy(asc(scheduledWorkoutExerciseSets.setNumber))
    .all();

  const targetsByScheduledExercise = new Map<string, WorkoutProgressionTarget[]>();
  for (const row of targetRows) {
    const targets = targetsByScheduledExercise.get(row.scheduledWorkoutExerciseId) ?? [];
    targets.push({
      setId: row.id,
      distance: row.distance,
      reps: row.reps,
      repsMax: row.repsMax,
      repsMin: row.repsMin,
      seconds: row.seconds,
      setNumber: row.setNumber,
      weight: row.weight,
      weightMax: row.weightMax,
      weightMin: row.weightMin,
      zone: row.zone,
    });
    targetsByScheduledExercise.set(row.scheduledWorkoutExerciseId, targets);
  }

  const evidence: WorkoutProgressionEvidence[] = [];
  for (const exerciseRow of exerciseRows) {
    const priorTargets = orderedTargets(
      targetsByScheduledExercise.get(exerciseRow.scheduledWorkoutExerciseId) ?? [],
    );
    if (priorTargets.length === 0) {
      continue;
    }

    const latestSession = client
      .select({
        date: workoutSessions.date,
        feedback: workoutSessions.feedback,
        id: workoutSessions.id,
      })
      .from(sessionSets)
      .innerJoin(workoutSessions, eq(workoutSessions.id, sessionSets.sessionId))
      .where(
        and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.status, 'completed'),
          isNull(workoutSessions.deletedAt),
          sql`coalesce(${sessionSets.exerciseIdSnapshot}, ${sessionSets.exerciseId}) = ${exerciseRow.exerciseId}`,
          lte(workoutSessions.date, schedule.date),
        ),
      )
      .orderBy(
        desc(workoutSessions.date),
        desc(workoutSessions.completedAt),
        desc(workoutSessions.id),
      )
      .limit(1)
      .get();

    const performance = latestSession
      ? client
          .select({
            completed: sessionSets.completed,
            distance: sessionSets.distance,
            prescribedDistance: sessionSets.targetDistance,
            prescribedReps: sessionSets.targetReps,
            prescribedRepsMax: sessionSets.targetRepsMax,
            prescribedRepsMin: sessionSets.targetRepsMin,
            prescribedSeconds: sessionSets.targetSeconds,
            prescribedWeight: sessionSets.targetWeight,
            prescribedWeightMax: sessionSets.targetWeightMax,
            prescribedWeightMin: sessionSets.targetWeightMin,
            prescribedZone: sessionSets.targetZone,
            reps: sessionSets.reps,
            rpe: sessionSets.rpe,
            seconds: sessionSets.seconds,
            setId: sessionSets.id,
            sourceScheduledSetId: sessionSets.sourceScheduledSetId,
            setNumber: sessionSets.setNumber,
            skipped: sessionSets.skipped,
            weight: sessionSets.weight,
            zone: sessionSets.zone,
          })
          .from(sessionSets)
          .where(
            and(
              eq(sessionSets.sessionId, latestSession.id),
              sql`coalesce(${sessionSets.exerciseIdSnapshot}, ${sessionSets.exerciseId}) = ${exerciseRow.exerciseId}`,
            ),
          )
          .orderBy(asc(sessionSets.setNumber), asc(sessionSets.id))
          .all()
          .map((row) => ({
            completed: row.completed,
            distance: row.distance,
            prescribed: {
              distance: row.prescribedDistance,
              reps: row.prescribedReps,
              repsMax: row.prescribedRepsMax,
              repsMin: row.prescribedRepsMin,
              seconds: row.prescribedSeconds,
              setId: row.setId,
              setNumber: row.setNumber,
              weight: row.prescribedWeight,
              weightMax: row.prescribedWeightMax,
              weightMin: row.prescribedWeightMin,
              zone: row.prescribedZone,
            },
            reps: row.reps,
            rpe: row.rpe,
            seconds: row.seconds,
            setId: row.setId,
            sourceScheduledSetId: row.sourceScheduledSetId,
            setNumber: row.setNumber,
            skipped: row.skipped,
            weight: row.weight,
            zone: row.zone,
          }))
      : [];

    const configurationRow = client
      .select({ snapshot: workoutProgressionConfigurations.snapshot })
      .from(workoutProgressionConfigurations)
      .where(
        and(
          eq(workoutProgressionConfigurations.userId, userId),
          eq(
            workoutProgressionConfigurations.scheduledWorkoutExerciseId,
            exerciseRow.scheduledWorkoutExerciseId,
          ),
        ),
      )
      .get();
    const configuration = configurationRow
      ? workoutProgressionConfigurationSchema.parse(configurationRow.snapshot)
      : null;
    const feedback = latestSession?.feedback
      ? parseWorkoutSessionFeedback(latestSession.feedback)
      : null;
    const feedbackFacts: WorkoutProgressionEvidence['context']['facts'] = [];
    if (feedback?.technique !== undefined && feedback.technique <= 2) {
      feedbackFacts.push({
        detail: 'Session feedback recorded technique or form failure.',
        source: 'session_feedback',
        type: 'form_failure',
      });
    }
    for (const response of feedback?.responses ?? []) {
      if (
        ['pain', 'pain-discomfort', 'symptoms'].includes(response.id) &&
        response.value !== false &&
        response.value !== null &&
        response.value !== ''
      ) {
        feedbackFacts.push({
          detail: response.label,
          source: 'session_feedback',
          type: response.id === 'symptoms' ? 'symptoms' : 'pain',
        });
      }
    }

    evidence.push(
      workoutProgressionEvidenceSchema.parse({
        exerciseId: exerciseRow.exerciseId,
        exerciseName: exerciseRow.exerciseName,
        performance,
        context: {
          availability:
            feedback || configuration?.contextAvailability === 'available'
              ? 'available'
              : 'unavailable',
          facts: [...feedbackFacts, ...(configuration?.contextFacts ?? [])].slice(0, 20),
        },
        policy: configuration?.policy ?? unsupportedPolicy,
        policySource: configuration
          ? {
              actorId: configuration.actorId,
              actorLabel: configuration.actorLabel,
              actorType: configuration.actorType,
              configurationId: configuration.id,
              configuredAt: configuration.updatedAt,
              revision: configuration.revision,
              type: 'programming_config',
            }
          : {
              actorId: null,
              actorLabel: null,
              actorType: null,
              configurationId: null,
              configuredAt: null,
              revision: 0,
              type: 'none',
            },
        priorTargets,
        scheduledWorkoutDate: schedule.date,
        scheduledWorkoutExerciseId: exerciseRow.scheduledWorkoutExerciseId,
        scheduledWorkoutId,
        sourceSessionDate: latestSession?.date ?? null,
        sourceSessionId: latestSession?.id ?? null,
        trackingType: exerciseRow.trackingType,
      }),
    );
  }
  return evidence;
}

function mapDecisionState(action: string): WorkoutProgressionRecommendation['state'] {
  switch (action) {
    case 'accept':
      return 'accepted';
    case 'edit':
      return 'edited';
    case 'keep':
      return 'kept';
    case 'hold':
      return 'held';
    default:
      return 'current';
  }
}

export async function configureWorkoutProgression({
  actor,
  input: rawInput,
  now = Date.now(),
  scheduledWorkoutExerciseId,
  userId,
}: {
  actor: ProgressionActor;
  input: ConfigureWorkoutProgressionInput;
  now?: number;
  scheduledWorkoutExerciseId: string;
  userId: string;
}): Promise<WorkoutProgressionConfiguration | undefined> {
  const input = configureWorkoutProgressionInputSchema.parse(rawInput);
  return db.transaction((tx) => {
    const ownedExercise = tx
      .select({
        scheduledWorkoutId: scheduledWorkoutExercises.scheduledWorkoutId,
      })
      .from(scheduledWorkoutExercises)
      .innerJoin(
        scheduledWorkouts,
        eq(scheduledWorkouts.id, scheduledWorkoutExercises.scheduledWorkoutId),
      )
      .where(
        and(
          eq(scheduledWorkoutExercises.id, scheduledWorkoutExerciseId),
          eq(scheduledWorkouts.userId, userId),
          isNull(scheduledWorkouts.sessionId),
        ),
      )
      .get();
    if (!ownedExercise) return undefined;

    const current = tx
      .select()
      .from(workoutProgressionConfigurations)
      .where(
        eq(workoutProgressionConfigurations.scheduledWorkoutExerciseId, scheduledWorkoutExerciseId),
      )
      .get();
    const currentRevision = current?.revision ?? 0;
    if (input.expectedRevision !== currentRevision) {
      throw new WorkoutProgressionStaleError('Workout progression configuration is stale');
    }
    const revision = currentRevision + 1;
    const id = current?.id ?? randomUUID();
    const configuration = workoutProgressionConfigurationSchema.parse({
      actorId: actor.id,
      actorLabel: actor.label,
      actorType: actor.type === 'agent_token' ? 'agent' : 'user',
      contextFacts: input.contextFacts,
      contextAvailability: input.contextAvailability,
      id,
      policy: input.policy,
      priority: input.priority,
      revision,
      scheduledWorkoutExerciseId,
      scheduledWorkoutId: ownedExercise.scheduledWorkoutId,
      updatedAt: now,
      userId,
    });
    const values = {
      actorLabel: actor.label,
      actorType: actor.type,
      agentTokenId: actor.type === 'agent_token' ? actor.id : null,
      revision,
      snapshot: configuration,
      updatedAt: now,
    } as const;
    if (current) {
      tx.update(workoutProgressionConfigurations)
        .set(values)
        .where(eq(workoutProgressionConfigurations.id, current.id))
        .run();
    } else {
      tx.insert(workoutProgressionConfigurations)
        .values({
          ...values,
          id,
          scheduledWorkoutExerciseId,
          scheduledWorkoutId: ownedExercise.scheduledWorkoutId,
          userId,
        })
        .run();
    }
    return configuration;
  });
}

function loadAction(client: DatabaseClient, recommendationId: string) {
  return client
    .select()
    .from(workoutProgressionActions)
    .where(eq(workoutProgressionActions.recommendationId, recommendationId))
    .orderBy(desc(workoutProgressionActions.sequence))
    .limit(1)
    .get();
}

function evidenceMatchesDecision(
  current: WorkoutProgressionEvidence,
  snapshot: WorkoutProgressionRecommendation,
  action: typeof workoutProgressionActions.$inferSelect,
) {
  const expectedTargets = resolveAppliedTargets(action.payload, snapshot);
  const stablePolicy = (policy: WorkoutProgressionPolicy) => ({
    allowReduction: policy.allowReduction,
    contextRequired: policy.contextRequired,
    distanceStep: policy.distanceStep,
    effortCeiling: policy.effortCeiling,
    family: policy.family,
    loadIncrement: policy.loadIncrement,
    loadIncreasePercent: policy.loadIncreasePercent,
    lowEffortThreshold: policy.lowEffortThreshold,
    repRangeMax: policy.repRangeMax,
    repRangeMin: policy.repRangeMin,
    secondsStep: policy.secondsStep,
    version: policy.version,
    zoneCeiling: policy.zoneCeiling,
  });
  return (
    current.scheduledWorkoutId === snapshot.evidence.scheduledWorkoutId &&
    current.scheduledWorkoutDate === snapshot.evidence.scheduledWorkoutDate &&
    current.scheduledWorkoutExerciseId === snapshot.evidence.scheduledWorkoutExerciseId &&
    current.exerciseId === snapshot.evidence.exerciseId &&
    current.exerciseName === snapshot.evidence.exerciseName &&
    current.trackingType === snapshot.evidence.trackingType &&
    current.sourceSessionId === snapshot.evidence.sourceSessionId &&
    current.sourceSessionDate === snapshot.evidence.sourceSessionDate &&
    stableJson(current.performance) === stableJson(snapshot.evidence.performance) &&
    stableJson(current.priorTargets) === stableJson(expectedTargets) &&
    stableJson(current.context) === stableJson(snapshot.evidence.context) &&
    stableJson(current.policySource) === stableJson(snapshot.evidence.policySource) &&
    stableJson(stablePolicy(current.policy)) === stableJson(stablePolicy(snapshot.evidence.policy))
  );
}

async function projectRecommendation(
  client: DatabaseClient,
  row: typeof workoutProgressionRecommendations.$inferSelect,
): Promise<WorkoutProgressionRecommendation> {
  const snapshot = parseRecommendationSnapshot(row.snapshot);
  const action = loadAction(client, row.id);
  const sourceSessionStillExists = snapshot.evidence.sourceSessionId
    ? client
        .select({ id: workoutSessions.id })
        .from(workoutSessions)
        .where(eq(workoutSessions.id, snapshot.evidence.sourceSessionId))
        .get() !== undefined
    : true;
  const currentEvidence = await buildEvidenceForScheduledWorkout(
    client,
    row.userId,
    row.scheduledWorkoutId,
  );
  const matchingEvidence = currentEvidence?.find(
    (evidence) => evidence.scheduledWorkoutExerciseId === row.scheduledWorkoutExerciseId,
  );
  if (action && (!matchingEvidence || !sourceSessionStillExists)) {
    return workoutProgressionRecommendationSchema.parse({
      ...snapshot,
      staleAt: null,
      state: mapDecisionState(action.type),
    });
  }
  if (action && matchingEvidence && evidenceMatchesDecision(matchingEvidence, snapshot, action)) {
    return workoutProgressionRecommendationSchema.parse({
      ...snapshot,
      staleAt: null,
      state: mapDecisionState(action.type),
    });
  }
  if (!matchingEvidence || fingerprint(matchingEvidence) !== row.sourceFingerprint) {
    return workoutProgressionRecommendationSchema.parse({
      ...snapshot,
      staleAt: row.generatedAt + 1,
      state: 'stale',
    });
  }
  return snapshot;
}

export async function previewWorkoutProgression({
  effectiveDate,
  generatedAt = Date.now(),
  scheduledWorkoutId,
  userId,
}: {
  effectiveDate?: string;
  generatedAt?: number;
  scheduledWorkoutId: string;
  userId: string;
}): Promise<WorkoutProgressionRecommendation[] | undefined> {
  const evidenceRows = await buildEvidenceForScheduledWorkout(db, userId, scheduledWorkoutId);
  if (evidenceRows === undefined) {
    return undefined;
  }

  const recommendations: WorkoutProgressionRecommendation[] = [];
  for (const evidence of evidenceRows) {
    const latest = db
      .select()
      .from(workoutProgressionRecommendations)
      .where(
        and(
          eq(workoutProgressionRecommendations.userId, userId),
          eq(
            workoutProgressionRecommendations.scheduledWorkoutExerciseId,
            evidence.scheduledWorkoutExerciseId,
          ),
        ),
      )
      .orderBy(
        desc(workoutProgressionRecommendations.generatedAt),
        desc(workoutProgressionRecommendations.id),
      )
      .limit(1)
      .get();
    if (latest) {
      const projected = await projectRecommendation(db, latest);
      if (projected.state !== 'stale' && projected.state !== 'current') {
        recommendations.push(projected);
        continue;
      }
    }
    const sourceFingerprint = fingerprint(evidence);
    const existing = db
      .select()
      .from(workoutProgressionRecommendations)
      .where(
        and(
          eq(workoutProgressionRecommendations.userId, userId),
          eq(
            workoutProgressionRecommendations.scheduledWorkoutExerciseId,
            evidence.scheduledWorkoutExerciseId,
          ),
          eq(workoutProgressionRecommendations.sourceFingerprint, sourceFingerprint),
          eq(workoutProgressionRecommendations.policyVersion, evidence.policy.version),
        ),
      )
      .get();
    if (existing) {
      recommendations.push(await projectRecommendation(db, existing));
      continue;
    }

    const evaluation = evaluateWorkoutProgression(evidence);
    const id = randomUUID();
    const recommendation = workoutProgressionRecommendationSchema.parse({
      ...evaluation,
      effectiveDate: effectiveDate ?? evidence.scheduledWorkoutDate,
      evidence,
      generatedAt,
      id,
      sourceFingerprint,
      staleAt: null,
      state: 'current',
      userId,
    });
    db.insert(workoutProgressionRecommendations)
      .values({
        effectiveDate: recommendation.effectiveDate,
        exerciseId: evidence.exerciseId,
        generatedAt,
        id,
        policyFamily: evidence.policy.family,
        policyVersion: evidence.policy.version,
        scheduledWorkoutExerciseId: evidence.scheduledWorkoutExerciseId,
        scheduledWorkoutId,
        snapshot: recommendation,
        sourceFingerprint,
        sourceSessionId: evidence.sourceSessionId,
        userId,
      })
      .onConflictDoNothing()
      .run();
    const persisted = db
      .select()
      .from(workoutProgressionRecommendations)
      .where(
        and(
          eq(
            workoutProgressionRecommendations.scheduledWorkoutExerciseId,
            evidence.scheduledWorkoutExerciseId,
          ),
          eq(workoutProgressionRecommendations.sourceFingerprint, sourceFingerprint),
          eq(workoutProgressionRecommendations.policyVersion, evidence.policy.version),
        ),
      )
      .get();
    if (!persisted) {
      throw new Error('Workout progression recommendation could not be persisted');
    }
    recommendations.push(await projectRecommendation(db, persisted));
  }
  return recommendations;
}

export async function getWorkoutProgressionRecommendation(
  userId: string,
  recommendationId: string,
): Promise<WorkoutProgressionRecommendation | undefined> {
  const row = db
    .select()
    .from(workoutProgressionRecommendations)
    .where(
      and(
        eq(workoutProgressionRecommendations.id, recommendationId),
        eq(workoutProgressionRecommendations.userId, userId),
      ),
    )
    .get();
  return row ? projectRecommendation(db, row) : undefined;
}

function assertBoundedEdit(
  original: WorkoutProgressionTarget[],
  edited: WorkoutProgressionTarget[],
  evidence: WorkoutProgressionEvidence,
) {
  const sortedOriginal = orderedTargets(original);
  const sortedEdited = orderedTargets(edited);
  if (
    sortedOriginal.length !== sortedEdited.length ||
    sortedOriginal.some(
      (target, index) =>
        target.setNumber !== sortedEdited[index]?.setNumber ||
        target.setId !== sortedEdited[index]?.setId,
    )
  ) {
    throw new WorkoutProgressionInvalidEditError('Edited targets must preserve set identity');
  }
  const withinBound = (before: number | null, after: number | null, delta: number) => {
    if (before === null || after === null) {
      return before === after;
    }
    return Math.abs(after - before) <= delta;
  };
  const relevant = {
    distance: ['cardio', 'distance'].includes(evidence.trackingType),
    reps: ['bodyweight_reps', 'reps_only', 'reps_seconds', 'weight_reps'].includes(
      evidence.trackingType,
    ),
    seconds: ['cardio', 'duration', 'reps_seconds', 'seconds_only', 'weight_seconds'].includes(
      evidence.trackingType,
    ),
    weight: ['weight_reps', 'weight_seconds'].includes(evidence.trackingType),
    zone: ['cardio', 'distance', 'duration'].includes(evidence.trackingType),
  };
  for (let index = 0; index < sortedOriginal.length; index += 1) {
    const before = sortedOriginal[index];
    const after = sortedEdited[index];
    if (
      !before ||
      !after ||
      !withinBound(
        before.weight,
        after.weight,
        Math.max((evidence.policy.loadIncrement ?? 0) * 2, (before.weight ?? 0) * 0.1),
      ) ||
      !withinBound(
        before.weightMin,
        after.weightMin,
        Math.max((evidence.policy.loadIncrement ?? 0) * 2, (before.weightMin ?? 0) * 0.1),
      ) ||
      !withinBound(
        before.weightMax,
        after.weightMax,
        Math.max((evidence.policy.loadIncrement ?? 0) * 2, (before.weightMax ?? 0) * 0.1),
      ) ||
      !withinBound(before.reps, after.reps, 5) ||
      !withinBound(before.repsMin, after.repsMin, 5) ||
      !withinBound(before.repsMax, after.repsMax, 5) ||
      !withinBound(
        before.seconds,
        after.seconds,
        Math.max((evidence.policy.secondsStep ?? 0) * 2, 300),
      ) ||
      !withinBound(
        before.distance,
        after.distance,
        Math.max((evidence.policy.distanceStep ?? 0) * 2, (before.distance ?? 0) * 0.25),
      ) ||
      !withinBound(before.zone, after.zone, 1) ||
      (!relevant.weight &&
        [after.weight, after.weightMin, after.weightMax].some((value) => value !== null)) ||
      (!relevant.reps &&
        [after.reps, after.repsMin, after.repsMax].some((value) => value !== null)) ||
      (!relevant.seconds && after.seconds !== null) ||
      (!relevant.distance && after.distance !== null) ||
      (!relevant.zone && after.zone !== null)
    ) {
      throw new WorkoutProgressionInvalidEditError('Edited targets exceed the bounded override');
    }
  }
}

export async function applyWorkoutProgressionAction({
  actor,
  input: rawInput,
  now = Date.now(),
  recommendationId,
  userId,
}: {
  actor: ProgressionActor;
  input: ApplyWorkoutProgressionActionInput;
  now?: number;
  recommendationId: string;
  userId: string;
}): Promise<WorkoutProgressionAction> {
  const input = applyWorkoutProgressionActionInputSchema.parse(rawInput);
  const requestFingerprint = fingerprint({
    actor: { id: actor.id, type: actor.type },
    input,
    recommendationId,
  });

  return db.transaction((tx) => {
    const replay = tx
      .select()
      .from(workoutProgressionActions)
      .where(
        and(
          eq(workoutProgressionActions.userId, userId),
          eq(workoutProgressionActions.idempotencyKey, input.idempotencyKey),
        ),
      )
      .get();
    if (replay) {
      if (replay.requestFingerprint !== requestFingerprint) {
        throw new WorkoutProgressionIdempotencyConflictError(
          'Idempotency key was already used with another action',
        );
      }
      const replayRecommendation = tx
        .select({ snapshot: workoutProgressionRecommendations.snapshot })
        .from(workoutProgressionRecommendations)
        .where(eq(workoutProgressionRecommendations.id, replay.recommendationId))
        .get();
      if (!replayRecommendation) {
        throw new WorkoutProgressionNotFoundError('Workout progression recommendation not found');
      }
      const replaySnapshot = parseRecommendationSnapshot(replayRecommendation.snapshot);
      return workoutProgressionActionSchema.parse({
        actorId: replay.agentTokenId ?? userId,
        actorType: replay.actorType === 'agent_token' ? 'agent' : 'user',
        appliedTargets: resolveAppliedTargets(replay.payload, replaySnapshot),
        createdAt: replay.createdAt,
        id: replay.id,
        idempotencyKey: replay.idempotencyKey,
        reason: replay.payload.reason,
        recommendationId: replay.recommendationId,
        sequence: replay.sequence,
        action: replay.type,
      });
    }

    const row = tx
      .select()
      .from(workoutProgressionRecommendations)
      .where(
        and(
          eq(workoutProgressionRecommendations.id, recommendationId),
          eq(workoutProgressionRecommendations.userId, userId),
        ),
      )
      .get();
    if (!row) {
      throw new WorkoutProgressionNotFoundError('Workout progression recommendation not found');
    }
    if (loadAction(tx, recommendationId)) {
      throw new WorkoutProgressionAlreadyDecidedError(
        'Workout progression recommendation already has a decision',
      );
    }
    const schedule = tx
      .select({ sessionId: scheduledWorkouts.sessionId })
      .from(scheduledWorkouts)
      .where(
        and(eq(scheduledWorkouts.id, row.scheduledWorkoutId), eq(scheduledWorkouts.userId, userId)),
      )
      .get();
    if (!schedule || schedule.sessionId !== null) {
      throw new WorkoutProgressionScheduleLockedError(
        'Workout progression can only change a not-yet-started scheduled workout',
      );
    }
    const snapshot = parseRecommendationSnapshot(row.snapshot);
    const currentEvidence = buildEvidenceForScheduledWorkout(tx, userId, row.scheduledWorkoutId);
    const matchingEvidence = currentEvidence?.find(
      (evidence) => evidence.scheduledWorkoutExerciseId === row.scheduledWorkoutExerciseId,
    );
    if (
      input.expectedFingerprint !== row.sourceFingerprint ||
      !matchingEvidence ||
      fingerprint(matchingEvidence) !== row.sourceFingerprint
    ) {
      throw new WorkoutProgressionStaleError('Workout progression recommendation is stale');
    }
    if (
      snapshot.confidence === 'unavailable' &&
      (input.action === 'accept' || input.action === 'edit')
    ) {
      throw new WorkoutProgressionInvalidEditError(
        'Unavailable progression evidence cannot apply target changes',
      );
    }

    const appliedTargets = resolveAppliedTargets(input, snapshot);
    if (input.action === 'edit') {
      assertBoundedEdit(snapshot.recommendedTargets, appliedTargets, snapshot.evidence);
    }
    if (input.action === 'accept' || input.action === 'edit') {
      const persistedSets = tx
        .select({
          id: scheduledWorkoutExerciseSets.id,
        })
        .from(scheduledWorkoutExerciseSets)
        .where(
          eq(
            scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId,
            row.scheduledWorkoutExerciseId,
          ),
        )
        .all();
      const targetById = new Map(appliedTargets.map((target) => [target.setId, target]));
      if (persistedSets.length !== appliedTargets.length) {
        throw new WorkoutProgressionStaleError('Workout progression recommendation is stale');
      }
      for (const persistedSet of persistedSets) {
        const target = targetById.get(persistedSet.id);
        if (!target) {
          throw new WorkoutProgressionStaleError('Workout progression recommendation is stale');
        }
        tx.update(scheduledWorkoutExerciseSets)
          .set({
            reps: target.reps,
            repsMax: target.repsMax,
            repsMin: target.repsMin,
            targetDistance: target.distance,
            targetSeconds: target.seconds,
            targetZone: target.zone,
            targetWeight: target.weight,
            targetWeightMax: target.weightMax,
            targetWeightMin: target.weightMin,
          })
          .where(eq(scheduledWorkoutExerciseSets.id, persistedSet.id))
          .run();
      }
      tx.update(scheduledWorkouts)
        .set({ updatedAt: now })
        .where(eq(scheduledWorkouts.id, row.scheduledWorkoutId))
        .run();
    }

    const id = randomUUID();
    tx.insert(workoutProgressionActions)
      .values({
        actorLabel: actor.label,
        actorType: actor.type,
        agentTokenId: actor.type === 'agent_token' ? actor.id : null,
        createdAt: now,
        id,
        idempotencyKey: input.idempotencyKey,
        payload: input,
        recommendationId,
        requestFingerprint,
        sequence: 1,
        type: input.action,
        userId,
      })
      .run();

    return workoutProgressionActionSchema.parse({
      action: input.action,
      actorId: actor.id,
      actorType: actor.type === 'agent_token' ? 'agent' : 'user',
      appliedTargets,
      createdAt: now,
      id,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      recommendationId,
      sequence: 1,
    });
  });
}

function resolveAppliedTargets(
  input: ApplyWorkoutProgressionActionInput,
  snapshot: WorkoutProgressionRecommendation | null,
): WorkoutProgressionTarget[] {
  if (input.action === 'edit') {
    return (input.editedTargets ?? []).map((target) => ({
      ...target,
      setId:
        target.setId ??
        snapshot?.recommendedTargets.find((candidate) => candidate.setNumber === target.setNumber)
          ?.setId ??
        `legacy-current-set-${target.setNumber}`,
    }));
  }
  if (snapshot === null) {
    return [];
  }
  return input.action === 'accept' ? snapshot.recommendedTargets : snapshot.evidence.priorTargets;
}
