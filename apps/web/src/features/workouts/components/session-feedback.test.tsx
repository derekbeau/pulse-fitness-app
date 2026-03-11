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
      within(
        screen.getByRole('group', { name: 'Energy post workout options' }),
      ).getByRole('button', {
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
      'energy-post-workout',
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
      within(
        screen.getByRole('group', { name: 'Energy post workout options' }),
      ).getByRole('button', {
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
        id: 'energy-post-workout',
        label: 'Energy post workout',
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

  it('drops legacy custom fields that overlap standard prompts', () => {
    const onSubmit = vi.fn();

    render(
      <SessionFeedback
        fields={[
          {
            id: 'energy-post',
            label: 'Energy post workout',
            max: 5,
            min: 1,
            type: 'scale',
            value: 3,
          },
          {
            id: 'knee-pain',
            label: 'Knee pain',
            max: 5,
            min: 1,
            type: 'scale',
            value: 2,
          },
          {
            id: 'coach-note',
            label: 'Coach note',
            optional: true,
            type: 'text',
            value: '',
          },
        ]}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByRole('group', { name: 'Energy post workout rating' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Knee pain rating' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Energy post workout options' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Coach note' })).toBeInTheDocument();
  });

  it('keeps custom fields whose ids include pain/discomfort substrings', () => {
    render(
      <SessionFeedback
        fields={[
          {
            id: 'muscle-pain-scale',
            label: 'Muscle pain scale',
            max: 10,
            min: 1,
            type: 'slider',
            value: null,
          },
          {
            id: 'joint-discomfort-check',
            label: 'Joint discomfort check',
            optional: true,
            type: 'text',
            value: '',
          },
        ]}
        onSubmit={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Muscle pain scale' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Joint discomfort check' }),
    ).toBeInTheDocument();
  });
});
