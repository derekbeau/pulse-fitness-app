import type {
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

export type ActiveWorkoutExercise = {
  badges: WorkoutBadgeType[];
  category: WorkoutExerciseCategory;
  completedSets: number;
  id: string;
  name: string;
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
