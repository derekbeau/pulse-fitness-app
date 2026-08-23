import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DataQualityCalendar, DataQualityCalendarDay } from '@pulse/shared';

import { useCreateDataQualityContext, useDataQualityCalendar } from '../api/data-quality';
import { DataQualityCalendarWorkspace } from './data-quality-calendar-workspace';

vi.mock('../api/data-quality', () => ({
  useCreateDataQualityContext: vi.fn(),
  useDataQualityCalendar: vi.fn(),
}));

vi.mock('@/features/adaptive-nutrition/components/nutrition-day-status-control', () => ({
  NutritionDayStatusControl: ({ date }: { date: string }) => (
    <div data-testid="nutrition-status-control">Status control for {date}</div>
  ),
}));

const addDays = (date: string, amount: number) => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

const emptyDay = (date: string): DataQualityCalendarDay => ({
  date,
  isToday: date === '2026-08-18',
  nutrition: {
    qualityState: 'no_records',
    evidenceState: 'missing',
    logId: null,
    explicitStatus: null,
    totals: null,
    mealCount: null,
    itemCount: null,
    createdAt: null,
    statusUpdatedAt: null,
    updatedAt: null,
    provenance: {
      type: 'not_recorded',
      label: 'Not recorded',
      agentTokenId: null,
      limitation: 'No record.',
    },
    reasonCodes: [],
    actions: [],
  },
  weight: {
    evidenceState: 'missing',
    entryId: null,
    weight: null,
    unit: null,
    trendWeight: null,
    correctionState: 'not_applicable',
    suspect: false,
    stale: false,
    createdAt: null,
    updatedAt: null,
    provenance: {
      type: 'not_recorded',
      label: 'Not recorded',
      agentTokenId: null,
      limitation: 'No record.',
    },
    reasonCodes: [],
    actions: [],
  },
  workouts: [],
  algorithm: {
    state: 'learning',
    nutritionEvidenceState: 'missing',
    weightEvidenceState: 'missing',
    reasonCodes: ['INSUFFICIENT_NUTRITION'],
    events: [],
    omittedEventCount: 0,
  },
  contexts: [],
  omittedWorkoutCount: 0,
  omittedContextCount: 0,
});

const calendar = (): DataQualityCalendar => {
  const days = Array.from({ length: 42 }, (_, index) => emptyDay(addDays('2026-07-27', index)));
  const selected = days.find((day) => day.date === '2026-08-18');
  if (!selected) throw new Error('Expected selected day fixture');
  selected.nutrition = {
    qualityState: 'complete',
    evidenceState: 'pending_cutoff',
    logId: 'nutrition-18',
    explicitStatus: 'complete',
    totals: { calories: 2410, protein: 168, carbs: 265, fat: 71 },
    mealCount: 4,
    itemCount: 12,
    createdAt: 1_777_000_000_000,
    statusUpdatedAt: 1_777_000_000_000,
    updatedAt: 1_777_000_000_000,
    provenance: {
      type: 'not_recorded',
      label: 'Not recorded',
      agentTokenId: null,
      limitation: 'Unavailable.',
    },
    reasonCodes: ['COMPLETE_NUTRITION_PENDING_COMPLETED_DAY_CUTOFF'],
    actions: [],
  };
  selected.weight = {
    evidenceState: 'pending_cutoff',
    entryId: 'weight-18',
    weight: 176.8,
    unit: 'lbs',
    trendWeight: 175.9,
    correctionState: 'history_unavailable',
    suspect: false,
    stale: false,
    createdAt: 1_777_000_000_000,
    updatedAt: 1_777_000_001_000,
    provenance: {
      type: 'not_recorded',
      label: 'Not recorded',
      agentTokenId: null,
      limitation: 'Unavailable.',
    },
    reasonCodes: ['WEIGH_INS_PENDING_COMPLETED_DAY_CUTOFF'],
    actions: [],
  };
  selected.workouts = [
    {
      id: 'workout-18',
      kind: 'workout_session',
      name: 'Upper strength',
      state: 'completed',
      scheduledWorkoutId: null,
      sessionId: 'workout-18',
      sessionStatus: 'completed',
      plannedDate: null,
      sessionDate: '2026-08-18',
      relation: 'unlinked',
      relationLimitation: null,
      correctionState: 'history_unavailable',
      startedAt: 1_777_000_000_000,
      completedAt: 1_777_000_000_500,
      createdAt: 1_777_000_000_000,
      updatedAt: 1_777_000_001_000,
      provenance: {
        type: 'not_recorded',
        label: 'Not recorded',
        agentTokenId: null,
        limitation: 'Unavailable.',
      },
      reasonCodes: ['WORKOUT_RECORD_CORRECTED'],
      actions: [],
    },
  ];
  selected.algorithm = {
    state: 'holding',
    nutritionEvidenceState: 'pending_cutoff',
    weightEvidenceState: 'pending_cutoff',
    reasonCodes: ['INSUFFICIENT_NUTRITION'],
    events: [
      {
        id: 'review-18',
        kind: 'weekly_review',
        state: 'deferred',
        effectiveDate: '2026-08-18',
        createdAt: 1_777_000_000_000,
        reasonCodes: [],
        provenance: {
          type: 'system_derived',
          label: 'Pulse algorithm',
          agentTokenId: null,
          limitation: null,
        },
        actions: [],
      },
    ],
    omittedEventCount: 0,
  };
  selected.contexts = [
    {
      id: 'context-18',
      subjectKind: 'date',
      category: 'illness',
      note: 'Recovery day after a cold',
      resolution: null,
      provenance: { type: 'agent_token', agentTokenId: 'agent-1', label: 'Coach Agent' },
      revision: 2,
      createdAt: 1_777_000_000_000,
      updatedAt: 1_777_000_001_000,
      actions: [],
    },
  ];
  return {
    range: { startDate: '2026-07-27', endDate: '2026-09-06' },
    today: '2026-08-18',
    timeZone: 'America/Detroit',
    days,
    summary: {
      nutrition: { complete: 1, partial: 0, unknown: 0, missing: 41, pending: 1, excluded: 1 },
      weight: { logged: 1, missing: 41, pending: 1, excluded: 1, corrected: 1 },
      workout: { planned: 0, active: 0, completed: 0, cancelled: 0, corrected: 1 },
      algorithm: { learning: 41, updating: 0, holding: 1, pendingReview: 1 },
      contextDays: 1,
      intervalLabel: 'Visible calendar grid',
    },
  };
};

const mutateAsync = vi.fn();
const refetch = vi.fn();

beforeEach(() => {
  mutateAsync.mockReset();
  refetch.mockReset();
  vi.mocked(useDataQualityCalendar).mockReturnValue({
    data: calendar(),
    isPending: false,
    isError: false,
    isFetching: false,
    refetch,
  } as unknown as ReturnType<typeof useDataQualityCalendar>);
  vi.mocked(useCreateDataQualityContext).mockReturnValue({
    mutateAsync,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useCreateDataQualityContext>);
});

const renderWorkspace = () =>
  render(
    <MemoryRouter initialEntries={['/data-quality?date=2026-08-18']}>
      <DataQualityCalendarWorkspace />
    </MemoryRouter>,
  );

describe('DataQualityCalendarWorkspace', () => {
  it('renders the authoritative bootstrap month without a browser-local range request', async () => {
    const tokyo = calendar();
    tokyo.today = '2027-01-01';
    tokyo.timeZone = 'Asia/Tokyo';
    vi.mocked(useDataQualityCalendar).mockReturnValue({
      data: tokyo,
      isPending: false,
      isError: false,
      isFetching: false,
      refetch,
    } as unknown as ReturnType<typeof useDataQualityCalendar>);

    render(
      <MemoryRouter initialEntries={['/data-quality']}>
        <DataQualityCalendarWorkspace />
      </MemoryRouter>,
    );

    expect(vi.mocked(useDataQualityCalendar).mock.calls[0]?.[0]).toEqual({});
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'January 2027' })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Jump to date')).toHaveValue('2027-01-01');
    expect(vi.mocked(useDataQualityCalendar)).toHaveBeenCalledTimes(1);
  });

  it('renders honest cross-domain facts, provenance, and exact algorithm treatment', () => {
    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Tuesday, August 18, 2026.*Pending cutoff/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('2410 kcal')).toBeInTheDocument();
    expect(screen.getByText('176.8 lbs')).toBeInTheDocument();
    expect(screen.getByText('Upper strength')).toBeInTheDocument();
    expect(screen.getByText('weekly review · deferred')).toBeInTheDocument();
    expect(screen.getByText('Recovery day after a cold')).toBeInTheDocument();
    expect(screen.getByText('AgentToken · Coach Agent')).toBeInTheDocument();
    expect(screen.getByTestId('nutrition-status-control')).toHaveTextContent('2026-08-18');
    expect(screen.getAllByText('pending cutoff').length).toBeGreaterThan(0);
  });

  it('supports keyboard domain filtering without removing the calendar date truth', () => {
    renderWorkspace();
    const contextFilter = screen.getByRole('button', { name: 'Context' });
    contextFilter.focus();
    fireEvent.keyDown(contextFilter, { key: 'Enter' });
    fireEvent.click(contextFilter);

    expect(contextFilter).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('heading', { name: 'Context' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nutrition' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tuesday, August 18, 2026/ })).toBeInTheDocument();
  });

  it('shows the authoritative refresh path for stale review evidence', () => {
    const stale = calendar();
    const today = stale.days.find((day) => day.date === stale.today);
    if (!today) throw new Error('Expected today fixture');
    const review = today.algorithm.events[0];
    if (!review) throw new Error('Expected review fixture');
    review.state = 'stale';
    review.actions = [
      {
        kind: 'view_review',
        label: 'View weekly review',
        href: `/nutrition/reviews/${review.id}`,
        method: 'navigate',
      },
      {
        kind: 'refresh_review',
        label: 'Refresh stale weekly review',
        href: `/nutrition/reviews/${review.id}`,
        method: 'navigate',
      },
    ];
    vi.mocked(useDataQualityCalendar).mockReturnValue({
      data: stale,
      isPending: false,
      isError: false,
      isFetching: false,
      refetch,
    } as unknown as ReturnType<typeof useDataQualityCalendar>);

    renderWorkspace();
    expect(screen.getByText('weekly review · stale')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Refresh stale weekly review' })).toHaveAttribute(
      'href',
      `/nutrition/reviews/${review.id}`,
    );
  });

  it('submits bounded date context through the shared form schema', async () => {
    mutateAsync.mockResolvedValue({ id: 'context-created' });
    renderWorkspace();

    fireEvent.click(screen.getByRole('button', { name: 'Add context' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Context type'), {
      target: { value: 'illness' },
    });
    fireEvent.change(within(dialog).getByLabelText('What should Pulse know?'), {
      target: { value: 'Migraine affected appetite and training.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add context' }));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        subject: { kind: 'date', localDate: '2026-08-18' },
        category: 'illness',
        note: 'Migraine affected appetite and training.',
        resolution: undefined,
        resolutionKind: undefined,
      }),
    );
  });

  it('keeps retry available when the read-only request fails', () => {
    vi.mocked(useDataQualityCalendar).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      isFetching: false,
      refetch,
    } as unknown as ReturnType<typeof useDataQualityCalendar>);

    renderWorkspace();
    expect(screen.getByRole('alert')).toHaveTextContent('Your source records are safe');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
