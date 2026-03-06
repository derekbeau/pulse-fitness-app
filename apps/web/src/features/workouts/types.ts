import type {
  WorkoutBadgeType,
  WorkoutExerciseCategory,
  WorkoutTemplateSectionType,
} from '@/lib/mock-data/workouts';

export type ActiveWorkoutSet = {
  id: string;
  completed: boolean;
  label: string;
  number: number;
};

export type ActiveWorkoutExercise = {
  badges: WorkoutBadgeType[];
  category: WorkoutExerciseCategory;
  completedSets: number;
  exerciseId: string;
  id: string;
  name: string;
  reps: string;
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
