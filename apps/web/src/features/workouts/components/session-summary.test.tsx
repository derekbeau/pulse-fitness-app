import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithQueryClient } from '@/test/render-with-query-client';

import { SessionSummary } from './session-summary';

describe('SessionSummary', () => {
  it('opens the save-as-template dialog with prefilled fields and performs a mock save', () => {
    const notesChangeSpy = vi.fn();

    renderWithQueryClient(
      <SessionSummary
        defaultDescription="Chest, shoulders, and triceps emphasis with controlled tempo work."
        defaultTags={['strength', 'push', 'upper-body']}
        duration="47:12"
        exerciseResults={[
          {
            id: 'incline-press',
            name: 'Incline Dumbbell Press',
            notes: 'Kept shoulder blades pinned and reduced ROM for shoulder comfort.',
            programmingNotes: 'Hardstyle, hips snap',
            reps: 32,
            setsCompleted: 4,
            totalSets: 4,
            volume: 1760,
          },
          {
            id: 'lateral-raise',
            name: 'Cable Lateral Raise',
            notes: '',
            reps: 28,
            setsCompleted: 4,
            totalSets: 4,
            volume: 420,
          },
        ]}
        exercisesCompleted={7}
        feedback={[
          {
            id: 'knee-pain',
            label: 'Knee pain',
            max: 5,
            min: 1,
            notes: 'Stayed manageable after the second warmup round.',
            type: 'scale',
            value: 2,
          },
          {
            id: 'energy-level',
            label: 'Energy level',
            notes: '',
            options: ['😫', '😕', '😐', '🙂', '💪'],
            type: 'emoji',
            value: '🙂',
          },
          {
            id: 'pain-discomfort',
            label: 'Any pain or discomfort?',
            notes: '',
            type: 'yes_no',
            value: false,
          },
          {
            id: 'effort',
            label: 'Effort',
            max: 10,
            min: 1,
            notes: '',
            step: 1,
            type: 'slider',
            value: 8,
          },
          {
            id: 'limited-muscles',
            label: 'What limited performance?',
            notes: '',
            options: ['Shoulders', 'Grip', 'Cardio'],
            type: 'multi_select',
            value: ['Shoulders', 'Grip'],
          },
          {
            id: 'coach-note',
            label: 'Coach note',
            notes: '',
            type: 'text',
            value: 'Pause the first rep of each incline set next time.',
          },
        ]}
        onDone={() => {}}
        completedSets={14}
        onNotesChange={notesChangeSpy}
        sessionNotes=""
        totalReps={124}
        totalSets={14}
        totalVolume={7460}
        workoutName="Upper Push"
      />,
    );

    expect(screen.getByTestId('summary-pill-volume-total-volume')).toHaveClass('bg-blue-500/12');
    expect(screen.getByTestId('summary-pill-time-duration')).toHaveClass('bg-emerald-500/12');
    expect(screen.getByTestId('summary-pill-count-sets')).toHaveClass('bg-fuchsia-500/12');
    expect(screen.getByTestId('summary-pill-count-reps')).toHaveClass('bg-fuchsia-500/12');
    expect(screen.getByText('Total volume')).toBeInTheDocument();
    expect(screen.getByText('7,460 lbs')).toBeInTheDocument();
    expect(screen.getByText('47:12')).toBeInTheDocument();
    expect(screen.getByText('14/14')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Exercise results' })).toBeInTheDocument();
    expect(screen.getByText('Incline Dumbbell Press')).toBeInTheDocument();
    expect(screen.getByTestId('exercise-programming-notes-incline-press')).toHaveTextContent(
      'Hardstyle, hips snap',
    );
    expect(
      screen.getByText('Kept shoulder blades pinned and reduced ROM for shoulder comfort.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Volume: 1,760 lbs')).toBeInTheDocument();
    expect(screen.getByText('Reps: 32')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Session feedback' })).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
    expect(screen.getByText('🙂')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.getByText('8 (1 - 10)')).toBeInTheDocument();
    expect(screen.getByText('Shoulders, Grip')).toBeInTheDocument();
    expect(
      screen.getByText('Pause the first rep of each incline set next time.'),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('What happened today? Anything notable about this session?'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('What happened today? Anything notable about this session?'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('session-summary-notes')).toHaveAttribute(
      'id',
      'session-summary-notes',
    );
    expect(screen.getByTestId('session-summary-notes')).toHaveAttribute(
      'name',
      'session-summary-notes',
    );
    expect(screen.getByLabelText('Session notes')).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Session notes' })).toHaveValue('');

    fireEvent.change(
      screen.getByPlaceholderText('What happened today? Anything notable about this session?'),
      {
        target: { value: 'Tempo was good but shoulders fatigued early.' },
      },
    );
    expect(notesChangeSpy).toHaveBeenCalledWith('Tempo was good but shoulders fatigued early.');
    expect(screen.getByTestId('exercise-programming-notes-incline-press')).toHaveTextContent(
      'Hardstyle, hips snap',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save as Template' }));

    expect(
      screen.getByRole('heading', { name: 'Save this workout as a template' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Upper Push');
    expect(screen.getByLabelText('Description')).toHaveValue(
      'Chest, shoulders, and triceps emphasis with controlled tempo work.',
    );
    expect(screen.getByText('strength')).toBeInTheDocument();
    expect(screen.getByText('push')).toBeInTheDocument();
    expect(screen.getByText('upper-body')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag upper-body' }));
    expect(screen.queryByText('upper-body')).not.toBeInTheDocument();

    const tagsInput = screen.getByLabelText('Tags');
    fireEvent.focus(tagsInput);
    fireEvent.click(screen.getByRole('button', { name: 'hypertrophy' }));
    expect(screen.getByText('hypertrophy')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Heavy upper emphasis with a slower incline press tempo.' },
    });
    fireEvent.change(tagsInput, {
      target: { value: 'DELOAD' },
    });
    fireEvent.keyDown(tagsInput, { key: 'Enter' });

    expect(screen.getByText('deload')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Saved "Upper Push" to mock templates.')).toBeInTheDocument();
  });

  it('renders tracking-aware summary labels for time-based and mixed sessions', () => {
    renderWithQueryClient(
      <SessionSummary
        duration="12:00"
        exerciseResults={[
          {
            id: 'plank',
            metricLabel: 'seconds',
            metricValue: 120,
            name: 'Plank Hold',
            reps: 0,
            setsCompleted: 2,
            totalSets: 2,
          },
        ]}
        exercisesCompleted={1}
        onDone={() => {}}
        summaryMetricLabel="mixed"
        summaryMetricMixedValue="120 sec • 0.5 mi"
        totalReps={0}
        totalSets={2}
        totalVolume={0}
        workoutName="Conditioning"
      />,
    );

    expect(screen.getByText('Tracked metrics')).toBeInTheDocument();
    expect(screen.getByText('120 sec • 0.5 mi')).toBeInTheDocument();
    expect(screen.queryByTestId('summary-pill-count-reps')).not.toBeInTheDocument();
    expect(screen.getByText('Seconds: 120 sec')).toBeInTheDocument();
  });

  it('renders markdown in read-only exercise and feedback notes', () => {
    renderWithQueryClient(
      <SessionSummary
        duration="15:24"
        exerciseResults={[
          {
            id: 'incline-press',
            name: 'Incline Dumbbell Press',
            notes: '- **Brace** at lockout\n- Keep elbows stacked',
            reps: 16,
            setsCompleted: 2,
            totalSets: 2,
            volume: 880,
          },
        ]}
        exercisesCompleted={1}
        feedback={[
          {
            id: 'coach-note',
            label: 'Coach note',
            notes: 'Stay *conservative* early.\n\n<script>alert("xss")</script>',
            type: 'text',
            value: 'Solid pacing.',
          },
        ]}
        onDone={() => {}}
        totalReps={16}
        totalSets={2}
        totalVolume={880}
        workoutName="Upper Push"
      />,
    );

    expect(screen.getByText('Brace').tagName).toBe('STRONG');
    expect(screen.getByText('Keep elbows stacked').closest('li')).toBeInTheDocument();
    expect(screen.getByText('conservative').tagName).toBe('EM');
    expect(screen.getByText('<script>alert("xss")</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).not.toBeInTheDocument();
  });

  it('does not render a programming notes block when programmingNotes is null', () => {
    renderWithQueryClient(
      <SessionSummary
        duration="10:00"
        exerciseResults={[
          {
            id: 'incline-press',
            name: 'Incline Dumbbell Press',
            notes: '',
            programmingNotes: null,
            reps: 12,
            setsCompleted: 2,
            totalSets: 2,
            volume: 600,
          },
        ]}
        exercisesCompleted={1}
        onDone={() => {}}
        totalReps={12}
        totalSets={2}
        totalVolume={600}
        workoutName="Upper Push"
      />,
    );

    expect(screen.queryByTestId('exercise-programming-notes-incline-press')).not.toBeInTheDocument();
  });
});
