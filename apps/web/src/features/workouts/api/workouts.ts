import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkoutSessionInputSchema,
  exerciseQueryParamsSchema,
  exerciseSchema,
  type Exercise,
  type ExerciseQueryParams,
  type WorkoutSession,
  type WorkoutTemplate,
  workoutSessionSchema,
  workoutTemplateSchema,
} from '@pulse/shared';
import { z } from 'zod';

import { apiRequest, apiRequestWithMeta } from '@/lib/api-client';

const paginationMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
});

type PaginationMeta = z.infer<typeof paginationMetaSchema>;
type WorkoutTemplateResponse = { data: WorkoutTemplate };
type WorkoutTemplatesResponse = { data: WorkoutTemplate[] };
type ExercisesResponse = { data: Exercise[]; meta: PaginationMeta };
type ExerciseFiltersResponse = {
  data: {
    muscleGroups: string[];
    equipment: string[];
  };
};
type WorkoutSessionResponse = { data: WorkoutSession };

// Preprocess in shared schemas widens inference here, so we pin the parsed response shape explicitly.
const workoutTemplateResponseSchema = z.object({
  data: workoutTemplateSchema,
}) as unknown as z.ZodType<WorkoutTemplateResponse>;

// Preprocess in shared schemas widens inference here, so we pin the parsed response shape explicitly.
const workoutTemplatesResponseSchema = z.object({
  data: z.array(workoutTemplateSchema),
}) as unknown as z.ZodType<WorkoutTemplatesResponse>;

// Preprocess in shared schemas widens inference here, so we pin the parsed response shape explicitly.
const exercisesResponseSchema = z.object({
  data: z.array(exerciseSchema),
  meta: paginationMetaSchema,
}) as unknown as z.ZodType<ExercisesResponse>;

const exerciseFiltersResponseSchema = z.object({
  data: z.object({
    muscleGroups: z.array(z.string()),
    equipment: z.array(z.string()),
  }),
}) as z.ZodType<ExerciseFiltersResponse>;

// Preprocess in shared schemas widens inference here, so we pin the parsed response shape explicitly.
const workoutSessionResponseSchema = z.object({
  data: workoutSessionSchema,
}) as unknown as z.ZodType<WorkoutSessionResponse>;

type CreateWorkoutSessionRequest = z.input<typeof createWorkoutSessionInputSchema>;

export const workoutQueryKeys = {
  all: ['workouts'] as const,
  exercises: (params: ExerciseQueryParams) => ['workouts', 'exercises', params] as const,
  exerciseFilters: () => ['workouts', 'exercise-filters'] as const,
  sessions: () => ['workouts', 'sessions'] as const,
  template: (id: string) => ['workouts', 'template', id] as const,
  templates: () => ['workouts', 'templates'] as const,
};

async function getWorkoutTemplates() {
  const data = await apiRequest<unknown>('/api/v1/workout-templates');
  const payload = workoutTemplatesResponseSchema.parse({ data });

  return payload.data;
}

async function getWorkoutTemplate(id: string) {
  const data = await apiRequest<unknown>(`/api/v1/workout-templates/${id}`);
  const payload = workoutTemplateResponseSchema.parse({ data });

  return payload.data;
}

async function getExercises(params: ExerciseQueryParams) {
  const parsedParams = exerciseQueryParamsSchema.parse(params);
  const searchParams = new URLSearchParams();

  if (parsedParams.q) {
    searchParams.set('q', parsedParams.q);
  }

  if (parsedParams.muscleGroup) {
    searchParams.set('muscleGroup', parsedParams.muscleGroup);
  }

  if (parsedParams.equipment) {
    searchParams.set('equipment', parsedParams.equipment);
  }

  if (parsedParams.category) {
    searchParams.set('category', parsedParams.category);
  }

  searchParams.set('page', String(parsedParams.page));
  searchParams.set('limit', String(parsedParams.limit));

  const payload = await apiRequestWithMeta<unknown, unknown>(
    `/api/v1/exercises?${searchParams.toString()}`,
  );

  return exercisesResponseSchema.parse(payload);
}

async function getExerciseFilters() {
  const data = await apiRequest<unknown>('/api/v1/exercises/filters');
  return exerciseFiltersResponseSchema.parse({ data });
}

async function createWorkoutSession(input: CreateWorkoutSessionRequest) {
  const parsedInput = createWorkoutSessionInputSchema.parse(input);
  const data = await apiRequest<unknown>('/api/v1/workout-sessions', {
    body: JSON.stringify(parsedInput),
    method: 'POST',
  });
  const payload = workoutSessionResponseSchema.parse({ data });

  return payload.data;
}

export function useWorkoutTemplates() {
  return useQuery<WorkoutTemplate[]>({
    queryFn: getWorkoutTemplates,
    queryKey: workoutQueryKeys.templates(),
  });
}

export function useWorkoutTemplate(id: string) {
  return useQuery<WorkoutTemplate>({
    enabled: id.trim().length > 0,
    queryFn: () => getWorkoutTemplate(id),
    queryKey: workoutQueryKeys.template(id),
  });
}

export function useExercises(params: ExerciseQueryParams) {
  return useQuery<ExercisesResponse>({
    placeholderData: (previousData) => previousData,
    // getExercises already validates/normalizes with the shared schema.
    queryFn: () => getExercises(params),
    queryKey: workoutQueryKeys.exercises(params),
  });
}

export function useExerciseFilters() {
  return useQuery<ExerciseFiltersResponse>({
    queryFn: getExerciseFilters,
    queryKey: workoutQueryKeys.exerciseFilters(),
  });
}

export function useStartWorkoutSession() {
  const queryClient = useQueryClient();

  return useMutation<WorkoutSession, Error, CreateWorkoutSessionRequest>({
    mutationFn: createWorkoutSession,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: workoutQueryKeys.sessions(),
      });
    },
  });
}
