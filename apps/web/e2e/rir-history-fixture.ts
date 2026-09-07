import { randomUUID } from 'node:crypto';
import type {
  Exercise,
  WorkoutSession,
  WorkoutTemplate,
  WorkoutProgressionRecommendation,
} from '@pulse/shared';

/** Creates disposable fictional data only on the dedicated issue-139 loopback API. */
export async function seedRirHistoryFixture(baseURL: string) {
  if (baseURL !== 'http://127.0.0.1:3139') {
    throw new Error('RIR history fixtures require the isolated API at 127.0.0.1:3139');
  }
  const username = `rir-history-${randomUUID().slice(0, 8)}`;
  const password = 'fictional-rir-history-only';
  let token = '';
  async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
    const response = await fetch(`${baseURL}/api/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    if (!response.ok)
      throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return ((await response.json()) as { data: T }).data;
  }
  token = (
    await api<{ token: string }>('/auth/register', 'POST', {
      username,
      password,
      name: 'RIR History Preview',
      timeZone: 'America/Detroit',
    })
  ).token;
  const definitions = [
    {
      name: 'History Bench Press',
      trackingType: 'weight_reps',
      category: 'compound',
      equipment: 'barbell',
      muscleGroups: ['chest'],
      efforts: [{ rir: 0 }, { rpe: 8 }, { rpe: 1 }, {}],
    },
    {
      name: 'History Push-up',
      trackingType: 'bodyweight_reps',
      category: 'compound',
      equipment: 'bodyweight',
      muscleGroups: ['chest'],
      efforts: [{ rir: 4 }, { rpe: 10 }, { rpe: 9 }],
    },
    {
      name: 'History Band Pull-apart',
      trackingType: 'reps_only',
      category: 'isolation',
      equipment: 'band',
      muscleGroups: ['shoulders'],
      efforts: [{ rir: 5 }, { rpe: 7 }, { rpe: 6 }, { rpe: 5 }],
    },
    {
      name: 'History Easy Walk',
      trackingType: 'duration',
      category: 'cardio',
      equipment: 'bodyweight',
      muscleGroups: ['full-body'],
      efforts: [{ rpe: 3 }],
    },
  ] as const;
  const exercises: Exercise[] = [];
  for (const { name, trackingType, category, equipment, muscleGroups } of definitions) {
    exercises.push(
      await api<Exercise>('/exercises', 'POST', {
        name,
        trackingType,
        category,
        equipment,
        muscleGroups,
      }),
    );
  }
  const template = await api<WorkoutTemplate>('/workout-templates', 'POST', {
    name: 'RIR History Preview',
    sections: [
      {
        type: 'main',
        exercises: exercises.map((exercise, index) => ({
          exerciseId: exercise.id,
          sets: definitions[index].efforts.length,
          ...(exercise.trackingType === 'duration'
            ? { durationSeconds: 1800 }
            : { repsMin: 8, repsMax: 10 }),
          setTargets: definitions[index].efforts.map((_, setIndex) => ({
            setNumber: setIndex + 1,
            ...(index === 0 ? { targetWeight: 135 } : {}),
          })),
        })),
      },
    ],
  });
  const sessions: WorkoutSession[] = [];
  for (const [sessionIndex, date] of ['2026-09-01', '2026-09-04'].entries()) {
    const startedAt = Date.parse(`${date}T17:00:00Z`);
    const historySchedule = await api<{ id: string }>('/scheduled-workouts', 'POST', {
      templateId: template.id,
      date,
    });
    const started = await api<WorkoutSession>('/workout-sessions', 'POST', {
      scheduledWorkoutId: historySchedule.id,
      date,
      startedAt,
      status: 'in-progress',
      timeSegments: [{ start: new Date(startedAt).toISOString(), end: null, section: 'main' }],
    });
    // Log fictional observations through the normal per-set API while the fixture is active.
    // Starting from its schedule preserves the real historical prescription snapshots.
    for (const set of started.sets) {
      const index = exercises.findIndex((exercise) => exercise.id === set.exerciseId);
      const exercise = exercises[index];
      await api(`/workout-sessions/${started.id}/sets/${set.id}`, 'PATCH', {
        completed: true,
        ...(exercise.trackingType === 'duration'
          ? { seconds: 1800, zone: 2, rpe: 3 }
          : {
              reps: 10,
              weight: index === 0 ? 135 : null,
              ...(sessionIndex === 0 ? { rpe: 8 } : definitions[index].efforts[set.setNumber - 1]),
            }),
      });
    }
    sessions.push(
      await api<WorkoutSession>(`/workout-sessions/${started.id}`, 'PATCH', {
        status: 'completed',
        completedAt: startedAt + 3600000,
        feedback: {
          energy: 4,
          recovery: 4,
          technique: 4,
          responses: [{ id: 'session-rpe', label: 'Session RPE', type: 'scale', value: 7 }],
        },
      }),
    );
  }

  const scheduled = await api<{ id: string }>('/scheduled-workouts', 'POST', {
    templateId: template.id,
    date: '2026-09-08',
  });
  const initialPreview = await api<{ recommendations: WorkoutProgressionRecommendation[] }>(
    '/workout-progression/preview',
    'POST',
    { scheduledWorkoutId: scheduled.id },
  );
  for (const { evidence } of initialPreview.recommendations.filter(
    (item) => item.evidence.trackingType === 'weight_reps',
  )) {
    await api(
      `/workout-progression/scheduled-exercises/${evidence.scheduledWorkoutExerciseId}/configuration`,
      'PUT',
      {
        expectedRevision: 0,
        contextAvailability: 'available',
        contextFacts: [],
        priority: true,
        policy: {
          family: 'double_progression',
          version: 1,
          loadIncrement: 5,
          loadIncreasePercent: null,
          repRangeMin: 8,
          repRangeMax: 10,
          effortCeiling: 8,
          lowEffortThreshold: 7,
          secondsStep: null,
          distanceStep: null,
          zoneCeiling: null,
          allowReduction: false,
          contextRequired: false,
        },
      },
    );
  }
  const preview = await api<{ recommendations: WorkoutProgressionRecommendation[] }>(
    '/workout-progression/preview',
    'POST',
    { scheduledWorkoutId: scheduled.id },
  );
  return {
    username,
    password,
    token,
    exercises,
    templateId: template.id,
    completedSessionId: sessions[1].id,
    previousSessionId: sessions[0].id,
    scheduledWorkoutId: scheduled.id,
    preview,
  };
}
