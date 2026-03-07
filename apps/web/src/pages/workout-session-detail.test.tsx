import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { mockSessions, mockTemplates } from '@/lib/mock-data/workouts';
import { WorkoutSessionDetailPage } from './workout-session-detail';

function renderWithRoute(sessionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/workouts/${sessionId}`]}>
      <Routes>
        <Route path="/workouts/:sessionId" element={<WorkoutSessionDetailPage />} />
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

  it('renders session header with template name and tags', () => {
    const session = mockSessions[0];
    const template = mockTemplates.find((t) => t.id === session.templateId);

    renderWithRoute(session.id);

    expect(screen.getByText(template?.name ?? 'Workout Session')).toBeInTheDocument();
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

  it('renders stat cards with duration, exercises, and sets', () => {
    const session = mockSessions[0];
    renderWithRoute(session.id);

    expect(screen.getByText(`${session.duration} min`)).toBeInTheDocument();
    expect(screen.getByText(`${session.exercises.length}`)).toBeInTheDocument();

    const completedSets = session.exercises.reduce(
      (total, ex) => total + ex.sets.filter((s) => s.completed).length,
      0,
    );
    expect(screen.getByText(`${completedSets}`)).toBeInTheDocument();
  });

  it('renders feedback card when session has feedback', () => {
    const session = mockSessions.find((s) => s.feedback !== null);
    if (!session || !session.feedback) return;

    renderWithRoute(session.id);

    expect(screen.getByText('Session Feedback')).toBeInTheDocument();
    expect(screen.getByText('Energy')).toBeInTheDocument();
    expect(screen.getByText('Recovery')).toBeInTheDocument();
    expect(screen.getByText('Technique')).toBeInTheDocument();

    const avg = (
      (session.feedback.energy + session.feedback.recovery + session.feedback.technique) /
      3
    ).toFixed(1);
    expect(screen.getByText(`${avg}/5`)).toBeInTheDocument();
  });

  it('does not render feedback card when session has no feedback', () => {
    const session = mockSessions.find((s) => s.feedback === null);
    if (!session) return;

    renderWithRoute(session.id);

    expect(screen.queryByText('Session Feedback')).not.toBeInTheDocument();
  });

  it('renders Repeat Workout button with correct link', () => {
    const session = mockSessions[0];
    renderWithRoute(session.id);

    const repeatButton = screen.getByRole('link', { name: /repeat workout/i });
    expect(repeatButton).toHaveAttribute('href', `/workouts/active?template=${session.templateId}`);
  });
});
