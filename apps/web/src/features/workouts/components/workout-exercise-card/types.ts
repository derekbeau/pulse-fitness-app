import type { CSSProperties, ReactNode } from 'react';
import type { ExerciseTrackingType, WeightUnit } from '@pulse/shared';

export type WorkoutExerciseCardMode =
  | 'readonly-template'
  | 'readonly-scheduled'
  | 'readonly-completed';
// Reserved for a later migration round.
// | 'in-progress'

export type WorkoutExerciseCardDensity = 'default' | 'condensed';

export type WorkoutExerciseSetTarget = {
  setNumber: number;
  targetDistance?: number | null;
  targetSeconds?: number | null;
  targetWeight?: number | null;
  targetWeightMax?: number | null;
  targetWeightMin?: number | null;
};

export type WorkoutExerciseSetListItem = {
  completed?: boolean;
  distance?: number | null;
  reps?: number | null;
  seconds?: number | null;
  setNumber: number;
  targetDistance?: number | null;
  targetSeconds?: number | null;
  targetWeight?: number | null;
  targetWeightMax?: number | null;
  targetWeightMin?: number | null;
  weight?: number | null;
};

export type WorkoutExerciseCardTemplateExercise = {
  coachingNotes?: string | null;
  equipment?: string | null;
  exerciseId: string;
  formCues?: string[];
  id: string;
  instructions?: string | null;
  muscleGroups?: string[];
  name: string;
  notes?: string | null;
  phaseBadge?: string | null;
  priorityBadge?: string | null;
  programmingNotes?: string | null;
  repsMax: number | null;
  repsMin: number | null;
  restSeconds: number | null;
  setTargets?: WorkoutExerciseSetTarget[] | null;
  sets: number | null;
  sessionCues?: string[];
  tempo: string | null;
  templateCues?: string[];
  trackingType: ExerciseTrackingType;
};

export type WorkoutExerciseCardAgentNotesMeta = {
  author: string;
  generatedAt: string;
  scheduledDateAtGeneration: string;
  stale?: boolean;
};

export type WorkoutExerciseCardScheduledExercise = WorkoutExerciseCardTemplateExercise & {
  agentNotes?: string | null;
  agentNotesMeta?: WorkoutExerciseCardAgentNotesMeta | null;
  scheduledDateLabel?: string | null;
};

export type WorkoutExerciseCardCompletedExercise = {
  agentNotes?: string | null;
  agentNotesMeta?: WorkoutExerciseCardAgentNotesMeta | null;
  completedSets: WorkoutExerciseSetListItem[];
  equipment?: string | null;
  exerciseId: string;
  id: string;
  muscleGroups?: string[];
  name: string;
  notes?: string | null;
  phaseBadge?: string | null;
  priorityBadge?: string | null;
  programmingNotes?: string | null;
  repsMax: number | null;
  repsMin: number | null;
  restSeconds: number | null;
  tempo: string | null;
  trackingType: ExerciseTrackingType;
};

type WorkoutExerciseCardCommonProps = {
  cardRef?: (node: HTMLDivElement | null) => void;
  className?: string;
  density?: WorkoutExerciseCardDensity;
  footerSlot?: ReactNode;
  headerSlot?: ReactNode;
  leadingSlot?: ReactNode;
  onOpenDetails?: () => void;
  showLastPerformance?: boolean;
  showSetList?: boolean;
  style?: CSSProperties;
  weightUnit?: WeightUnit;
};

export type WorkoutExerciseCardTemplateProps = WorkoutExerciseCardCommonProps & {
  exercise: WorkoutExerciseCardTemplateExercise;
  mode: 'readonly-template';
};

export type WorkoutExerciseCardScheduledProps = WorkoutExerciseCardCommonProps & {
  exercise: WorkoutExerciseCardScheduledExercise;
  mode: 'readonly-scheduled';
};

export type WorkoutExerciseCardCompletedProps = WorkoutExerciseCardCommonProps & {
  exercise: WorkoutExerciseCardCompletedExercise;
  mode: 'readonly-completed';
};

export type WorkoutExerciseCardProps =
  | WorkoutExerciseCardTemplateProps
  | WorkoutExerciseCardScheduledProps
  | WorkoutExerciseCardCompletedProps;
