import type { ExerciseTrackingType } from '@pulse/shared';

import type {
  WorkoutBadgeType,
  WorkoutExerciseCategory,
  WorkoutSession,
  WorkoutSessionFeedback,
  WorkoutTemplateSectionType,
} from '@/lib/mock-data/workouts';

export type ActiveWorkoutSet = {
  id: string;
  completed: boolean;
  distance: number | null;
  number: number;
  reps: number | null;
  seconds: number | null;
  weight: number | null;
};

export type ActiveWorkoutSetDrafts = Record<string, ActiveWorkoutSet[]>;

export type ActiveWorkoutLastPerformanceSet = {
  completed: boolean;
  reps: number;
  setNumber: number;
  weight: number | null;
};

export type ActiveWorkoutLastPerformance = {
  date: string;
  sessionId: string;
  sets: ActiveWorkoutLastPerformanceSet[];
};

export type ActiveWorkoutExerciseMetadata = {
  badges: WorkoutBadgeType[];
  category: WorkoutExerciseCategory;
  formCues: ActiveWorkoutFormCueDetails | null;
  injuryCues: string[];
  lastPerformance: ActiveWorkoutLastPerformance | null;
  name: string;
  phaseBadge: ActiveWorkoutPhaseBadge;
  prescribedReps: string;
  priority: ActiveWorkoutPriority;
  restSeconds: number;
  reversePyramid: ActiveWorkoutReversePyramidTarget[];
  supersetGroup: string | null;
  trackingType: ExerciseTrackingType;
};

export type ActiveWorkoutExercise = ActiveWorkoutExerciseMetadata & {
  completedSets: number;
  id: string;
  notes: string;
  sets: ActiveWorkoutSet[];
  targetSets: number;
};

export type ActiveWorkoutSection = {
  exercises: ActiveWorkoutExercise[];
  id: WorkoutTemplateSectionType;
  title: string;
  type: WorkoutTemplateSectionType;
};

export type ActiveWorkoutSessionData = {
  completedSets: number;
  currentExercise: number;
  currentExerciseId: string | null;
  sections: ActiveWorkoutSection[];
  totalExercises: number;
  totalSets: number;
  workoutName: string;
};

export type ActiveWorkoutSleepStatus = 'poor' | 'fair' | 'good' | 'great';

export type ActiveWorkoutPhaseBadge = 'rebuild' | 'recovery' | 'test' | 'moderate';

export type ActiveWorkoutPriority = 'required' | 'optional';

export type ActiveWorkoutRecentSessionSummary = {
  date: string;
  id: string;
  name: string;
  volume: number;
};

export type ActiveWorkoutInjuryContext = {
  affectedExerciseIds: string[];
  cues: string[];
  id: string;
  label: string;
};

export type ActiveWorkoutSessionContext = {
  activeInjuries: ActiveWorkoutInjuryContext[];
  recentSessions: ActiveWorkoutRecentSessionSummary[];
  sleepStatus: ActiveWorkoutSleepStatus;
  trainingPhaseLabel: string;
};

export type ActiveWorkoutReversePyramidTarget = {
  setNumber: number;
  targetReps: number;
  targetWeight: number;
};

export type ActiveWorkoutFormCueDetails = {
  commonMistakes: string[];
  mentalCues: string[];
  technique: string;
};

export type ActiveWorkoutEnhancedExercise = ActiveWorkoutExerciseMetadata & {
  exerciseId: string;
  section: WorkoutTemplateSectionType;
  sets: number;
  tempo: string;
};

export type ActiveWorkoutCustomFeedbackField =
  | {
      id: string;
      label: string;
      max: number;
      min: number;
      notes?: string;
      type: 'scale';
      value?: number | null;
    }
  | {
      id: string;
      label: string;
      notes?: string;
      optional?: boolean;
      type: 'text';
      value?: string;
    };

export type ActiveWorkoutFeedbackDraft = ActiveWorkoutCustomFeedbackField[];

export type ActiveWorkoutSupplementalCategory = 'core-spine' | 'atg' | 'strength-side' | 'optional';

export type ActiveWorkoutSupplementalExercise = {
  category: ActiveWorkoutSupplementalCategory;
  details: string;
  exerciseId: string;
  name: string;
  priority: ActiveWorkoutPriority;
  reps: string;
  sets: string;
};

export type ActiveWorkoutCompletedSession = {
  customFeedback: ActiveWorkoutCustomFeedbackField[];
  duration: number;
  exercises: WorkoutSession['exercises'];
  feedback: WorkoutSessionFeedback;
  id: string;
  name: string;
  notes: string;
  startedAt: string;
  status: 'completed';
  supplemental: ActiveWorkoutSupplementalExercise[];
  templateId: WorkoutSession['templateId'];
};

export type ActiveWorkoutExerciseHistoryPoint = {
  date: string;
  distance?: number | null;
  reps: number;
  seconds?: number | null;
  trackingType?: ExerciseTrackingType;
  weight: number;
};

export type ActiveWorkoutExerciseHistory = Record<string, ActiveWorkoutExerciseHistoryPoint[]>;
