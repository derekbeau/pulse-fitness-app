import { randomUUID } from 'node:crypto';

import {
  applyWorkoutProgressionActionInputSchema,
  evaluateWorkoutProgression,
  sha256Hex,
  workoutProgressionActionSchema,
  workoutProgressionEvidenceSchema,
  workoutProgressionRecommendationSchema,
  type ApplyWorkoutProgressionActionInput,
  type WorkoutProgressionAction,
  type WorkoutProgressionEvidence,
  type WorkoutProgressionPolicy,
  type WorkoutProgressionRecommendation,
  type WorkoutProgressionTarget,
} from '@pulse/shared';
import { and, asc, desc, eq, inArray, isNull, lte } from 'drizzle-orm';

import { db } from '../../db/index.js';
import {
  exercises,
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
  sessionSets,
  users,
  workoutProgressionActions,
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

const orderedTargets = (targets: WorkoutProgressionTarget[]) =>
  [...targets].sort((left, right) => left.setNumber - right.setNumber);

const selectPolicy = ({
  category,
  tags,
  trackingType,
  weightUnit,
  targets,
}: {
  category: string;
  tags: string[];
  trackingType: WorkoutProgressionEvidence['trackingType'];
  weightUnit: 'kg' | 'lbs';
  targets: WorkoutProgressionTarget[];
}): WorkoutProgressionPolicy => {
  const normalizedTags = new Set(tags.map((tag) => tag.trim().toLowerCase()));
  const loadIncrement = weightUnit === 'kg' ? 2.5 : 5;
  const firstTarget = targets[0];
  const base = {
    allowReduction: false,
    distanceStep: null,
    effortCeiling: 8,
    loadIncrement,
    loadIncreasePercent: null,
    lowEffortThreshold: 7,
    repRangeMax: firstTarget?.repsMax ?? null,
    repRangeMin: firstTarget?.repsMin ?? null,
    secondsStep: null,
    version: 1 as const,
    zoneCeiling: null,
  };

  if (
    category === 'mobility' ||
    normalizedTags.has('rehab') ||
    normalizedTags.has('prehab') ||
    normalizedTags.has('recovery')
  ) {
    return { ...base, allowReduction: true, family: 'rehab_capacity' };
  }
  if (['cardio', 'distance', 'duration', 'reps_seconds', 'seconds_only'].includes(trackingType)) {
    return {
      ...base,
      distanceStep: targets.some((target) => target.distance !== null) ? 0.25 : null,
      family: 'time_distance',
      loadIncrement: null,
      repRangeMax: null,
      repRangeMin: null,
      secondsStep: targets.some((target) => target.seconds !== null) ? 60 : null,
      zoneCeiling: 3,
    };
  }
  if (normalizedTags.has('rpe') || normalizedTags.has('rir')) {
    return { ...base, family: 'rpe_regulated' };
  }
  if (normalizedTags.has('strength')) {
    return { ...base, family: 'strength_load', loadIncreasePercent: 2.5 };
  }
  return { ...base, family: 'double_progression' };
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
      weightUnit: users.weightUnit,
    })
    .from(scheduledWorkouts)
    .innerJoin(users, eq(users.id, scheduledWorkouts.userId))
    .where(and(eq(scheduledWorkouts.id, scheduledWorkoutId), eq(scheduledWorkouts.userId, userId)))
    .get();
  if (!schedule) {
    return undefined;
  }

  const exerciseRows = client
    .select({
      category: exercises.category,
      exerciseId: scheduledWorkoutExercises.exerciseId,
      exerciseName: exercises.name,
      scheduledWorkoutExerciseId: scheduledWorkoutExercises.id,
      tags: exercises.tags,
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
    })
    .from(scheduledWorkoutExerciseSets)
    .where(inArray(scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId, scheduledExerciseIds))
    .orderBy(asc(scheduledWorkoutExerciseSets.setNumber))
    .all();

  const targetsByScheduledExercise = new Map<string, WorkoutProgressionTarget[]>();
  for (const row of targetRows) {
    const targets = targetsByScheduledExercise.get(row.scheduledWorkoutExerciseId) ?? [];
    targets.push({
      distance: row.distance,
      reps: row.reps,
      repsMax: row.repsMax,
      repsMin: row.repsMin,
      seconds: row.seconds,
      setNumber: row.setNumber,
      weight: row.weight,
      weightMax: row.weightMax,
      weightMin: row.weightMin,
      zone: null,
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
        id: workoutSessions.id,
      })
      .from(sessionSets)
      .innerJoin(workoutSessions, eq(workoutSessions.id, sessionSets.sessionId))
      .where(
        and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.status, 'completed'),
          isNull(workoutSessions.deletedAt),
          eq(sessionSets.exerciseId, exerciseRow.exerciseId),
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
            reps: sessionSets.reps,
            rpe: sessionSets.rpe,
            seconds: sessionSets.seconds,
            setId: sessionSets.id,
            setNumber: sessionSets.setNumber,
            skipped: sessionSets.skipped,
            weight: sessionSets.weight,
            zone: sessionSets.zone,
          })
          .from(sessionSets)
          .where(
            and(
              eq(sessionSets.sessionId, latestSession.id),
              eq(sessionSets.exerciseId, exerciseRow.exerciseId),
            ),
          )
          .orderBy(asc(sessionSets.setNumber), asc(sessionSets.id))
          .all()
      : [];

    evidence.push(
      workoutProgressionEvidenceSchema.parse({
        exerciseId: exerciseRow.exerciseId,
        exerciseName: exerciseRow.exerciseName,
        performance,
        policy: selectPolicy({
          category: exerciseRow.category,
          tags: exerciseRow.tags,
          targets: priorTargets,
          trackingType: exerciseRow.trackingType,
          weightUnit: schedule.weightUnit,
        }),
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

function loadAction(client: DatabaseClient, recommendationId: string) {
  return client
    .select()
    .from(workoutProgressionActions)
    .where(eq(workoutProgressionActions.recommendationId, recommendationId))
    .orderBy(desc(workoutProgressionActions.sequence))
    .limit(1)
    .get();
}

async function projectRecommendation(
  client: DatabaseClient,
  row: typeof workoutProgressionRecommendations.$inferSelect,
): Promise<WorkoutProgressionRecommendation> {
  const snapshot = workoutProgressionRecommendationSchema.parse(row.snapshot);
  const action = loadAction(client, row.id);
  if (action) {
    return workoutProgressionRecommendationSchema.parse({
      ...snapshot,
      staleAt: null,
      state: mapDecisionState(action.type),
    });
  }
  const currentEvidence = await buildEvidenceForScheduledWorkout(
    client,
    row.userId,
    row.scheduledWorkoutId,
  );
  const matchingEvidence = currentEvidence?.find(
    (evidence) => evidence.scheduledWorkoutExerciseId === row.scheduledWorkoutExerciseId,
  );
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
    const sourceFingerprint = fingerprint(evidence);
    const existing = db
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
) {
  const sortedOriginal = orderedTargets(original);
  const sortedEdited = orderedTargets(edited);
  if (
    sortedOriginal.length !== sortedEdited.length ||
    sortedOriginal.some((target, index) => target.setNumber !== sortedEdited[index]?.setNumber)
  ) {
    throw new WorkoutProgressionInvalidEditError('Edited targets must preserve set identity');
  }
  const withinBound = (before: number | null, after: number | null) => {
    if (before === null || after === null) {
      return before === after;
    }
    return after <= Math.max(before * 1.5, before + 10) && after >= before * 0.5;
  };
  for (let index = 0; index < sortedOriginal.length; index += 1) {
    const before = sortedOriginal[index];
    const after = sortedEdited[index];
    if (
      !before ||
      !after ||
      !withinBound(before.weight, after.weight) ||
      !withinBound(before.weightMin, after.weightMin) ||
      !withinBound(before.weightMax, after.weightMax) ||
      !withinBound(before.seconds, after.seconds) ||
      !withinBound(before.distance, after.distance)
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
  const requestFingerprint = fingerprint(input);

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
      const replaySnapshot = workoutProgressionRecommendationSchema.parse(
        replayRecommendation.snapshot,
      );
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
    const snapshot = workoutProgressionRecommendationSchema.parse(row.snapshot);
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

    const appliedTargets = resolveAppliedTargets(input, snapshot);
    if (input.action === 'edit') {
      assertBoundedEdit(snapshot.recommendedTargets, appliedTargets);
    }
    if (input.action === 'accept' || input.action === 'edit') {
      const persistedSets = tx
        .select({
          id: scheduledWorkoutExerciseSets.id,
          setNumber: scheduledWorkoutExerciseSets.setNumber,
        })
        .from(scheduledWorkoutExerciseSets)
        .where(
          eq(
            scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId,
            row.scheduledWorkoutExerciseId,
          ),
        )
        .all();
      const targetBySetNumber = new Map(appliedTargets.map((target) => [target.setNumber, target]));
      if (persistedSets.length !== appliedTargets.length) {
        throw new WorkoutProgressionStaleError('Workout progression recommendation is stale');
      }
      for (const persistedSet of persistedSets) {
        const target = targetBySetNumber.get(persistedSet.setNumber);
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
    return input.editedTargets ?? [];
  }
  if (snapshot === null) {
    return [];
  }
  return input.action === 'accept' ? snapshot.recommendedTargets : snapshot.evidence.priorTargets;
}
