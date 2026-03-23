import type {
  ExerciseCategory,
  ExerciseTrackingType,
  WorkoutSessionFeedback,
  WorkoutTemplateSectionType,
} from '@pulse/shared';

export type WorkoutBadgeType =
  | 'compound'
  | 'isolation'
  | 'push'
  | 'pull'
  | 'legs'
  | 'cardio'
  | 'mobility';

export type ActiveWorkoutTemplateExercise = {
  badges: WorkoutBadgeType[];
  exercise?: {
    coachingNotes?: string | null;
    formCues?: string[] | null;
    instructions?: string | null;
  } | null;
  exerciseId: string;
  exerciseName?: string;
  formCues: string[];
  programmingNotes?: string | null;
  reps: string;
  restSeconds: number;
  sets: number;
  supersetGroup?: string | null;
  targetDistance?: number | null;
  targetSeconds?: number | null;
  targetWeight?: number | null;
  targetWeightMax?: number | null;
  targetWeightMin?: number | null;
  tempo: string;
  templateCues?: string[];
  trackingType?: ExerciseTrackingType;
};

export type ActiveWorkoutTemplateSection = {
  exercises: ActiveWorkoutTemplateExercise[];
  title: string;
  type: WorkoutTemplateSectionType;
};

export type ActiveWorkoutTemplate = {
  description: string;
  id: string;
  name: string;
  sections: ActiveWorkoutTemplateSection[];
  tags: string[];
};

export type ActiveWorkoutHistoricalLoggedSet = {
  completed: boolean;
  reps: number;
  setNumber: number;
  timestamp: string;
  weight?: number;
};

export type ActiveWorkoutHistoricalExerciseLog = {
  exerciseId: string;
  sets: ActiveWorkoutHistoricalLoggedSet[];
};

export type ActiveWorkoutHistoricalSession = {
  completedAt?: string;
  duration: number;
  exercises: ActiveWorkoutHistoricalExerciseLog[];
  feedback?: WorkoutSessionFeedback;
  id: string;
  startedAt: string;
  status: 'scheduled' | 'in-progress' | 'paused' | 'cancelled' | 'completed';
  templateId: string;
};

export type ActiveWorkoutSet = {
  id: string;
  completed: boolean;
  distance: number | null;
  number: number;
  reps: number | null;
  seconds: number | null;
  targetDistance?: number | null;
  targetSeconds?: number | null;
  targetWeight?: number | null;
  targetWeightMax?: number | null;
  targetWeightMin?: number | null;
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
  notes?: string | null;
  sessionId: string;
  sets: ActiveWorkoutLastPerformanceSet[];
};

export type ActiveWorkoutPerformanceHistorySet = {
  reps: number | null;
  setNumber: number;
  weight: number | null;
};

export type ActiveWorkoutPerformanceHistorySession = {
  date: string;
  notes: string | null;
  sessionId: string;
  sets: ActiveWorkoutPerformanceHistorySet[];
};

export type ActiveWorkoutRelatedLastPerformance = {
  exerciseId: string;
  exerciseName: string;
  trackingType: ExerciseTrackingType;
  history: ActiveWorkoutLastPerformance | null;
};

export type ActiveWorkoutExerciseHistorySummary = {
  history: ActiveWorkoutLastPerformance | null;
  historyEntries: ActiveWorkoutLastPerformance[];
  related: ActiveWorkoutRelatedLastPerformance[];
};

export type ActiveWorkoutExerciseMetadata = {
  badges: WorkoutBadgeType[];
  category: ExerciseCategory;
  coachingNotes?: string | null;
  formCues: string[];
  instructions?: string | null;
  templateCues: string[];
  programmingNotes?: string | null;
  injuryCues: string[];
  lastPerformance: ActiveWorkoutLastPerformance | null;
  name: string;
  phaseBadge: ActiveWorkoutPhaseBadge;
  prescribedReps: string;
  prescribedSets: number;
  priority: ActiveWorkoutPriority;
  restSeconds: number;
  reversePyramid: ActiveWorkoutReversePyramidTarget[];
  supersetGroup: string | null;
  tempo: string | null;
  trackingType: ExerciseTrackingType;
};

export type ActiveWorkoutFormCueDetails = {
  commonMistakes: string[];
  mentalCues: string[];
  technique: string;
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

export type ActiveWorkoutEnhancedExercise = Omit<
  ActiveWorkoutExerciseMetadata,
  'formCues' | 'templateCues'
> & {
  exerciseId: string;
  formCues: ActiveWorkoutFormCueDetails | null;
  section: WorkoutTemplateSectionType;
  sets: number;
  tempo: string;
};

export type FeedbackFieldType = 'scale' | 'text' | 'yes_no' | 'emoji' | 'slider' | 'multi_select';

export type ActiveWorkoutCustomFeedbackField =
  | {
      id: string;
      label: string;
      max: number;
      min: number;
      notes?: string;
      optional?: boolean;
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
    }
  | {
      id: string;
      label: string;
      notes?: string;
      optional?: boolean;
      type: 'yes_no';
      value?: boolean | null;
    }
  | {
      id: string;
      label: string;
      notes?: string;
      optional?: boolean;
      options: string[];
      type: 'emoji';
      value?: string | null;
    }
  | {
      id: string;
      label: string;
      max: number;
      min: number;
      notes?: string;
      optional?: boolean;
      step?: number;
      type: 'slider';
      value?: number | null;
    }
  | {
      id: string;
      label: string;
      notes?: string;
      optional?: boolean;
      options: string[];
      type: 'multi_select';
      value?: string[];
    };

export type ActiveWorkoutFeedbackDraft = ActiveWorkoutCustomFeedbackField[];

export type ActiveWorkoutCompletedSession = {
  customFeedback: ActiveWorkoutCustomFeedbackField[];
  duration: number;
  exercises: ActiveWorkoutHistoricalExerciseLog[];
  feedback: WorkoutSessionFeedback;
  id: string;
  name: string;
  notes: string;
  startedAt: string;
  status: 'completed';
  templateId: string;
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
