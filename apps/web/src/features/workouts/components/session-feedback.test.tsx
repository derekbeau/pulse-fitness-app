import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { workoutFeedbackFields } from '../lib/mock-data';
import { SessionFeedback } from './session-feedback';

describe('SessionFeedback', () => {
  it('renders dynamic feedback fields and collects values before finalizing the session', () => {
    const onSubmit = vi.fn();

    render(<SessionFeedback fields={workoutFeedbackFields} onSubmit={onSubmit} />);

    const finalizeButton = screen.getByRole('button', { name: 'Finalize session' });
    expect(finalizeButton).toBeEnabled();

    expect(screen.getByRole('group', { name: 'Knee pain rating' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Shoulder feel rating' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Energy post workout rating' })).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('Keep incline press to a 2-count pause on the chest next week.'),
    ).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Knee pain rating' })).getByRole('button', {
        name: '5',
      }),
    );
    fireEvent.change(screen.getByLabelText('Optional notes', { selector: '#knee-pain-notes' }), {
      target: { value: 'Pain spiked during the final split squat set.' },
    });
    fireEvent.change(
      screen.getByDisplayValue('Keep incline press to a 2-count pause on the chest next week.'),
      {
        target: { value: 'Stay tucked and keep the pause honest next week.' },
      },
    );

    fireEvent.click(finalizeButton);

    expect(onSubmit).toHaveBeenCalledWith([
      {
        id: 'knee-pain',
        label: 'Knee pain',
        max: 5,
        min: 1,
        notes: 'Pain spiked during the final split squat set.',
        type: 'scale',
        value: 5,
      },
      {
        id: 'shoulder-feel',
        label: 'Shoulder feel',
        max: 5,
        min: 1,
        notes: 'Left shoulder stayed stable with neutral-grip pressing.',
        type: 'scale',
        value: 4,
      },
      {
        id: 'energy-post',
        label: 'Energy post workout',
        max: 5,
        min: 1,
        notes: '',
        type: 'scale',
        value: 4,
      },
      {
        id: 'session-note',
        label: 'Coach note',
        notes: '',
        optional: true,
        type: 'text',
        value: 'Stay tucked and keep the pause honest next week.',
      },
    ]);
  });

  it('allows optional text feedback fields to be cleared without blocking finalization', () => {
    const onSubmit = vi.fn();

    render(<SessionFeedback fields={workoutFeedbackFields} onSubmit={onSubmit} />);

    const finalizeButton = screen.getByRole('button', { name: 'Finalize session' });
    const coachNoteInput = screen.getByDisplayValue(
      'Keep incline press to a 2-count pause on the chest next week.',
    );

    fireEvent.change(coachNoteInput, { target: { value: '' } });

    expect(finalizeButton).toBeEnabled();

    fireEvent.click(finalizeButton);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'session-note',
          optional: true,
          type: 'text',
          value: '',
        }),
      ]),
    );
  });
});
