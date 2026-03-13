import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createScheduledWorkoutInputSchema,
  createWorkoutSessionInputSchema,
  exerciseQueryParamsSchema,
  exerciseSchema,
  scheduledWorkoutListItemSchema,
  scheduledWorkoutQueryParamsSchema,
  scheduledWorkoutSchema,
  reorderWorkoutTemplateExercisesInputSchema,
  swapWorkoutSessionExerciseInputSchema,
  swapWorkoutTemplateExerciseInputSchema,
  updateScheduledWorkoutInputSchema,
  updateExerciseInputSchema,
  updateWorkoutTemplateInputSchema,
  type Exercise,
  type ExerciseQueryParams,
  type CreateScheduledWorkoutInput,
  type ScheduledWorkout,
  type ScheduledWorkoutListItem,
  type ScheduledWorkoutQueryParams,
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
type RenameTemplateRequest = {
  id: string;
  name: string;
};
type DeleteTemplateRequest = {
  id: string;
};
type DeleteTemplateResponse = {
  data: {
    success: boolean;
  };
};
type ReorderTemplateExercisesRequest = {
  templateId: string;
  section: 'warmup' | 'main' | 'cooldown';
  exerciseIds: string[];
};
type SwapTemplateExerciseRequest = {
  templateId: string;
  exerciseId: string;
  newExerciseId: string;
};
type SwapSessionExerciseRequest = {
  sessionId: string;
  exerciseId: string;
  newExerciseId: string;
};
type CreateScheduledWorkoutRequest = CreateScheduledWorkoutInput;
type UpdateScheduledWorkoutRequest = {
  id: string;
  date: string;
};
type DeleteScheduledWorkoutRequest = {
  id: string;
};
type DeleteScheduledWorkoutResponse = {
  data: {
    success: boolean;
  };
};
type SwapResponseMeta = {
  warning?: string;
};
type SwapTemplateExerciseResponse = {
  data: WorkoutTemplate;
  meta?: SwapResponseMeta;
};
type SwapSessionExerciseResponse = {
  data: WorkoutSession;
  meta?: SwapResponseMeta;
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
  scheduledWorkoutsAll: () => ['workouts', 'scheduled-workouts'] as const,
  scheduledWorkouts: (params: ScheduledWorkoutQueryParams) =>
    ['workouts', 'scheduled-workouts', params] as const,
  session: (id: string) => ['workouts', 'session', id] as const,
  sessions: () => ['workouts', 'sessions'] as const,
  sessionsList: (params: WorkoutSessionQueryParams = {}) =>
    ['workouts', 'sessions', params] as const,
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
  const data = await apiRequest<unknown>('/api/v1/workout-sessions?status=completed', {
    method: 'GET',
    signal,
  });
  const payload = sessionListResponseSchema.parse({ data });

  return payload.data;
}

const scheduledWorkoutListResponseSchema = z.object({
  data: z.array(scheduledWorkoutListItemSchema),
}) as unknown as z.ZodType<{ data: ScheduledWorkoutListItem[] }>;

async function getScheduledWorkouts(params: ScheduledWorkoutQueryParams, signal?: AbortSignal) {
  const parsedParams = scheduledWorkoutQueryParamsSchema.parse(params);
  const searchParams = new URLSearchParams({
    from: parsedParams.from,
    to: parsedParams.to,
  });
  const data = await apiRequest<unknown>(`/api/v1/scheduled-workouts?${searchParams.toString()}`, {
    method: 'GET',
    signal,
  });
  const payload = scheduledWorkoutListResponseSchema.parse({ data });

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
    for (const status of parsedParams.status) {
      searchParams.append('status', status);
    }
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

async function renameTemplate(input: RenameTemplateRequest) {
  const parsedInput = updateWorkoutTemplateInputSchema.parse({
    name: input.name,
  });
  const data = await apiRequest<unknown>(`/api/v1/workout-templates/${input.id}`, {
    body: JSON.stringify(parsedInput),
    method: 'PATCH',
  });
  const payload = workoutTemplateResponseSchema.parse({ data });

  return payload.data;
}

async function deleteTemplate(input: DeleteTemplateRequest) {
  const data = await apiRequest<unknown>(`/api/v1/workout-templates/${input.id}`, {
    method: 'DELETE',
  });
  return z
    .object({
      data: z.object({
        success: z.boolean(),
      }),
    })
    .parse({ data }) as DeleteTemplateResponse;
}

async function reorderTemplateExercises(input: ReorderTemplateExercisesRequest) {
  const parsedInput = reorderWorkoutTemplateExercisesInputSchema.parse({
    section: input.section,
    exerciseIds: input.exerciseIds,
  });
  const data = await apiRequest<unknown>(`/api/v1/workout-templates/${input.templateId}/reorder`, {
    body: JSON.stringify(parsedInput),
    method: 'PATCH',
  });
  const payload = workoutTemplateResponseSchema.parse({ data });

  return payload.data;
}

async function swapTemplateExercise(input: SwapTemplateExerciseRequest) {
  const parsedInput = swapWorkoutTemplateExerciseInputSchema.parse({
    newExerciseId: input.newExerciseId,
  });
  const payload = await apiRequestWithMeta<unknown, unknown>(
    `/api/v1/workout-templates/${input.templateId}/exercises/${input.exerciseId}/swap`,
    {
      body: JSON.stringify(parsedInput),
      method: 'PATCH',
    },
  );
  const parsedPayload = z
    .object({
      data: workoutTemplateSchema,
      meta: z
        .object({
          warning: z.string().optional(),
        })
        .optional(),
    })
    .parse(payload) as SwapTemplateExerciseResponse;

  return parsedPayload;
}

async function swapSessionExercise(input: SwapSessionExerciseRequest) {
  const parsedInput = swapWorkoutSessionExerciseInputSchema.parse({
    newExerciseId: input.newExerciseId,
  });
  const payload = await apiRequestWithMeta<unknown, unknown>(
    `/api/v1/workout-sessions/${input.sessionId}/exercises/${input.exerciseId}/swap`,
    {
      body: JSON.stringify(parsedInput),
      method: 'PATCH',
    },
  );
  const parsedPayload = z
    .object({
      data: workoutSessionSchema,
      meta: z
        .object({
          warning: z.string().optional(),
        })
        .optional(),
    })
    .parse(payload) as SwapSessionExerciseResponse;

  return parsedPayload;
}

async function createScheduledWorkout(input: CreateScheduledWorkoutRequest) {
  const parsedInput = createScheduledWorkoutInputSchema.parse(input);
  const data = await apiRequest<unknown>('/api/v1/scheduled-workouts', {
    body: JSON.stringify(parsedInput),
    method: 'POST',
  });
  const payload = z.object({ data: scheduledWorkoutSchema }).parse({ data });

  return payload.data;
}

async function updateScheduledWorkout(input: UpdateScheduledWorkoutRequest) {
  const parsedInput = updateScheduledWorkoutInputSchema.parse({
    date: input.date,
  });
  const data = await apiRequest<unknown>(`/api/v1/scheduled-workouts/${input.id}`, {
    body: JSON.stringify(parsedInput),
    method: 'PATCH',
  });
  const payload = z.object({ data: scheduledWorkoutSchema }).parse({ data });

  return payload.data;
}

async function deleteScheduledWorkout(input: DeleteScheduledWorkoutRequest) {
  const data = await apiRequest<unknown>(`/api/v1/scheduled-workouts/${input.id}`, {
    method: 'DELETE',
  });
  return z
    .object({
      data: z.object({
        success: z.boolean(),
      }),
    })
    .parse({ data }) as DeleteScheduledWorkoutResponse;
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

export function useScheduledWorkouts(
  params: ScheduledWorkoutQueryParams,
  options?: { enabled?: boolean },
) {
  return useQuery<ScheduledWorkoutListItem[]>({
    enabled: options?.enabled,
    queryFn: ({ signal }) => getScheduledWorkouts(params, signal),
    queryKey: workoutQueryKeys.scheduledWorkouts(params),
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

export function useWorkoutTemplate(id: string, options?: { enabled?: boolean }) {
  return useQuery<WorkoutTemplate>({
    enabled: (options?.enabled ?? true) && id.trim().length > 0,
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

export function useExercises(params: ExerciseQueryParams, options?: { enabled?: boolean }) {
  return useQuery<ExercisesResponse>({
    enabled: options?.enabled,
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

export function useScheduleWorkout() {
  const queryClient = useQueryClient();
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return useMutation<ScheduledWorkout, Error, CreateScheduledWorkoutRequest>({
    mutationFn: createScheduledWorkout,
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.scheduledWorkoutsAll(),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.sessions(),
        }),
      ]);
      toast.success(`Scheduled for ${formatter.format(new Date(`${variables.date}T12:00:00`))}`);
    },
  });
}

export function useRescheduleWorkout() {
  const queryClient = useQueryClient();

  return useMutation<ScheduledWorkout, Error, UpdateScheduledWorkoutRequest>({
    mutationFn: updateScheduledWorkout,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.scheduledWorkoutsAll(),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.sessions(),
        }),
      ]);
      toast.success('Workout rescheduled');
    },
  });
}

export function useUnscheduleWorkout() {
  const queryClient = useQueryClient();

  return useMutation<DeleteScheduledWorkoutResponse, Error, DeleteScheduledWorkoutRequest>({
    mutationFn: deleteScheduledWorkout,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.scheduledWorkoutsAll(),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.sessions(),
        }),
      ]);
      toast.success('Scheduled workout removed');
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
          queryKey: workoutQueryKeys.sessions(),
        }),
      ]);
      toast.success('Exercise renamed');
    },
  });
}

export function useRenameTemplate() {
  const queryClient = useQueryClient();

  return useMutation<WorkoutTemplate, Error, RenameTemplateRequest>({
    mutationFn: renameTemplate,
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.templates(),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.template(variables.id),
        }),
      ]);
      toast.success('Template renamed');
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation<DeleteTemplateResponse, Error, DeleteTemplateRequest>({
    mutationFn: deleteTemplate,
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.templates(),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.template(variables.id),
        }),
      ]);
      toast.success('Template deleted');
    },
  });
}

export function useReorderTemplateExercises() {
  const queryClient = useQueryClient();

  return useMutation<WorkoutTemplate, Error, ReorderTemplateExercisesRequest>({
    mutationFn: reorderTemplateExercises,
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.templates(),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.template(variables.templateId),
        }),
      ]);
    },
  });
}

export function useSwapTemplateExercise() {
  const queryClient = useQueryClient();

  return useMutation<SwapTemplateExerciseResponse, Error, SwapTemplateExerciseRequest>({
    mutationFn: swapTemplateExercise,
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.templates(),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.template(variables.templateId),
        }),
      ]);
    },
  });
}

export function useSwapSessionExercise() {
  const queryClient = useQueryClient();

  return useMutation<SwapSessionExerciseResponse, Error, SwapSessionExerciseRequest>({
    mutationFn: swapSessionExercise,
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.sessions(),
        }),
        queryClient.invalidateQueries({
          queryKey: workoutQueryKeys.session(variables.sessionId),
        }),
      ]);
    },
  });
}
