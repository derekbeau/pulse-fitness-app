import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACTIVE_WORKOUT_SESSION_STORAGE_KEY,
  WORKOUT_SESSION_COMPLETED_NOTICE,
  WORKOUT_SESSION_NOTICE_QUERY_KEY,
} from '@/features/workouts/lib/session-persistence';
import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { jsonResponse } from '@/test/test-utils';

import { ActiveSessionResumeGate } from './active-session-resume-gate';

const mockFetch = vi.fn();

function LocationProbe() {
  const location = useLocation();

  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

function renderGate(initialEntry = '/workouts') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ActiveSessionResumeGate />
      <LocationProbe />
      <Routes>
        <Route element={<h1>Workouts</h1>} path="/workouts" />
        <Route element={<h1>Active workout</h1>} path="/workouts/active" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ActiveSessionResumeGate', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
    window.localStorage.removeItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY);
  });

  it('resumes an in-progress stored session and navigates to active workout', async () => {
    window.localStorage.setItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY, 'session-1');
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          id: 'session-1',
          userId: 'user-1',
          templateId: 'upper-push',
          name: 'Upper Push',
          date: '2026-03-09',
          status: 'in-progress',
          startedAt: 100,
          completedAt: null,
          duration: null,
          timeSegments: [
            {
              start: '2026-03-09T00:00:00.000Z',
              end: null,
            },
          ],
          feedback: null,
          notes: null,
          sets: [],
          createdAt: 100,
          updatedAt: 100,
        },
      }),
    );

    renderGate('/workouts');

    await waitFor(() => {
      expect(
        screen.getByText('/workouts/active?sessionId=session-1&template=upper-push'),
      ).toBeVisible();
    });
  });

  it('clears stale storage when the stored session is missing', async () => {
    window.localStorage.setItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY, 'missing-session');
    mockFetch.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'WORKOUT_SESSION_NOT_FOUND',
            message: 'Workout session not found',
          },
        },
        { status: 404 },
      ),
    );

    renderGate('/workouts');

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(window.localStorage.getItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY)).toBeNull();
    expect(screen.getByText('/workouts')).toBeVisible();
  });

  it('redirects completed stored sessions to workouts with a notice and clears storage', async () => {
    window.localStorage.setItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY, 'session-1');
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          id: 'session-1',
          userId: 'user-1',
          templateId: 'upper-push',
          name: 'Upper Push',
          date: '2026-03-09',
          status: 'completed',
          startedAt: 100,
          completedAt: 200,
          duration: 10,
          timeSegments: [
            {
              start: '2026-03-09T00:00:00.000Z',
              end: '2026-03-09T00:10:00.000Z',
            },
          ],
          feedback: {
            energy: 4,
            recovery: 4,
            technique: 4,
          },
          notes: null,
          sets: [],
          createdAt: 100,
          updatedAt: 200,
        },
      }),
    );

    renderGate('/workouts');

    await waitFor(() => {
      expect(
        screen.getByText(
          `/workouts?${WORKOUT_SESSION_NOTICE_QUERY_KEY}=${WORKOUT_SESSION_COMPLETED_NOTICE}`,
        ),
      ).toBeVisible();
    });

    expect(window.localStorage.getItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('clears stored session id for non-active statuses without redirecting', async () => {
    window.localStorage.setItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY, 'session-scheduled');
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          id: 'session-scheduled',
          userId: 'user-1',
          templateId: 'upper-push',
          name: 'Upper Push',
          date: '2026-03-09',
          status: 'scheduled',
          startedAt: 100,
          completedAt: null,
          duration: null,
          timeSegments: [],
          feedback: null,
          notes: null,
          sets: [],
          createdAt: 100,
          updatedAt: 100,
        },
      }),
    );

    renderGate('/workouts');

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(window.localStorage.getItem(ACTIVE_WORKOUT_SESSION_STORAGE_KEY)).toBeNull();
    expect(screen.getByText('/workouts')).toBeVisible();
  });
});
