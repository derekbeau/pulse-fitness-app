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

import { apiRequest } from '@/lib/api';

const paginationMetaSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
});

type PaginationMeta = z.infer<typeof paginationMetaSchema>;
type WorkoutTemplateResponse = { data: WorkoutTemplate };
type ExercisesResponse = { data: Exercise[]; meta: PaginationMeta };
type WorkoutSessionResponse = { data: WorkoutSession };

const workoutTemplateResponseSchema = z.object({
  data: workoutTemplateSchema,
}) as unknown as z.ZodType<WorkoutTemplateResponse>;

const exercisesResponseSchema = z.object({
  data: z.array(exerciseSchema),
  meta: paginationMetaSchema,
}) as unknown as z.ZodType<ExercisesResponse>;

const workoutSessionResponseSchema = z.object({
  data: workoutSessionSchema,
}) as unknown as z.ZodType<WorkoutSessionResponse>;

type CreateWorkoutSessionRequest = z.input<typeof createWorkoutSessionInputSchema>;

export const workoutQueryKeys = {
  all: ['workouts'] as const,
  exercises: (params: ExerciseQueryParams) => ['workouts', 'exercises', params] as const,
  sessions: () => ['workouts', 'sessions'] as const,
  template: (id: string) => ['workouts', 'template', id] as const,
};

async function getWorkoutTemplate(id: string) {
  const payload = await apiRequest({
    path: `/api/v1/workout-templates/${id}`,
    schema: workoutTemplateResponseSchema,
  });

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

  return apiRequest({
    path: `/api/v1/exercises?${searchParams.toString()}`,
    schema: exercisesResponseSchema,
  });
}

async function createWorkoutSession(input: CreateWorkoutSessionRequest) {
  const parsedInput = createWorkoutSessionInputSchema.parse(input);
  const payload = await apiRequest({
    body: parsedInput,
    method: 'POST',
    path: '/api/v1/workout-sessions',
    schema: workoutSessionResponseSchema,
  });

  return payload.data;
}

export function useWorkoutTemplate(id: string) {
  return useQuery<WorkoutTemplate>({
    enabled: id.trim().length > 0,
    queryFn: () => getWorkoutTemplate(id),
    queryKey: workoutQueryKeys.template(id),
  });
}

export function useExercises(params: ExerciseQueryParams) {
  const parsedParams = exerciseQueryParamsSchema.parse(params);

  return useQuery<ExercisesResponse>({
    placeholderData: (previousData) => previousData,
    queryFn: () => getExercises(parsedParams),
    queryKey: workoutQueryKeys.exercises(parsedParams),
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
