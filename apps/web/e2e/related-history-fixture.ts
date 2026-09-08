import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { Exercise, ExerciseTrackingType, WorkoutSession } from '@pulse/shared';

export const RELATED_HISTORY_API = 'http://127.0.0.1:3154';
export const RELATED_HISTORY_DATABASE = resolve(__dirname, '../../../data/issue-154/browser.db');

/** Fictional data only, opt-in to the dedicated issue-154 acceptance database. */
export async function seedRelatedHistoryFixture(baseURL: string) {
  if (
    baseURL !== RELATED_HISTORY_API ||
    process.env.E2E_DATABASE_URL !== RELATED_HISTORY_DATABASE
  ) {
    throw new Error('Requires the explicit isolated issue-154 API and database');
  }
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
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status}`);
    return ((await response.json()) as { data: T }).data;
  }
  token = (
    await api<{ token: string }>('/auth/register', 'POST', {
      username: `related-history-${randomUUID().slice(0, 8)}`,
      password: 'fictional-history-only',
      name: 'Related History Preview',
      timeZone: 'America/Detroit',
    })
  ).token;
  const exercise = (
    name: string,
    trackingType: ExerciseTrackingType,
    relatedExerciseIds: string[] = [],
  ) =>
    api<Exercise>('/exercises', 'POST', {
      name,
      trackingType,
      relatedExerciseIds,
      category: 'compound',
      equipment: 'bodyweight',
      muscleGroups: ['full-body'],
    });
  const empty = await exercise('Unused Variation', 'weight_reps');
  const unstarted = await exercise('Unstarted Variation', 'weight_reps');
  const skipped = await exercise('Skipped Variation', 'weight_reps');
  const weighted = await exercise('Zero Load Press', 'weight_reps');
  const bodyweight = await exercise('Historical Push-up', 'bodyweight_reps');
  const timed = await exercise('Historical Hold', 'duration');
  const distance = await exercise('Historical Distance', 'distance');
  const related = [weighted, bodyweight, timed, distance];
  const mixed = await exercise('Mixed Preview Press', 'weight_reps', [
    empty.id,
    weighted.id,
    unstarted.id,
    bodyweight.id,
    skipped.id,
    timed.id,
    distance.id,
  ]);
  const emptyPrimary = await exercise('Empty Preview Press', 'weight_reps', [
    empty.id,
    unstarted.id,
    skipped.id,
  ]);
  const noRelated = await exercise('Direct Only Press', 'weight_reps');
  const startedAt = Date.parse('2026-09-01T13:00:00Z');
  const older = await api<WorkoutSession>('/workout-sessions', 'POST', {
    name: 'Older meaningful performance',
    date: '2026-09-01',
    startedAt,
    status: 'completed',
    completedAt: startedAt + 3600000,
    sets: [mixed, ...related].map((definition, index) => ({
      exerciseId: definition.id,
      orderIndex: index,
      section: 'main',
      setNumber: 1,
      completed: true,
      notes: 'Preserved historical note.',
      ...(definition.trackingType === 'duration'
        ? { seconds: 0 }
        : definition.trackingType === 'distance'
          ? { distance: 0 }
          : { weight: 0, reps: 8, rir: 0 }),
    })),
  });
  const newer = await api<WorkoutSession>('/workout-sessions', 'POST', {
    name: 'Newer unusable performance',
    date: '2026-09-02',
    startedAt: startedAt + 86400000,
    status: 'completed',
    completedAt: startedAt + 90000000,
    sets: [
      ...related.map((definition, index) => ({
        exerciseId: definition.id,
        orderIndex: index,
        section: 'main',
        setNumber: 1,
        completed: true,
        weight: 20,
      })),
      { exerciseId: empty.id, orderIndex: 4, section: 'main', setNumber: 1, completed: false },
      {
        exerciseId: unstarted.id,
        orderIndex: 5,
        section: 'main',
        setNumber: 1,
        weight: 0,
        reps: 8,
        completed: false,
      },
      {
        exerciseId: skipped.id,
        orderIndex: 6,
        section: 'main',
        setNumber: 1,
        weight: 0,
        reps: 8,
        completed: false,
        skipped: true,
      },
    ],
  });
  const active = await api<WorkoutSession>('/workout-sessions', 'POST', {
    name: 'Related History Acceptance',
    date: '2026-09-07',
    startedAt: startedAt + 6 * 86400000,
    status: 'in-progress',
    sets: [mixed, emptyPrimary, noRelated].map((definition, orderIndex) => ({
      exerciseId: definition.id,
      orderIndex,
      section: 'main',
      setNumber: 1,
      completed: false,
    })),
  });
  return { token, api, older, newer, active, mixed, emptyPrimary, noRelated, related };
}
