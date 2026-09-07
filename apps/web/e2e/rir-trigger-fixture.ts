import { randomUUID } from 'node:crypto';
import type { Exercise, WorkoutSession } from '@pulse/shared';

export const RIR_TRIGGER_API = 'http://127.0.0.1:3155';

/** Opt-in fictional data for the dedicated, empty issue-155 acceptance database. */
export async function seedRirTriggerFixture(baseURL: string) {
  if (baseURL !== RIR_TRIGGER_API) throw new Error('Requires isolated issue-155 API on 3155');
  const username = `rir-trigger-${randomUUID().slice(0, 8)}`;
  const password = 'fictional-rir-trigger-only';
  let token = '';
  async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`${baseURL}/api/v1${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok)
      throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return ((await response.json()) as { data: T }).data;
  }
  token = (
    await api<{ token: string }>('/auth/register', 'POST', {
      username,
      password,
      name: 'Shortcut Preview',
      timeZone: 'America/Detroit',
    })
  ).token;
  const definitions = [
    { name: 'Shortcut Bench Press', trackingType: 'weight_reps' },
    { name: 'Shortcut Push-up', trackingType: 'bodyweight_reps' },
    { name: 'Shortcut Band Pull-apart', trackingType: 'reps_only' },
    { name: 'Shortcut Easy Walk', trackingType: 'duration' },
  ] as const;
  const exercises: Exercise[] = [];
  for (const definition of definitions) {
    exercises.push(
      await api<Exercise>('/exercises', 'POST', {
        ...definition,
        category: definition.trackingType === 'duration' ? 'cardio' : 'compound',
        equipment: 'bodyweight',
        muscleGroups: ['full-body'],
      }),
    );
  }
  async function session(completed: boolean) {
    const startedAt = Date.parse('2026-09-07T13:00:00Z');
    return api<WorkoutSession>('/workout-sessions', 'POST', {
      name: completed ? 'Shortcut Completed Preview' : 'Shortcut Active Preview',
      date: '2026-09-07',
      startedAt,
      status: completed ? 'completed' : 'in-progress',
      ...(completed ? { completedAt: startedAt + 3600000 } : {}),
      sets: exercises.flatMap((exercise, orderIndex) =>
        [1, 2].map((setNumber) => ({
          exerciseId: exercise.id,
          orderIndex,
          section: 'main',
          setNumber,
          completed: completed || setNumber === 2,
          ...(exercise.trackingType === 'duration'
            ? { seconds: 1800, rpe: 3, zone: 2 }
            : {
                reps: completed || setNumber === 2 ? 8 : null,
                ...(orderIndex === 0 ? { weight: 135 } : {}),
                ...(setNumber === 1 ? { rpe: 8 } : { rir: 4 }),
              }),
        })),
      ),
    });
  }
  const completed = await session(true);
  const active = await session(false);
  return { username, password, token, exercises, active, completed, api };
}
