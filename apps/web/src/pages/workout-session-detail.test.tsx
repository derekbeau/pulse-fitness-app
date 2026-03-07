import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { workoutCompletedSessions } from '@/features/workouts';
import { mockTemplates } from '@/lib/mock-data/workouts';
import { WorkoutSessionDetailPage } from './workout-session-detail';

function renderWithRoute(sessionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/workouts/session/${sessionId}`]}>
      <Routes>
        <Route path="/workouts/session/:sessionId" element={<WorkoutSessionDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WorkoutSessionDetailPage', () => {
  it('renders not-found state for unknown sessionId', () => {
    renderWithRoute('nonexistent-id');

    expect(screen.getByText('Session not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to workouts/i })).toHaveAttribute(
      'href',
      '/workouts',
    );
  });

  it('renders session header, summary stats, and tags', () => {
    const session = workoutCompletedSessions[0];
    const template = mockTemplates.find((t) => t.id === session.templateId);
    const totalReps = session.exercises.reduce(
      (count, exercise) => count + exercise.sets.reduce((sum, set) => sum + set.reps, 0),
      0,
    );

    renderWithRoute(session.id);

    expect(screen.getByText(template?.name ?? 'Workout Session')).toBeInTheDocument();
    expect(screen.getByText(`${session.exercises.length}`)).toBeInTheDocument();
    expect(screen.getByText(`${totalReps}`)).toBeInTheDocument();
    if (template?.tags) {
      for (const tag of template.tags) {
        const formatted = tag
          .split(/[- ]+/)
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
        expect(screen.getByText(formatted)).toBeInTheDocument();
      }
    }
  });

  it('renders collapsible section breakdown with logged sets', () => {
    const session = workoutCompletedSessions[0];
    renderWithRoute(session.id);

    expect(screen.getByText('Section breakdown')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Main' }).closest('details')).toHaveAttribute(
      'open',
    );
    expect(screen.getAllByText(/Set 1:/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Supplemental')).toBeInTheDocument();
  });

  it('renders feedback card when session has feedback', () => {
    const session = workoutCompletedSessions.find((s) => s.feedback !== null);
    if (!session || !session.feedback) return;

    renderWithRoute(session.id);

    expect(screen.getByText('Feedback')).toBeInTheDocument();
    expect(screen.getByText('Shoulder feel')).toBeInTheDocument();
    expect(screen.getByText('Coach note')).toBeInTheDocument();
    expect(screen.getByText('Energy')).toBeInTheDocument();
    expect(screen.getAllByText('Recovery').length).toBeGreaterThan(0);
    expect(screen.getByText('Technique')).toBeInTheDocument();
    expect(screen.getByText(session.feedback.notes ?? '')).toBeInTheDocument();
  });

  it('renders session notes when present', () => {
    const session = workoutCompletedSessions[0];

    renderWithRoute(session.id);

    expect(screen.getByText('Session notes')).toBeInTheDocument();
    expect(screen.getByText(session.notes)).toBeInTheDocument();
  });

  it('renders Repeat Workout button with correct link', () => {
    const session = workoutCompletedSessions[0];
    renderWithRoute(session.id);

    const repeatButton = screen.getByRole('link', { name: /repeat workout/i });
    expect(repeatButton).toHaveAttribute('href', `/workouts/active?template=${session.templateId}`);
  });
});
