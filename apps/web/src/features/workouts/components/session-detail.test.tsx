import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { workoutCompletedSessions } from '..';
import { SessionDetail } from './session-detail';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">
        {React.isValidElement(children)
          ? React.cloneElement(
              children as React.ReactElement<{ height?: number; width?: number }>,
              {
                height: 320,
                width: 640,
              },
            )
          : children}
      </div>
    ),
  };
});

describe('SessionDetail', () => {
  it('renders a not-found state for unknown sessions', () => {
    render(
      <MemoryRouter>
        <SessionDetail sessionId="missing-session" />
      </MemoryRouter>,
    );

    expect(screen.getByText('Session not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to workouts/i })).toHaveAttribute(
      'href',
      '/workouts',
    );
  });

  it('renders completed session receipt data from the workout feature mocks', () => {
    const session = workoutCompletedSessions[0];

    render(
      <MemoryRouter>
        <SessionDetail sessionId={session.id} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Workout receipt')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Section breakdown')).toBeInTheDocument();
    expect(screen.getByText('Feedback')).toBeInTheDocument();
    expect(screen.getByText('Session notes')).toBeInTheDocument();
    expect(screen.getByLabelText(/show comparison/i)).toBeInTheDocument();
    expect(screen.queryByText('Volume progression')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Set 1:/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Shoulder feel')).toBeInTheDocument();
    expect(screen.getByText(session.notes)).toBeInTheDocument();
  });

  it('shows volume progression, deltas, and PR badges when comparison is enabled', () => {
    const session = workoutCompletedSessions[0];

    render(
      <MemoryRouter>
        <SessionDetail sessionId={session.id} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText(/show comparison/i));

    expect(screen.getByText('Volume progression')).toBeInTheDocument();
    expect(screen.getAllByText(/vs feb 20/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Weight +5 kg').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reps +1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PR').length).toBeGreaterThan(0);
    expect(screen.queryByText('Weight -')).not.toBeInTheDocument();
  });

  it('shows the first-session fallback when there is no previous session for the template', () => {
    const session = workoutCompletedSessions.find((candidate) => candidate.templateId === 'full-body');

    if (!session) {
      throw new Error('Expected a full-body session in workoutCompletedSessions');
    }

    render(
      <MemoryRouter>
        <SessionDetail sessionId={session.id} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText(/show comparison/i));

    expect(screen.getByText('First session — no comparison available')).toBeInTheDocument();
  });

  it('opens an exercise trend chart from the session detail exercise action', () => {
    const session = workoutCompletedSessions[0];

    render(
      <MemoryRouter>
        <SessionDetail sessionId={session.id} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /open incline dumbbell press trend chart/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Incline Dumbbell Press trends')).toBeInTheDocument();
    expect(screen.getByLabelText('Incline Dumbbell Press trend chart')).toBeInTheDocument();
  });
});
