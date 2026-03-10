import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ActiveWorkoutCustomFeedbackField } from '../types';
import { SessionFeedback } from './session-feedback';

describe('SessionFeedback', () => {
  it('renders standard questions first and supports richer question types', () => {
    const onSubmit = vi.fn();
    const templateFields: ActiveWorkoutCustomFeedbackField[] = [
      {
        id: 'sleep-quality',
        label: 'Slept well last night?',
        type: 'yes_no',
        value: null,
      },
      {
        id: 'effort',
        label: 'Effort slider',
        max: 10,
        min: 1,
        step: 1,
        type: 'slider',
        value: null,
      },
      {
        id: 'limited-muscles',
        label: 'What limited performance?',
        options: ['Shoulders', 'Grip', 'Cardio', 'Nothing'],
        type: 'multi_select',
        value: [],
      },
      {
        id: 'coach-note',
        label: 'Coach note',
        optional: true,
        type: 'text',
        value: '',
      },
    ];

    render(<SessionFeedback fields={templateFields} onSubmit={onSubmit} />);

    const finalizeButton = screen.getByRole('button', { name: 'Finalize session' });
    expect(finalizeButton).toBeDisabled();

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Session RPE rating' })).getByRole('button', {
        name: '7',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Energy Level options' })).getByRole('button', {
        name: '🙂',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Any pain or discomfort? response' })).getByRole(
        'button',
        {
          name: 'Yes',
        },
      ),
    );

    expect(screen.getByLabelText('Pain/discomfort details')).toBeInTheDocument();
    expect(finalizeButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Pain/discomfort details'), {
      target: { value: 'Mild right-knee discomfort during split squats.' },
    });
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Slept well last night? response' })).getByRole(
        'button',
        {
          name: 'No',
        },
      ),
    );
    fireEvent.change(screen.getByLabelText('Effort slider slider'), {
      target: { value: '8' },
    });
    fireEvent.click(
      within(screen.getByRole('group', { name: 'What limited performance? options' })).getByRole(
        'button',
        {
          name: 'Shoulders',
        },
      ),
    );

    expect(finalizeButton).toBeEnabled();

    fireEvent.click(finalizeButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submittedFeedback = onSubmit.mock.calls[0][0] as ActiveWorkoutCustomFeedbackField[];

    expect(submittedFeedback.map((field) => field.id)).toEqual([
      'session-rpe',
      'energy-level',
      'pain-discomfort',
      'sleep-quality',
      'effort',
      'limited-muscles',
      'coach-note',
    ]);
    expect(
      submittedFeedback.find((field) => field.id === 'pain-discomfort' && field.type === 'yes_no'),
    ).toEqual(
      expect.objectContaining({
        notes: 'Mild right-knee discomfort during split squats.',
        value: true,
      }),
    );
    expect(
      submittedFeedback.find((field) => field.id === 'sleep-quality' && field.type === 'yes_no'),
    ).toEqual(
      expect.objectContaining({
        value: false,
      }),
    );
    expect(submittedFeedback.find((field) => field.id === 'effort' && field.type === 'slider')).toEqual(
      expect.objectContaining({
        value: 8,
      }),
    );
    expect(
      submittedFeedback.find(
        (field) => field.id === 'limited-muscles' && field.type === 'multi_select',
      ),
    ).toEqual(
      expect.objectContaining({
        value: ['Shoulders'],
      }),
    );
  });

  it('allows completion without pain details when pain is no', () => {
    const onSubmit = vi.fn();

    render(<SessionFeedback fields={[]} onSubmit={onSubmit} />);

    const finalizeButton = screen.getByRole('button', { name: 'Finalize session' });

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Session RPE rating' })).getByRole('button', {
        name: '5',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Energy Level options' })).getByRole('button', {
        name: '😐',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Any pain or discomfort? response' })).getByRole(
        'button',
        {
          name: 'No',
        },
      ),
    );

    expect(screen.queryByLabelText('Pain/discomfort details')).not.toBeInTheDocument();
    expect(finalizeButton).toBeEnabled();

    fireEvent.click(finalizeButton);

    expect(onSubmit).toHaveBeenCalledWith([
      {
        id: 'session-rpe',
        label: 'Session RPE',
        max: 10,
        min: 1,
        notes: '',
        optional: false,
        type: 'scale',
        value: 5,
      },
      {
        id: 'energy-level',
        label: 'Energy Level',
        notes: '',
        optional: false,
        options: ['😫', '😕', '😐', '🙂', '💪'],
        type: 'emoji',
        value: '😐',
      },
      {
        id: 'pain-discomfort',
        label: 'Any pain or discomfort?',
        notes: '',
        optional: false,
        type: 'yes_no',
        value: false,
      },
    ]);
  });
});
