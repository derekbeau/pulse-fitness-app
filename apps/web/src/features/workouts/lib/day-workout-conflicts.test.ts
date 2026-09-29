import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDayWorkoutConflicts } from './day-workout-conflicts';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiRequest: request }));

const plan = (sessionId: string | null) => ({
  id: 'plan',
  date: '2026-03-08',
  templateId: null,
  templateName: 'Fictional workout',
  sessionId,
  createdAt: 1,
  updatedAt: 1,
});
const session = {
  id: 'session',
  name: 'Fictional workout',
  date: '2026-03-08',
  actualLocalDate: '2026-03-09',
  status: 'in-progress',
  templateId: null,
  templateName: null,
  startedAt: Date.parse('2026-03-10T03:30:00Z'),
  completedAt: null,
  duration: null,
  exerciseCount: 1,
  createdAt: 1,
};

describe('actual-day duplicate detection', () => {
  afterEach(() => vi.clearAllMocks());

  it('does not invent a second workout on the consumed planned day', async () => {
    request.mockImplementation(async (url: string) =>
      url.includes('scheduled-workouts') ? [plan('session')] : [],
    );
    expect(await getDayWorkoutConflicts('2026-03-08')).toEqual([]);
    expect(request.mock.calls[1]?.[0]).toContain('dateBasis=actual');
  });

  it('keeps unstarted plans on their scheduled day and started sessions on the actual day', async () => {
    request.mockImplementation(async (url: string) => {
      if (url.includes('scheduled-workouts')) return url.includes('03-08') ? [plan(null)] : [];
      return url.includes('03-09') ? [session] : [];
    });
    expect(await getDayWorkoutConflicts('2026-03-08')).toMatchObject([{ status: 'scheduled' }]);
    expect(await getDayWorkoutConflicts('2026-03-09')).toMatchObject([
      { id: 'session-session', status: 'in-progress' },
    ]);
  });
});
