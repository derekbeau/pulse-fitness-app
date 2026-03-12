import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkoutSessionInputSchema,
  exerciseQueryParamsSchema,
  exerciseSchema,
  updateExerciseInputSchema,
  type Exercise,
  type ExerciseQueryParams,
  type WorkoutSession,
  type WorkoutSessionListItem,
  type WorkoutSessionQueryParams,
  type WorkoutTemplate,
  workoutSessionQueryParamsSchema,
  workoutSessionListItemSchema,
  workoutSessionSchema,
  workoutTemplateSchema,
} from '@pulse/shared';
import { toast } from 'sonner';
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
type RenameExerciseRequest = {
  id: string;
  name: string;
};

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
  completedSessions: () => ['workouts', 'completed-sessions'] as const,
  exercises: (params: ExerciseQueryParams) => ['workouts', 'exercises', params] as const,
  exerciseFilters: () => ['workouts', 'exercise-filters'] as const,
  session: (id: string) => ['workouts', 'session', id] as const,
  sessions: () => ['workouts', 'sessions'] as const,
  sessionsList: (params: WorkoutSessionQueryParams = {}) => ['workouts', 'sessions', params] as const,
  template: (id: string) => ['workouts', 'template', id] as const,
  templates: () => ['workouts', 'templates'] as const,
};

async function getWorkoutTemplates() {
  const data = await apiRequest<unknown>('/api/v1/workout-templates');
  const payload = workoutTemplatesResponseSchema.parse({ data });

  return payload.data;
}

const sessionListResponseSchema = z.object({
  data: z.array(workoutSessionListItemSchema),
}) as unknown as z.ZodType<{ data: WorkoutSessionListItem[] }>;

async function getCompletedSessions(signal?: AbortSignal) {
  const data = await apiRequest<unknown>(
    '/api/v1/workout-sessions?status=completed',
    { method: 'GET', signal },
  );
  const payload = sessionListResponseSchema.parse({ data });

  return payload.data;
}

async function getWorkoutSessions(params: WorkoutSessionQueryParams = {}, signal?: AbortSignal) {
  const parsedParams = workoutSessionQueryParamsSchema.parse(params);
  const searchParams = new URLSearchParams();

  if (parsedParams.from) {
    searchParams.set('from', parsedParams.from);
  }

  if (parsedParams.to) {
    searchParams.set('to', parsedParams.to);
  }

  if (parsedParams.status) {
    searchParams.set('status', parsedParams.status);
  }

  if (parsedParams.limit) {
    searchParams.set('limit', String(parsedParams.limit));
  }

  const url = searchParams.size
    ? `/api/v1/workout-sessions?${searchParams.toString()}`
    : '/api/v1/workout-sessions';
  const data = await apiRequest<unknown>(url, { method: 'GET', signal });
  const payload = sessionListResponseSchema.parse({ data });

  return payload.data;
}

async function getWorkoutTemplate(id: string, signal?: AbortSignal) {
  const data = await apiRequest<unknown>(`/api/v1/workout-templates/${id}`, {
    method: 'GET',
    signal,
  });
  const payload = workoutTemplateResponseSchema.parse({ data });

  return payload.data;
}

async function getWorkoutSession(id: string, signal?: AbortSignal) {
  const data = await apiRequest<unknown>(`/api/v1/workout-sessions/${id}`, {
    method: 'GET',
    signal,
  });
  const payload = workoutSessionResponseSchema.parse({ data });

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

async function renameExercise(input: RenameExerciseRequest) {
  const parsedInput = updateExerciseInputSchema.parse({
    name: input.name,
  });
  const data = await apiRequest<unknown>(`/api/v1/exercises/${input.id}`, {
    body: JSON.stringify(parsedInput),
    method: 'PATCH',
  });
  const payload = z.object({ data: exerciseSchema }).parse({ data });

  return payload.data;
}

export function useWorkoutTemplates() {
  return useQuery<WorkoutTemplate[]>({
    queryFn: getWorkoutTemplates,
    queryKey: workoutQueryKeys.templates(),
  });
}

export function useCompletedSessions() {
  return useQuery<WorkoutSessionListItem[]>({
    queryFn: ({ signal }) => getCompletedSessions(signal),
    queryKey: workoutQueryKeys.completedSessions(),
  });
}

export function useWorkoutSessions(
  params: WorkoutSessionQueryParams = {},
  options?: { enabled?: boolean },
) {
  return useQuery<WorkoutSessionListItem[]>({
    enabled: options?.enabled,
    queryFn: ({ signal }) => getWorkoutSessions(params, signal),
    queryKey: workoutQueryKeys.sessionsList(params),
  });
}

export function useWorkoutTemplate(id: string) {
  return useQuery<WorkoutTemplate>({
    enabled: id.trim().length > 0,
    queryFn: ({ signal }) => getWorkoutTemplate(id, signal),
    queryKey: workoutQueryKeys.template(id),
  });
}

export function useWorkoutSession(id: string, options?: { enabled?: boolean }) {
  return useQuery<WorkoutSession>({
    enabled: (options?.enabled ?? true) && id.trim().length > 0,
    queryFn: ({ signal }) => getWorkoutSession(id, signal),
    queryKey: workoutQueryKeys.session(id),
  });
}

export const prefetchWorkoutTemplate = (queryClient: QueryClient, id: string) =>
  queryClient.prefetchQuery({
    queryKey: workoutQueryKeys.template(id),
    queryFn: ({ signal }) => getWorkoutTemplate(id, signal),
  });

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
      // Intentional prefix invalidation: refreshes both `sessions()` and all `sessionsList(params)` caches.
      await queryClient.invalidateQueries({
        queryKey: workoutQueryKeys.sessions(),
      });
      toast.success('Workout started');
    },
  });
}

export function useRenameExercise() {
  const queryClient = useQueryClient();

  return useMutation<Exercise, Error, RenameExerciseRequest>({
    mutationFn: renameExercise,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.all,
        }),
        queryClient.invalidateQueries({
          queryKey: ['workout-sessions'],
        }),
      ]);
      toast.success('Exercise renamed');
    },
  });
}
