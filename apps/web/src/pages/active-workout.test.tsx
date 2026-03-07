import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActiveWorkoutPage } from './active-workout';

describe('ActiveWorkoutPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the active workout UI and advances focus after the rest timer completes', () => {
    renderActiveWorkoutPage();

    const heading = screen.getByRole('heading', { level: 1, name: 'Upper Push' });
    const headerCard = heading.closest('[data-slot="card"]');

    expect(headerCard).toHaveClass('sticky');
    expect(screen.getByText('Exercise 3 of 7')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Session context' })).toBeInTheDocument();
    expect(screen.getByText('Recent Training')).toBeInTheDocument();
    expect(screen.getByText('Recovery Status')).toBeInTheDocument();
    expect(screen.getByText('Active Injuries')).toBeInTheDocument();
    expect(screen.getByText('Training Phase')).toBeInTheDocument();
    expect(screen.getByText('Warmup (2/2 exercises done)')).toBeInTheDocument();

    const inclineCard = getExerciseCard('Incline Dumbbell Press');

    fireEvent.click(within(inclineCard).getByLabelText('Complete set 3'));

    expect(screen.getByText('Rest Timer')).toBeInTheDocument();
    expect(screen.getByText('After Incline Dumbbell Press')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(90_100);
    });

    const nextExerciseCard = getExerciseCard('Seated Dumbbell Shoulder Press');
    expect(within(nextExerciseCard).getByLabelText('Reps for set 1')).toHaveFocus();
    expect(screen.queryByText('Rest Timer')).not.toBeInTheDocument();
  });

  it('moves from session logging to feedback, summary, and back to workouts', async () => {
    renderActiveWorkoutPage();

    const inclineCard = getExerciseCard('Incline Dumbbell Press');

    fireEvent.click(within(inclineCard).getByRole('button', { name: 'Notes' }));
    fireEvent.change(within(inclineCard).getByLabelText('Session notes'), {
      target: { value: 'Lower the bench by one notch before the top set.' },
    });
    expect(
      within(inclineCard).getByDisplayValue('Lower the bench by one notch before the top set.'),
    ).toBeVisible();

    completeSet('Incline Dumbbell Press', 3);
    completeSet('Seated Dumbbell Shoulder Press', 1);
    completeSet('Seated Dumbbell Shoulder Press', 2);
    completeSet('Seated Dumbbell Shoulder Press', 3);
    completeSet('Cable Lateral Raise', 1);
    completeSet('Cable Lateral Raise', 2);
    completeSet('Cable Lateral Raise', 3);
    completeSet('Rope Triceps Pushdown', 1);
    completeSet('Rope Triceps Pushdown', 2);
    completeSet('Rope Triceps Pushdown', 3);
    completeSet('Couch Stretch', 1);

    fireEvent.click(within(getExerciseCard('Couch Stretch')).getByLabelText('Complete set 2'));
    await act(async () => {});

    expect(
      screen.getByRole('heading', { level: 2, name: 'How did this session feel?' }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Energy rating' })).getByRole('button', {
        name: '4',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Recovery rating' })).getByRole('button', {
        name: '3',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Technique rating' })).getByRole('button', {
        name: '5',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Finalize session' }));
    await act(async () => {});

    expect(screen.getByRole('heading', { level: 1, name: 'Workout summary' })).toBeInTheDocument();
    expect(screen.getByText('Exercises completed')).toBeInTheDocument();
    expect(screen.getByText('Sets completed')).toBeInTheDocument();
    expect(screen.getByText('Total reps')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await act(async () => {});

    expect(screen.getByRole('heading', { level: 1, name: 'Workouts' })).toBeInTheDocument();
  });

  it('uses the selected template from the route query string', () => {
    renderActiveWorkoutPage('/workouts/active?template=lower-quad-dominant');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Lower Quad-Dominant' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Exercise 1 of 7')).toBeInTheDocument();
  });
});

function renderActiveWorkoutPage(initialEntry = '/workouts/active') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<ActiveWorkoutPage />} path="/workouts/active" />
        <Route element={<h1>Workouts</h1>} path="/workouts" />
      </Routes>
    </MemoryRouter>,
  );
}

function getExerciseCard(name: string) {
  const card = screen.getByRole('heading', { level: 3, name }).closest('[data-slot="card"]');

  if (!card) {
    throw new Error(`Expected exercise card for ${name}.`);
  }

  return card as HTMLElement;
}

function completeSet(exerciseName: string, setNumber: number) {
  fireEvent.click(
    within(getExerciseCard(exerciseName)).getByLabelText(`Complete set ${setNumber}`),
  );

  const skipButton = screen.queryByRole('button', { name: 'Skip' });

  if (skipButton) {
    fireEvent.click(skipButton);
  }
}
