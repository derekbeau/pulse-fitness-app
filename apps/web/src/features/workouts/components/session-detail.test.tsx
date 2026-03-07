import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { workoutCompletedSessions } from '..';
import { SessionDetail } from './session-detail';

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
    expect(screen.getAllByText(/Set 1:/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Shoulder feel')).toBeInTheDocument();
    expect(screen.getByText(session.notes)).toBeInTheDocument();
  });
});
