import type Database from 'better-sqlite3';
import {
  bodyConcernSchema,
  capabilitySchema,
  guidanceSchema,
  healthObservationSchema,
  journalObservationSchema,
  sessionContextFoundationProjection,
  sessionContextRuntimeSchema,
  type SessionContextRuntime,
} from '@pulse/shared';

import { getApplicationNow } from '../../lib/clock.js';
import { getDateKeyInTimeZone, resolveUserTimeZoneForUser } from '../../lib/user-time-zone.js';
import { listBodyCapabilities, listBodyConcerns, listBodyGuidance } from '../body-context/store.js';
import { readSourceReference } from '../daily-check-in/source-authority.js';

export class SessionContextNotFoundError extends Error {}
export class SessionContextTimeZoneError extends Error {}
export class SessionContextReadLimitError extends Error {
  constructor(
    readonly scope: string,
    readonly limit: number,
  ) {
    super('Session context read limit exceeded');
  }
}

const limits = {
  relevant_concerns: 20,
  tracked_irrelevant_concerns: 50,
  positive_focus: 10,
  applicable_guidance: 20,
  recent_observations: 20,
  journal_observations: 20,
  workload_items: 200,
  co_occurrences: 50,
  missing_inputs: 20,
} as const;
const bounded = <T>(items: T[], scope: keyof typeof limits): T[] => {
  if (items.length > limits[scope]) throw new SessionContextReadLimitError(scope, limits[scope]);
  return items;
};
const dateOffset = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T12:00:00.000Z`) - Date.parse(`${from}T12:00:00.000Z`)) / 86_400_000,
  );
const token = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(left|right|bilateral)\b/gu, '')
    .trim()
    .replace(/\s+/gu, ' ');
const aliases: Record<string, string[]> = {
  shoulder: ['front delts', 'rear delts', 'side delts', 'delts', 'shoulders'],
  deltoid: ['front delts', 'rear delts', 'side delts', 'delts', 'shoulders'],
  delts: ['front delts', 'rear delts', 'side delts', 'delts', 'shoulders'],
  chest: ['chest', 'pecs'],
  pec: ['chest', 'pecs'],
  pecs: ['chest', 'pecs'],
  lats: ['lats'],
  'upper back': ['upper back', 'traps'],
  trap: ['upper back', 'traps'],
  traps: ['upper back', 'traps'],
  'lower back': ['lower back', 'erectors'],
  lumbar: ['lower back', 'erectors'],
  erectors: ['lower back', 'erectors'],
  quad: ['quads'],
  quads: ['quads'],
  hamstring: ['hamstrings'],
  hamstrings: ['hamstrings'],
  glute: ['glutes'],
  glutes: ['glutes'],
  hip: ['glutes', 'hip flexors'],
  calf: ['calves'],
  calves: ['calves'],
  ankle: ['calves'],
};
const freshness = (
  source: { freshness: { state: string; asOf: string | null; reasons: string[] } },
  localDate: string,
  timeZone: string,
) => {
  const stored = source.freshness;
  if (
    stored.state === 'current' &&
    stored.asOf &&
    daysBetween(getDateKeyInTimeZone(new Date(stored.asOf), timeZone), localDate) > 14
  )
    return {
      state: 'stale' as const,
      asOf: stored.asOf,
      reasons: [...stored.reasons, 'as_of_older_than_14_local_days'],
    };
  return stored;
};
const allPages = async <T>(
  read: (page: number, limit: number) => Promise<{ data: T[]; total: number }>,
): Promise<T[]> => {
  const first = await read(1, 100);
  const result = [...first.data];
  for (let page = 2; result.length < first.total; page++)
    result.push(...(await read(page, 100)).data);
  return result;
};
const rows = <T>(sqlite: Database.Database, sql: string, args: unknown[]): T[] =>
  sqlite.prepare(sql).all(...args) as T[];
type Workout = { id: string; date: string; status: string; duration: number | null };
type Execution = {
  id: string;
  actualLocalDate: string;
  durationMinutes: number | null;
  outcome: 'completed' | 'partial';
  structuredWorkoutSessionId: string | null;
};
type Flare = {
  id: string;
  concernId: string;
  occurredAt: string;
  localDate: string;
  timeZone: string;
  observation: string;
  sourceJson: string;
};
type JournalRow = { snapshotJson: string };

export async function buildSessionContext({
  sqlite,
  userId,
  sessionId,
  date,
}: {
  sqlite: Database.Database;
  userId: string;
  sessionId?: string;
  date?: string;
}): Promise<SessionContextRuntime> {
  const zone = await resolveUserTimeZoneForUser(userId);
  if (!zone) throw new SessionContextTimeZoneError();
  const target = sessionId
    ? rows<Workout>(
        sqlite,
        "select id,date,status,duration from workout_sessions where id=? and user_id=? and deleted_at is null and status in ('scheduled','in-progress','paused','completed') limit 1",
        [sessionId, userId],
      )[0]
    : undefined;
  if (sessionId && !target) throw new SessionContextNotFoundError();
  const localDate =
    target?.date ?? date ?? getDateKeyInTimeZone(getApplicationNow(), zone.timeZone);
  const startLocalDate = dateOffset(localDate, -6);
  const workouts = rows<Workout>(
    sqlite,
    "select id,date,status,duration from workout_sessions where user_id=? and deleted_at is null and date between ? and ? and status in ('in-progress','paused','completed') order by date,id",
    [userId, startLocalDate, localDate],
  );
  const executions = rows<Execution>(
    sqlite,
    "select id,actual_local_date as actualLocalDate,duration_minutes as durationMinutes,outcome,structured_workout_session_id as structuredWorkoutSessionId from activity_executions where user_id=? and actual_local_date between ? and ? and outcome in ('completed','partial') order by actual_local_date,id",
    [userId, startLocalDate, localDate],
  );
  const workoutById = new Map(workouts.map((workout) => [workout.id, workout]));
  const linked = new Map<string, string[]>();
  const missingInputs: string[] = ['sleep', 'training_phase'];
  const items: SessionContextRuntime['workload']['items'] = [];
  for (const workout of workouts) {
    const sourceReference = readSourceReference(sqlite, userId, 'workout_session', workout.id);
    if (!sourceReference) continue;
    items.push({
      identityKind: 'workout_session',
      identityId: workout.id,
      localDate: workout.date,
      activityDurationMinutes: null,
      workoutDurationSeconds: workout.duration,
      outcomeOrStatus: workout.status as 'completed' | 'in-progress' | 'paused',
      sourceReference: { ...sourceReference, kind: 'workout_session' },
      linkedActivityExecutionIds: [],
    });
    if (workout.duration === null) missingInputs.push(`workout_load_duration:${workout.id}`);
  }
  for (const execution of executions) {
    if (execution.structuredWorkoutSessionId) {
      const workout = workoutById.get(execution.structuredWorkoutSessionId);
      if (!workout || workout.date !== execution.actualLocalDate) {
        missingInputs.push(`linked_load_mismatch:${execution.id}`);
        continue;
      }
      linked.set(workout.id, [...(linked.get(workout.id) ?? []), execution.id]);
      continue;
    }
    const sourceReference = readSourceReference(sqlite, userId, 'activity_execution', execution.id);
    if (!sourceReference) continue;
    items.push({
      identityKind: 'activity_execution',
      identityId: execution.id,
      localDate: execution.actualLocalDate,
      activityDurationMinutes: execution.durationMinutes,
      workoutDurationSeconds: null,
      outcomeOrStatus: execution.outcome,
      sourceReference: { ...sourceReference, kind: 'activity_execution' },
      linkedActivityExecutionIds: [],
    });
    if (execution.durationMinutes === null)
      missingInputs.push(`activity_load_duration:${execution.id}`);
  }
  for (const item of items)
    if (item.identityKind === 'workout_session')
      item.linkedActivityExecutionIds = linked.get(item.identityId) ?? [];
  bounded(items, 'workload_items');
  items.sort(
    (a, b) =>
      a.localDate.localeCompare(b.localDate) ||
      a.identityKind.localeCompare(b.identityKind) ||
      a.identityId.localeCompare(b.identityId),
  );
  const activityItems = items.filter((item) => item.identityKind === 'activity_execution');
  const workoutItems = items.filter((item) => item.identityKind === 'workout_session');
  const workload: SessionContextRuntime['workload'] = {
    window: { startLocalDate, endLocalDate: localDate, timeZone: zone.timeZone },
    items,
    totals: {
      activityExecutionCount: activityItems.length,
      workoutSessionCount: workoutItems.length,
      activityDurationMinutes: activityItems.some((item) => item.activityDurationMinutes === null)
        ? null
        : activityItems.reduce((sum, item) => sum + (item.activityDurationMinutes ?? 0), 0),
      workoutDurationSeconds: workoutItems.some((item) => item.workoutDurationSeconds === null)
        ? null
        : workoutItems.reduce((sum, item) => sum + (item.workoutDurationSeconds ?? 0), 0),
    },
  };
  const muscleGroups = new Set<string>();
  if (sessionId) {
    for (const row of rows<{ muscleGroups: string }>(
      sqlite,
      'select e.muscle_groups as muscleGroups from session_sets s join exercises e on e.id=s.exercise_id where s.session_id=? and (e.user_id=? or e.user_id is null) and e.deleted_at is null',
      [sessionId, userId],
    )) {
      for (const group of JSON.parse(row.muscleGroups) as string[]) muscleGroups.add(token(group));
    }
  }
  const concerns = (await allPages((page, limit) => listBodyConcerns(userId, page, limit)))
    .map(
      ({
        id,
        subjectUserId,
        label,
        bodyRegion,
        symptomState,
        managementState,
        source,
        currentRevisionId,
        createdAt,
        updatedAt,
      }) =>
        bodyConcernSchema.parse({
          id,
          subjectUserId,
          label,
          bodyRegion,
          symptomState,
          managementState,
          source,
          currentRevisionId,
          createdAt,
          updatedAt,
        }),
    )
    .filter((row) => row.managementState !== 'archived');
  const capabilities = (
    await allPages((page, limit) => listBodyCapabilities(userId, page, limit))
  ).map(({ id, subjectUserId, label, state, source, currentRevisionId, updatedAt }) =>
    capabilitySchema.parse({
      id,
      subjectUserId,
      label,
      state,
      source,
      currentRevisionId,
      updatedAt,
    }),
  );
  const guidance = (await allPages((page, limit) => listBodyGuidance(userId, page, limit)))
    .map(
      ({
        id,
        subjectUserId,
        concernId,
        capabilityId,
        text,
        state,
        source,
        currentRevisionId,
        createdAt,
      }) =>
        guidanceSchema.parse({
          id,
          subjectUserId,
          concernId,
          capabilityId,
          text,
          state,
          source,
          currentRevisionId,
          createdAt,
        }),
    )
    .filter((row) => row.state === 'current');
  const flareRows = rows<Flare>(
    sqlite,
    'select id,concern_id as concernId,occurred_at as occurredAt,local_date as localDate,time_zone as timeZone,observation,source_json as sourceJson from body_context_flares where user_id=? and local_date between ? and ? order by occurred_at,id limit 21',
    [userId, startLocalDate, localDate],
  );
  bounded(flareRows, 'recent_observations');
  const recentObservations = flareRows.map((flare) => {
    const sourceReference = readSourceReference(sqlite, userId, 'observation', flare.id);
    if (!sourceReference) throw new Error('Current flare source unavailable');
    return healthObservationSchema.parse({
      id: flare.id,
      subjectUserId: userId,
      category: 'injury',
      text: flare.observation,
      finding: 'affirmed',
      occurredAt: flare.occurredAt,
      localDate: flare.localDate,
      timeZone: flare.timeZone,
      source: JSON.parse(flare.sourceJson),
      concernIds: [flare.concernId],
      capabilityIds: [],
      activityExecutionIds: [],
      workoutSessionIds: [],
      currentRevisionId: sourceReference.revisionId,
    });
  });
  const journalRows = rows<JournalRow>(
    sqlite,
    'select snapshot_json as snapshotJson from journal_observations where user_id=? and local_date between ? and ? order by local_date,created_at,id limit 21',
    [userId, startLocalDate, localDate],
  );
  bounded(journalRows, 'journal_observations');
  const journalObservations = journalRows.map((row) =>
    journalObservationSchema.parse(JSON.parse(row.snapshotJson)),
  );
  const relevantConcerns = concerns.filter((concern) => {
    const muscleMatch =
      !!concern.bodyRegion &&
      (aliases[token(concern.bodyRegion)] ?? []).some((group) => muscleGroups.has(group));
    const guidanceMatch = guidance.some(
      (row) =>
        row.concernId === concern.id &&
        (muscleMatch ||
          (!sessionId &&
            capabilities.some(
              (capability) =>
                capability.id === row.capabilityId &&
                ['developing', 'stable'].includes(capability.state),
            ))),
    );
    const flareMatch = recentObservations.some(
      (flare) =>
        flare.concernIds.includes(concern.id) &&
        (muscleMatch || (!sessionId && flare.localDate === localDate)),
    );
    const journalMatch = journalObservations.some(
      (row) =>
        row.sourceReferences.some((ref) => ref.kind === 'body_concern' && ref.id === concern.id) &&
        (sessionId
          ? row.sourceReferences.some(
              (ref) => ref.kind === 'workout_session' && ref.id === sessionId,
            )
          : row.localDate === localDate),
    );
    return muscleMatch || guidanceMatch || flareMatch || journalMatch;
  });
  bounded(relevantConcerns, 'relevant_concerns');
  const relevantIds = new Set(relevantConcerns.map((row) => row.id));
  const trackedIrrelevantConcerns = bounded(
    concerns.filter((row) => !relevantIds.has(row.id)),
    'tracked_irrelevant_concerns',
  );
  const focusCandidates = capabilities.filter(
    (row) => row.state === 'developing' || row.state === 'stable',
  );
  const linkedFocus = focusCandidates.filter((capability) =>
    guidance.some(
      (row) =>
        row.capabilityId === capability.id && !!row.concernId && relevantIds.has(row.concernId),
    ),
  );
  const positiveFocus = bounded(
    linkedFocus.length
      ? linkedFocus
      : focusCandidates
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
          .slice(0, 1),
    'positive_focus',
  );
  const positiveFocusAttributions = positiveFocus.map((capability) => ({
    capabilityId: capability.id,
    sessionRelevance: (linkedFocus.length ? 'guidance_linked' : 'fallback_recent') as
      | 'guidance_linked'
      | 'fallback_recent',
    derivedFreshness: freshness(capability.source, localDate, zone.timeZone),
  }));
  if (!positiveFocus.length) missingInputs.push('positive_focus');
  const focusIds = new Set(positiveFocus.map((row) => row.id));
  const applicableGuidance = bounded(
    guidance.filter(
      (row) =>
        (!!row.concernId && relevantIds.has(row.concernId)) ||
        (!!row.capabilityId && focusIds.has(row.capabilityId)),
    ),
    'applicable_guidance',
  );
  const guidanceFreshnessAttributions = applicableGuidance.map((row) => ({
    guidanceId: row.id,
    derivedFreshness: freshness(row.source, localDate, zone.timeZone),
  }));
  for (const concern of relevantConcerns)
    if (!guidance.some((row) => row.concernId === concern.id))
      missingInputs.push(`guidance_for_concern:${concern.id}`);
  const coOccurrences: SessionContextRuntime['coOccurrences'] = [];
  for (const observation of [
    ...recentObservations.map((row) => ({ kind: 'flare' as const, row })),
    ...journalObservations.map((row) => ({ kind: 'journal' as const, row })),
  ]) {
    for (const item of items)
      if (observation.row.localDate === item.localDate)
        coOccurrences.push({
          observationKind: observation.kind,
          observationId: observation.row.id,
          loadKind: item.identityKind,
          loadId: item.identityId,
          localDate: item.localDate,
          relationship: 'same_local_date',
        });
  }
  bounded(coOccurrences, 'co_occurrences');
  bounded(missingInputs, 'missing_inputs');
  const result = sessionContextRuntimeSchema.parse({
    contractVersion: 'activity-journal-v1',
    subjectUserId: userId,
    workoutSessionId: sessionId ?? null,
    generatedAt: getApplicationNow().toISOString(),
    localDate,
    timeZone: zone.timeZone,
    target: sessionId
      ? { kind: 'workout_session', workoutSessionId: sessionId }
      : { kind: 'local_date', workoutSessionId: null },
    positiveFocus,
    relevantConcerns,
    applicableGuidance,
    recentObservations,
    missingInputs,
    trackedIrrelevantConcerns,
    journalObservations,
    positiveFocusAttributions,
    guidanceFreshnessAttributions,
    workload,
    coOccurrences,
  });
  if (sessionId) sessionContextFoundationProjection(result);
  return result;
}
