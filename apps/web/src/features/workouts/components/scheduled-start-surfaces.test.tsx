import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';
import { WorkoutList } from './workout-list';
import { WorkoutCalendar } from './workout-calendar';

const state = vi.hoisted(() => ({
  date: '2026-09-06' as string | null,
  start: vi.fn(),
}));
vi.mock('../hooks/use-today-key', () => ({
  useTodayKey: () => ({
    todayKey: '2026-09-06',
    dateAuthorityLocked: false,
    getTodayKeyForMutation: () => state.date,
  }),
}));
vi.mock('@/hooks/use-workout-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-workout-session')>()),
  useStartSession: () => ({ mutateAsync: state.start, isPending: false }),
}));

beforeEach(() => {
  state.date = '2026-09-06';
  state.start.mockReset().mockResolvedValue({ id: 'new-session', templateId: 'template-1' });
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
});

for (const surface of ['list', 'calendar'] as const) {
  describe(`${surface} scheduled start`, () => {
    function renderSurface({ early = false, active = false, deleted = false } = {}) {
      const schedule = {
        id: 'scheduled-1',
        date: early ? '2026-09-07' : '2026-09-06',
        templateId: deleted ? null : 'template-1',
        templateName: deleted ? null : 'Snapshot workout',
        templateTrackingTypes: [],
        sessionId: null,
        createdAt: 1,
      };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
        const path = new URL(String(input), 'https://pulse.test').pathname;
        if (path === '/api/v1/workout-sessions')
          return Promise.resolve(
            jsonResponse({
              data: active
                ? [
                    {
                      id: 'active-1',
                      status: 'in-progress',
                      name: 'Active workout',
                      date: '2026-09-06',
                      templateId: null,
                      templateName: null,
                      startedAt: 1,
                      completedAt: null,
                      duration: null,
                      exerciseCount: 1,
                      createdAt: 1,
                    },
                  ]
                : [],
            }),
          );
        if (path === '/api/v1/scheduled-workouts')
          return Promise.resolve(jsonResponse({ data: [schedule] }));
        throw new Error(`Scheduled start must not fetch a template: ${path}`);
      });
      renderWithQueryClient(
        <MemoryRouter>
          {surface === 'list' ? (
            <WorkoutList sessions={[]} scheduledWorkouts={[schedule]} />
          ) : (
            <WorkoutCalendar />
          )}
        </MemoryRouter>,
      );
      return fetchSpy;
    }

    it.each(['normal', 'early', 'active', 'deleted'] as const)(
      'uses only schedule identity for %s starts without fetching the template',
      async (mode) => {
        const fetchSpy = renderSurface({
          early: mode === 'early',
          active: mode === 'active',
          deleted: mode === 'deleted',
        });
        const start = await screen.findByRole('button', { name: 'Start' });
        // Let active-session query resolve before opening its confirmation.
        await waitFor(() => expect(start).toBeEnabled());
        fireEvent.click(start);
        if (mode === 'early' || mode === 'active') {
          const dialog = await screen.findByRole('alertdialog');
          fireEvent.click(
            within(dialog).getByRole('button', {
              name: mode === 'early' ? 'Start now' : 'Start anyway',
            }),
          );
        }
        await waitFor(() => expect(state.start).toHaveBeenCalledTimes(1));
        expect(state.start).toHaveBeenCalledWith({
          scheduledWorkoutId: 'scheduled-1',
          date: '2026-09-06',
          startedAt: expect.any(Number),
        });
        expect(
          fetchSpy.mock.calls.every(([input]) => !String(input).includes('workout-templates')),
        ).toBe(true);
      },
    );

    it('retries stale exercises with the same schedule and explicit force', async () => {
      state.start.mockRejectedValueOnce(
        new ApiError(409, 'Stale exercise', 'STALE_SNAPSHOT_EXERCISES'),
      );
      renderSurface();
      const start = await screen.findByRole('button', { name: 'Start' });
      await waitFor(() => expect(start).toBeEnabled());
      fireEvent.click(start);
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Start anyway' }));
      await waitFor(() => expect(state.start).toHaveBeenCalledTimes(2));
      expect(state.start.mock.calls[1][0]).toEqual({
        scheduledWorkoutId: 'scheduled-1',
        date: '2026-09-06',
        startedAt: expect.any(Number),
        force: true,
      });
    });

    it.each([null, '2026-09-07'])(
      'aborts stale confirmation when authoritative day changes to %s',
      async (date) => {
        state.start.mockRejectedValueOnce(
          new ApiError(409, 'Stale exercise', 'STALE_SNAPSHOT_EXERCISES'),
        );
        renderSurface();
        const start = await screen.findByRole('button', { name: 'Start' });
        await waitFor(() => expect(start).toBeEnabled());
        fireEvent.click(start);
        const dialog = await screen.findByRole('alertdialog');
        state.date = date;
        fireEvent.click(within(dialog).getByRole('button', { name: 'Start anyway' }));
        expect(state.start).toHaveBeenCalledTimes(1);
      },
    );
  });
}
