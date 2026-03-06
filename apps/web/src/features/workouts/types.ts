import type {
  WorkoutFeedbackScore,
  WorkoutBadgeType,
  WorkoutExerciseCategory,
  WorkoutTemplateSectionType,
} from '@/lib/mock-data/workouts';

export type ActiveWorkoutSet = {
  id: string;
  completed: boolean;
  number: number;
  reps: number | null;
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

export type ActiveWorkoutExercise = {
  badges: WorkoutBadgeType[];
  category: WorkoutExerciseCategory;
  completedSets: number;
  formCues: string[];
  id: string;
  lastPerformance: ActiveWorkoutLastPerformance | null;
  name: string;
  notes: string;
  prescribedReps: string;
  restSeconds: number;
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

export type ActiveWorkoutFeedbackQuestion = 'energy' | 'recovery' | 'technique';

export type ActiveWorkoutFeedbackResponse = {
  note: string;
  score: WorkoutFeedbackScore | null;
};

export type ActiveWorkoutFeedbackDraft = Record<
  ActiveWorkoutFeedbackQuestion,
  ActiveWorkoutFeedbackResponse
>;
