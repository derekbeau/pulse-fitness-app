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
        workoutName="Upper Push"
      />,
    );

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
    expect(screen.getByTestId('session-summary-notes')).toHaveAttribute('id', 'session-summary-notes');
    expect(screen.getByTestId('session-summary-notes')).toHaveAttribute('name', 'session-summary-notes');
    expect(screen.getByLabelText('Session notes')).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Session notes' })).toHaveValue('');

    fireEvent.change(
      screen.getByPlaceholderText('What happened today? Anything notable about this session?'),
      {
        target: { value: 'Tempo was good but shoulders fatigued early.' },
      },
    );
    expect(notesChangeSpy).toHaveBeenCalledWith('Tempo was good but shoulders fatigued early.');

    fireEvent.click(screen.getByRole('button', { name: 'Save as Template' }));

    expect(
      screen.getByRole('heading', { name: 'Save this workout as a template' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Upper Push');
    expect(screen.getByLabelText('Description')).toHaveValue(
      'Chest, shoulders, and triceps emphasis with controlled tempo work.',
    );
    expect(screen.getByLabelText('Tags')).toHaveValue('strength, push, upper-body');

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Heavy upper emphasis with a slower incline press tempo.' },
    });
    fireEvent.change(screen.getByLabelText('Tags'), {
      target: { value: 'strength, push, hypertrophy' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Saved "Upper Push" to mock templates.')).toBeInTheDocument();
  });
});
