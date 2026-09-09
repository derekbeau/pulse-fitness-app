import { createHash, randomUUID } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';
import {
  canonicalizeWorkoutRepTarget,
  type ExerciseTrackingType,
  type ScheduledWorkoutTemplateDiff,
  type ScheduledWorkoutTemplateDifference,
} from '@pulse/shared';

import type {
  TemplateExerciseSetTarget,
  WorkoutTemplateSectionType,
} from '../../db/schema/index.js';
import {
  exercises,
  scheduledWorkoutExerciseSets,
  scheduledWorkoutExercises,
  scheduledWorkouts,
  templateExercises,
  workoutTemplates,
} from '../../db/schema/index.js';

type PulseDb = typeof import('../../db/index.js').db;

const SECTION_ORDER: WorkoutTemplateSectionType[] = ['warmup', 'main', 'supplemental', 'cooldown'];
const SECTION_RANK: Record<WorkoutTemplateSectionType, number> = {
  warmup: 0,
  main: 1,
  supplemental: 2,
  cooldown: 3,
};
const LEGACY_SECTION_RANK: Record<WorkoutTemplateSectionType, number> = {
  warmup: 0,
  main: 1,
  cooldown: 2,
  supplemental: 3,
};

type TemplateExerciseSnapshotRow = {
  id: string;
  exerciseId: string;
  section: WorkoutTemplateSectionType;
  orderIndex: number;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  tempo: string | null;
  restSeconds: number | null;
  supersetGroup: string | null;
  notes: string | null;
  programmingNotes: string | null;
  cues: string[] | null;
  setTargets: TemplateExerciseSetTarget[] | null;
};

export type ScheduledWorkoutSnapshotSet = {
  id: string;
  scheduledWorkoutExerciseId: string;
  setNumber: number;
  repsMin: number | null;
  repsMax: number | null;
  reps: number | null;
  targetWeight: number | null;
  targetWeightMin: number | null;
  targetWeightMax: number | null;
  targetSeconds: number | null;
  targetDistance: number | null;
  targetZone: number | null;
  createdAt: number;
};

export type ScheduledWorkoutSnapshotExercise = {
  id: string;
  scheduledWorkoutId: string;
  exerciseId: string;
  exerciseNameSnapshot: string | null;
  trackingTypeSnapshot: typeof exercises.$inferSelect.trackingType | null;
  section: WorkoutTemplateSectionType;
  orderIndex: number;
  programmingNotes: string | null;
  agentNotes: string | null;
  agentNotesMeta: {
    author: string;
    generatedAt: string;
    scheduledDateAtGeneration: string;
    stale?: boolean;
  } | null;
  templateCues: string[] | null;
  supersetGroup: string | null;
  tempo: string | null;
  restSeconds: number | null;
  createdAt: number;
  updatedAt: number;
  sets: ScheduledWorkoutSnapshotSet[];
};

export type ScheduledWorkoutSnapshot = {
  scheduledWorkoutId: string;
  exercises: ScheduledWorkoutSnapshotExercise[];
};

type SemanticSet = Omit<
  ScheduledWorkoutSnapshotSet,
  'id' | 'scheduledWorkoutExerciseId' | 'createdAt'
>;

type SemanticExercise = {
  exerciseId: string;
  exerciseName: string;
  trackingType: ExerciseTrackingType | null;
  section: WorkoutTemplateSectionType;
  orderIndex: number;
  programmingNotes: string | null;
  supersetGroup: string | null;
  tempo: string | null;
  restSeconds: number | null;
  sets: SemanticSet[];
};

type SnapshotWriteResult = {
  templateVersion: string;
  exerciseCount: number;
  setCount: number;
};

const resolveDb = async (database?: PulseDb): Promise<PulseDb> => {
  if (database) {
    return database;
  }

  const { db } = await import('../../db/index.js');
  return db;
};

const templateExerciseSnapshotSelection = {
  id: templateExercises.id,
  exerciseId: templateExercises.exerciseId,
  section: templateExercises.section,
  orderIndex: templateExercises.orderIndex,
  sets: templateExercises.sets,
  repsMin: templateExercises.repsMin,
  repsMax: templateExercises.repsMax,
  tempo: templateExercises.tempo,
  restSeconds: templateExercises.restSeconds,
  supersetGroup: templateExercises.supersetGroup,
  notes: templateExercises.notes,
  programmingNotes: templateExercises.programmingNotes,
  cues: templateExercises.cues,
  setTargets: templateExercises.setTargets,
};

const scheduledWorkoutExerciseSelection = {
  id: scheduledWorkoutExercises.id,
  scheduledWorkoutId: scheduledWorkoutExercises.scheduledWorkoutId,
  exerciseId: scheduledWorkoutExercises.exerciseId,
  exerciseNameSnapshot: scheduledWorkoutExercises.exerciseNameSnapshot,
  trackingTypeSnapshot: scheduledWorkoutExercises.trackingTypeSnapshot,
  section: scheduledWorkoutExercises.section,
  orderIndex: scheduledWorkoutExercises.orderIndex,
  programmingNotes: scheduledWorkoutExercises.programmingNotes,
  agentNotes: scheduledWorkoutExercises.agentNotes,
  agentNotesMeta: scheduledWorkoutExercises.agentNotesMeta,
  templateCues: scheduledWorkoutExercises.templateCues,
  supersetGroup: scheduledWorkoutExercises.supersetGroup,
  tempo: scheduledWorkoutExercises.tempo,
  restSeconds: scheduledWorkoutExercises.restSeconds,
  createdAt: scheduledWorkoutExercises.createdAt,
  updatedAt: scheduledWorkoutExercises.updatedAt,
};

const scheduledWorkoutExerciseSetSelection = {
  id: scheduledWorkoutExerciseSets.id,
  scheduledWorkoutExerciseId: scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId,
  setNumber: scheduledWorkoutExerciseSets.setNumber,
  repsMin: scheduledWorkoutExerciseSets.repsMin,
  repsMax: scheduledWorkoutExerciseSets.repsMax,
  reps: scheduledWorkoutExerciseSets.reps,
  targetWeight: scheduledWorkoutExerciseSets.targetWeight,
  targetWeightMin: scheduledWorkoutExerciseSets.targetWeightMin,
  targetWeightMax: scheduledWorkoutExerciseSets.targetWeightMax,
  targetSeconds: scheduledWorkoutExerciseSets.targetSeconds,
  targetDistance: scheduledWorkoutExerciseSets.targetDistance,
  targetZone: scheduledWorkoutExerciseSets.targetZone,
  createdAt: scheduledWorkoutExerciseSets.createdAt,
};

const toExerciseProgrammingNotes = (
  row: Pick<TemplateExerciseSnapshotRow, 'programmingNotes' | 'notes'>,
) => row.programmingNotes ?? row.notes ?? null;

const normalizeOptionalString = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const compareTemplateExercisesByRank =
  (sectionRank: Record<WorkoutTemplateSectionType, number>) =>
  (left: TemplateExerciseSnapshotRow, right: TemplateExerciseSnapshotRow): number => {
    const sectionDelta = sectionRank[left.section] - sectionRank[right.section];
    if (sectionDelta !== 0) {
      return sectionDelta;
    }

    if (left.orderIndex !== right.orderIndex) {
      return left.orderIndex - right.orderIndex;
    }

    return left.id.localeCompare(right.id);
  };

const compareTemplateExercises = compareTemplateExercisesByRank(SECTION_RANK);
const compareLegacyTemplateExercises = compareTemplateExercisesByRank(LEGACY_SECTION_RANK);

type SnapshotSetDraft = {
  setNumber: number;
  repsMin: number | null;
  repsMax: number | null;
  reps: number | null;
  targetWeight: number | null;
  targetWeightMin: number | null;
  targetWeightMax: number | null;
  targetSeconds: number | null;
  targetDistance: number | null;
};

const toSnapshotSetDrafts = (row: TemplateExerciseSnapshotRow): SnapshotSetDraft[] => {
  const targets = [...(row.setTargets ?? [])].sort(
    (left, right) => left.setNumber - right.setNumber,
  );
  const rawReps = {
    reps: row.repsMin !== null && row.repsMin === row.repsMax ? row.repsMin : null,
    repsMin: row.repsMin,
    repsMax: row.repsMax,
  };
  let canonicalReps = rawReps;
  try {
    canonicalReps = canonicalizeWorkoutRepTarget(rawReps);
  } catch {
    // Legacy template rows can predate current validation. Preserve their raw values so reads can
    // return an actionable integrity warning instead of failing the entire detail request.
  }

  if (targets.length > 0) {
    return targets.map((target) => ({
      setNumber: target.setNumber,
      repsMin: canonicalReps.repsMin ?? null,
      repsMax: canonicalReps.repsMax ?? null,
      reps: canonicalReps.reps ?? null,
      targetWeight: target.targetWeight ?? null,
      targetWeightMin: target.targetWeightMin ?? null,
      targetWeightMax: target.targetWeightMax ?? null,
      targetSeconds: target.targetSeconds ?? null,
      targetDistance: target.targetDistance ?? null,
    }));
  }

  const setCount = Math.max(1, row.sets ?? 1);
  return Array.from({ length: setCount }, (_, index) => ({
    setNumber: index + 1,
    repsMin: canonicalReps.repsMin ?? null,
    repsMax: canonicalReps.repsMax ?? null,
    reps: canonicalReps.reps ?? null,
    targetWeight: null,
    targetWeightMin: null,
    targetWeightMax: null,
    targetSeconds: null,
    targetDistance: null,
  }));
};

const toTemplateVersionPayload = (rows: TemplateExerciseSnapshotRow[]) =>
  rows.map((row) => ({
    exerciseId: row.exerciseId,
    section: row.section,
    orderIndex: row.orderIndex,
    programmingNotes: toExerciseProgrammingNotes(row),
    templateCues: row.cues ?? null,
    supersetGroup: row.supersetGroup,
    tempo: row.tempo,
    restSeconds: row.restSeconds,
    sets: toSnapshotSetDrafts(row).map((set) => ({
      setNumber: set.setNumber,
      repsMin: set.repsMin,
      repsMax: set.repsMax,
      reps: set.reps,
      targetWeight: set.targetWeight,
      targetWeightMin: set.targetWeightMin,
      targetWeightMax: set.targetWeightMax,
      targetSeconds: set.targetSeconds,
      targetDistance: set.targetDistance,
      targetZone: null,
    })),
  }));

export const computeScheduledWorkoutTemplateVersion = (
  rows: TemplateExerciseSnapshotRow[],
): string =>
  createHash('sha256')
    .update(JSON.stringify(toTemplateVersionPayload(rows)))
    .digest('hex');

export const computeTemplateVersionForTemplateId = async (
  templateId: string,
  database?: PulseDb,
): Promise<string> => {
  const versions = await computeCompatibleTemplateVersionsForTemplateId(templateId, database);

  return versions.current;
};

export const computeCompatibleTemplateVersionsForTemplateId = async (
  templateId: string,
  database?: PulseDb,
): Promise<{ current: string; compatible: string[] }> => {
  const db = await resolveDb(database);
  const templateRows = db
    .select(templateExerciseSnapshotSelection)
    .from(templateExercises)
    .where(eq(templateExercises.templateId, templateId))
    .all();
  const current = computeScheduledWorkoutTemplateVersion(
    [...templateRows].sort(compareTemplateExercises),
  );
  const legacy = computeScheduledWorkoutTemplateVersion(
    [...templateRows].sort(compareLegacyTemplateExercises),
  );

  return {
    current,
    compatible: Array.from(new Set([current, legacy])),
  };
};

export const templateVersionMatchesCurrentTemplate = async ({
  database,
  templateId,
  templateVersion,
}: {
  database?: PulseDb;
  templateId: string;
  templateVersion: string;
}): Promise<boolean> => {
  const versions = await computeCompatibleTemplateVersionsForTemplateId(templateId, database);

  return versions.compatible.includes(templateVersion);
};

export const readSnapshot = async (
  scheduledWorkoutId: string,
  database?: PulseDb,
): Promise<ScheduledWorkoutSnapshot> => {
  const db = await resolveDb(database);

  const exercisesRows = db
    .select(scheduledWorkoutExerciseSelection)
    .from(scheduledWorkoutExercises)
    .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
    .all()
    .sort((left, right) => {
      const sectionDelta = SECTION_RANK[left.section] - SECTION_RANK[right.section];
      if (sectionDelta !== 0) {
        return sectionDelta;
      }

      if (left.orderIndex !== right.orderIndex) {
        return left.orderIndex - right.orderIndex;
      }

      return left.id.localeCompare(right.id);
    });

  if (exercisesRows.length === 0) {
    return {
      scheduledWorkoutId,
      exercises: [],
    };
  }

  const setRows = db
    .select(scheduledWorkoutExerciseSetSelection)
    .from(scheduledWorkoutExerciseSets)
    .where(
      inArray(
        scheduledWorkoutExerciseSets.scheduledWorkoutExerciseId,
        exercisesRows.map((row) => row.id),
      ),
    )
    .all()
    .sort((left, right) => {
      if (left.scheduledWorkoutExerciseId !== right.scheduledWorkoutExerciseId) {
        return left.scheduledWorkoutExerciseId.localeCompare(right.scheduledWorkoutExerciseId);
      }

      if (left.setNumber !== right.setNumber) {
        return left.setNumber - right.setNumber;
      }

      return left.id.localeCompare(right.id);
    });

  const setsByExerciseId = new Map<string, ScheduledWorkoutSnapshotSet[]>();
  for (const setRow of setRows) {
    const existing = setsByExerciseId.get(setRow.scheduledWorkoutExerciseId) ?? [];
    existing.push(setRow);
    setsByExerciseId.set(setRow.scheduledWorkoutExerciseId, existing);
  }

  return {
    scheduledWorkoutId,
    exercises: exercisesRows.map((exerciseRow) => ({
      ...exerciseRow,
      sets: setsByExerciseId.get(exerciseRow.id) ?? [],
    })),
  };
};

const SEMANTIC_FIELDS: Array<{
  field: keyof SemanticSet;
  label: string;
}> = [
  { field: 'reps', label: 'Reps' },
  { field: 'repsMin', label: 'Minimum reps' },
  { field: 'repsMax', label: 'Maximum reps' },
  { field: 'targetWeight', label: 'Target weight' },
  { field: 'targetWeightMin', label: 'Minimum target weight' },
  { field: 'targetWeightMax', label: 'Maximum target weight' },
  { field: 'targetSeconds', label: 'Duration target' },
  { field: 'targetDistance', label: 'Distance target' },
  { field: 'targetZone', label: 'Zone target' },
];

const formatSemanticValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return 'Not set';
  }
  return String(value);
};

const normalizeSet = (set: SemanticSet): SemanticSet => {
  try {
    const reps = canonicalizeWorkoutRepTarget({
      reps: set.reps,
      repsMin: set.repsMin,
      repsMax: set.repsMax,
    });
    return {
      ...set,
      reps: reps.reps ?? null,
      repsMin: reps.repsMin ?? null,
      repsMax: reps.repsMax ?? null,
    };
  } catch {
    return set;
  }
};

const invalidSetReason = (set: SemanticSet): string | null => {
  if (!Number.isInteger(set.setNumber) || set.setNumber < 1) return 'Set number must be positive.';
  const positiveIntegers = [set.reps, set.repsMin, set.repsMax];
  if (positiveIntegers.some((value) => value !== null && (!Number.isInteger(value) || value < 1))) {
    return 'Rep targets must be positive whole numbers.';
  }
  if (set.reps !== null && (set.repsMin !== null || set.repsMax !== null)) {
    const exactRange = set.repsMin === set.reps && set.repsMax === set.reps;
    if (!exactRange) return 'Exact reps conflict with the rep range.';
  }
  if (set.repsMin !== null && set.repsMax !== null && set.repsMin > set.repsMax) {
    return 'Minimum reps exceed maximum reps.';
  }
  const nonNegative = [
    set.targetWeight,
    set.targetWeightMin,
    set.targetWeightMax,
    set.targetSeconds,
    set.targetDistance,
  ];
  if (nonNegative.some((value) => value !== null && (!Number.isFinite(value) || value < 0))) {
    return 'Targets must be zero or greater.';
  }
  if (set.targetSeconds !== null && !Number.isInteger(set.targetSeconds)) {
    return 'Duration target must be a whole number of seconds.';
  }
  if (
    set.targetWeightMin !== null &&
    set.targetWeightMax !== null &&
    set.targetWeightMin > set.targetWeightMax
  ) {
    return 'Minimum target weight exceeds maximum target weight.';
  }
  if (
    set.targetZone !== null &&
    (!Number.isInteger(set.targetZone) || set.targetZone < 1 || set.targetZone > 5)
  ) {
    return 'Zone target must be a whole number from 1 to 5.';
  }
  return null;
};

const difference = ({
  category = 'prescription',
  exercise,
  field,
  label,
  provenance,
  scheduledValue,
  setNumber = null,
  templateValue,
}: {
  category?: ScheduledWorkoutTemplateDifference['category'];
  exercise: Pick<SemanticExercise, 'exerciseId' | 'exerciseName'>;
  field: string;
  label: string;
  provenance: ScheduledWorkoutTemplateDifference['provenance'];
  scheduledValue: unknown;
  setNumber?: number | null;
  templateValue: unknown;
}): ScheduledWorkoutTemplateDifference => ({
  category,
  severity: category === 'integrity' ? 'warning' : 'info',
  exerciseId: exercise.exerciseId || null,
  exerciseName: exercise.exerciseName,
  field,
  label,
  setNumber,
  scheduledValue: formatSemanticValue(scheduledValue),
  templateValue: formatSemanticValue(templateValue),
  provenance,
});

const compareExercise = (
  scheduled: SemanticExercise,
  template: SemanticExercise,
  provenance: ScheduledWorkoutTemplateDifference['provenance'],
): ScheduledWorkoutTemplateDifference[] => {
  const differences: ScheduledWorkoutTemplateDifference[] = [];
  const add = (field: string, label: string, scheduledValue: unknown, templateValue: unknown) => {
    if (scheduledValue !== templateValue) {
      differences.push(
        difference({
          exercise: scheduled,
          field,
          label,
          provenance,
          scheduledValue,
          templateValue,
        }),
      );
    }
  };

  add('section', 'Section', scheduled.section, template.section);
  add('order', 'Exercise order', scheduled.orderIndex + 1, template.orderIndex + 1);
  if (scheduled.trackingType !== template.trackingType) {
    differences.push(
      difference({
        category: 'integrity',
        exercise: scheduled,
        field: 'trackingType',
        label: 'Tracking type',
        provenance,
        scheduledValue: scheduled.trackingType,
        templateValue: template.trackingType,
      }),
    );
  }
  add(
    'programmingNotes',
    'Programming notes',
    scheduled.programmingNotes,
    template.programmingNotes,
  );
  add('supersetGroup', 'Superset group', scheduled.supersetGroup, template.supersetGroup);
  add('tempo', 'Tempo', scheduled.tempo, template.tempo);
  add('restSeconds', 'Rest', scheduled.restSeconds, template.restSeconds);
  add('setCount', 'Set count', scheduled.sets.length, template.sets.length);

  const setNumbers = new Set([
    ...scheduled.sets.map((set) => set.setNumber),
    ...template.sets.map((set) => set.setNumber),
  ]);
  for (const setNumber of [...setNumbers].sort((left, right) => left - right)) {
    const scheduledSet = scheduled.sets.find((set) => set.setNumber === setNumber);
    const templateSet = template.sets.find((set) => set.setNumber === setNumber);
    if (!scheduledSet || !templateSet) continue;
    for (const { field, label } of SEMANTIC_FIELDS) {
      if (scheduledSet[field] !== templateSet[field]) {
        differences.push(
          difference({
            exercise: scheduled,
            field,
            label,
            provenance,
            scheduledValue: scheduledSet[field],
            setNumber,
            templateValue: templateSet[field],
          }),
        );
      }
    }
  }

  return differences;
};

export const inspectScheduledWorkoutTemplateDiff = async ({
  database,
  scheduledTemplateVersion,
  snapshot,
  templateId,
}: {
  database?: PulseDb;
  scheduledTemplateVersion: string | null;
  snapshot: ScheduledWorkoutSnapshot;
  templateId: string;
}): Promise<ScheduledWorkoutTemplateDiff | null> => {
  const db = await resolveDb(database);
  const templateRows = db
    .select(templateExerciseSnapshotSelection)
    .from(templateExercises)
    .where(eq(templateExercises.templateId, templateId))
    .all()
    .sort(compareTemplateExercises);
  const exerciseIds = [
    ...new Set([
      ...snapshot.exercises.map((exercise) => exercise.exerciseId),
      ...templateRows.map((exercise) => exercise.exerciseId),
    ]),
  ];
  const exerciseMetadata =
    exerciseIds.length === 0
      ? []
      : db
          .select({ id: exercises.id, name: exercises.name, trackingType: exercises.trackingType })
          .from(exercises)
          .where(inArray(exercises.id, exerciseIds))
          .all();
  const metadataById = new Map(exerciseMetadata.map((row) => [row.id, row]));
  const currentTemplateVersion = computeScheduledWorkoutTemplateVersion(templateRows);
  const provenance = scheduledTemplateVersion ? 'known' : 'unknown';

  const scheduledExercises: SemanticExercise[] = snapshot.exercises.map((exercise) => ({
    exerciseId: exercise.exerciseId,
    exerciseName:
      exercise.exerciseNameSnapshot ??
      metadataById.get(exercise.exerciseId)?.name ??
      'Unknown exercise',
    trackingType: exercise.trackingTypeSnapshot,
    section: exercise.section,
    orderIndex: exercise.orderIndex,
    programmingNotes: normalizeOptionalString(exercise.programmingNotes),
    supersetGroup: normalizeOptionalString(exercise.supersetGroup),
    tempo: normalizeOptionalString(exercise.tempo),
    restSeconds: exercise.restSeconds,
    sets: exercise.sets.map((set) =>
      normalizeSet({
        setNumber: set.setNumber,
        repsMin: set.repsMin,
        repsMax: set.repsMax,
        reps: set.reps,
        targetWeight: set.targetWeight,
        targetWeightMin: set.targetWeightMin,
        targetWeightMax: set.targetWeightMax,
        targetSeconds: set.targetSeconds,
        targetDistance: set.targetDistance,
        targetZone: set.targetZone,
      }),
    ),
  }));
  const templateExercisesCurrent: SemanticExercise[] = templateRows.map((row) => ({
    exerciseId: row.exerciseId,
    exerciseName: metadataById.get(row.exerciseId)?.name ?? 'Unknown exercise',
    trackingType: metadataById.get(row.exerciseId)?.trackingType ?? null,
    section: row.section,
    orderIndex: row.orderIndex,
    programmingNotes: normalizeOptionalString(toExerciseProgrammingNotes(row)),
    supersetGroup: normalizeOptionalString(row.supersetGroup),
    tempo: normalizeOptionalString(row.tempo),
    restSeconds: row.restSeconds,
    sets: toSnapshotSetDrafts(row).map((set) => normalizeSet({ ...set, targetZone: null })),
  }));

  const differences: ScheduledWorkoutTemplateDifference[] = [];
  const unmatchedTemplate = [...templateExercisesCurrent];
  const unmatchedScheduled: SemanticExercise[] = [];
  for (const scheduled of scheduledExercises) {
    const templateIndex = unmatchedTemplate.findIndex(
      (template) => template.exerciseId === scheduled.exerciseId,
    );
    if (templateIndex === -1) {
      unmatchedScheduled.push(scheduled);
      continue;
    }
    const template = unmatchedTemplate.splice(templateIndex, 1)[0] as SemanticExercise;
    differences.push(...compareExercise(scheduled, template, provenance));
  }

  while (unmatchedScheduled.length > 0 || unmatchedTemplate.length > 0) {
    const scheduled = unmatchedScheduled.shift();
    const template = unmatchedTemplate.shift();
    const exercise = scheduled ?? template;
    if (!exercise) break;
    differences.push(
      difference({
        category: 'integrity',
        exercise,
        field: 'exercise',
        label: 'Exercise',
        provenance,
        scheduledValue: scheduled?.exerciseName ?? null,
        templateValue: template?.exerciseName ?? null,
      }),
    );
  }

  for (const exercise of [...scheduledExercises, ...templateExercisesCurrent]) {
    const duplicateSetNumbers = exercise.sets.filter(
      (set, index, sets) =>
        sets.findIndex((candidate) => candidate.setNumber === set.setNumber) !== index,
    );
    for (const set of exercise.sets) {
      const reason = invalidSetReason(set);
      if (reason) {
        differences.push(
          difference({
            category: 'integrity',
            exercise,
            field: 'invalidTarget',
            label: 'Invalid target',
            provenance,
            scheduledValue: scheduledExercises.includes(exercise) ? reason : 'Valid',
            setNumber: set.setNumber,
            templateValue: templateExercisesCurrent.includes(exercise) ? reason : 'Valid',
          }),
        );
      }
    }
    if (duplicateSetNumbers.length > 0) {
      differences.push(
        difference({
          category: 'integrity',
          exercise,
          field: 'duplicateSetNumber',
          label: 'Duplicate set number',
          provenance,
          scheduledValue: scheduledExercises.includes(exercise) ? 'Duplicate' : 'Valid',
          templateValue: templateExercisesCurrent.includes(exercise) ? 'Duplicate' : 'Valid',
        }),
      );
    }
  }

  if (differences.length === 0) return null;
  const hasIntegrityWarning = differences.some((item) => item.severity === 'warning');
  return {
    status: hasIntegrityWarning ? 'integrity_warning' : 'customized',
    summary: hasIntegrityWarning
      ? 'Review plan integrity before starting.'
      : 'Customized for this session.',
    provenance: {
      status: provenance,
      scheduledTemplateVersion,
      currentTemplateVersion,
    },
    differences,
  };
};

export const deleteSnapshot = async (
  scheduledWorkoutId: string,
  database?: PulseDb,
): Promise<number> => {
  const db = await resolveDb(database);
  const result = db
    .delete(scheduledWorkoutExercises)
    .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
    .run();

  return result.changes;
};

export const writeSnapshot = async ({
  scheduledWorkoutId,
  templateId,
  database,
}: {
  scheduledWorkoutId: string;
  templateId: string;
  database?: PulseDb;
}): Promise<SnapshotWriteResult> => {
  const db = await resolveDb(database);

  return db.transaction((tx) => {
    const template = tx
      .select({
        id: workoutTemplates.id,
        deletedAt: workoutTemplates.deletedAt,
      })
      .from(workoutTemplates)
      .where(eq(workoutTemplates.id, templateId))
      .limit(1)
      .get();

    if (!template || template.deletedAt !== null) {
      throw new Error(`Cannot snapshot missing or deleted template: ${templateId}`);
    }

    const templateRows = tx
      .select(templateExerciseSnapshotSelection)
      .from(templateExercises)
      .where(eq(templateExercises.templateId, templateId))
      .all()
      .sort(compareTemplateExercises);

    tx.delete(scheduledWorkoutExercises)
      .where(eq(scheduledWorkoutExercises.scheduledWorkoutId, scheduledWorkoutId))
      .run();

    const templateVersion = computeScheduledWorkoutTemplateVersion(templateRows);

    const exerciseMetadata = tx
      .select({ id: exercises.id, name: exercises.name, trackingType: exercises.trackingType })
      .from(exercises)
      .where(
        inArray(
          exercises.id,
          templateRows.map((row) => row.exerciseId),
        ),
      )
      .all();
    const metadataById = new Map(exerciseMetadata.map((row) => [row.id, row]));

    const exerciseRows = templateRows.map((row) => ({
      id: randomUUID(),
      scheduledWorkoutId,
      exerciseId: row.exerciseId,
      exerciseNameSnapshot: metadataById.get(row.exerciseId)?.name ?? null,
      trackingTypeSnapshot: metadataById.get(row.exerciseId)?.trackingType ?? null,
      section: row.section,
      orderIndex: row.orderIndex,
      programmingNotes: toExerciseProgrammingNotes(row),
      agentNotes: null,
      agentNotesMeta: null,
      templateCues: row.cues ?? null,
      supersetGroup: row.supersetGroup,
      tempo: row.tempo,
      restSeconds: row.restSeconds,
    }));

    if (exerciseRows.length > 0) {
      tx.insert(scheduledWorkoutExercises).values(exerciseRows).run();
    }

    const setRows = exerciseRows.flatMap((exerciseRow, index) =>
      toSnapshotSetDrafts(templateRows[index] as TemplateExerciseSnapshotRow).map((setDraft) => ({
        id: randomUUID(),
        scheduledWorkoutExerciseId: exerciseRow.id,
        setNumber: setDraft.setNumber,
        repsMin: setDraft.repsMin,
        repsMax: setDraft.repsMax,
        reps: setDraft.reps,
        targetWeight: setDraft.targetWeight,
        targetWeightMin: setDraft.targetWeightMin,
        targetWeightMax: setDraft.targetWeightMax,
        targetSeconds: setDraft.targetSeconds,
        targetDistance: setDraft.targetDistance,
        targetZone: null,
      })),
    );

    if (setRows.length > 0) {
      tx.insert(scheduledWorkoutExerciseSets).values(setRows).run();
    }

    const updateResult = tx
      .update(scheduledWorkouts)
      .set({ templateVersion })
      .where(eq(scheduledWorkouts.id, scheduledWorkoutId))
      .run();

    if (updateResult.changes !== 1) {
      throw new Error(`Scheduled workout not found: ${scheduledWorkoutId}`);
    }

    return {
      templateVersion,
      exerciseCount: exerciseRows.length,
      setCount: setRows.length,
    };
  });
};

export const getSectionOrder = () => SECTION_ORDER;
