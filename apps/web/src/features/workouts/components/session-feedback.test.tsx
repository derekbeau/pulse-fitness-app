import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SessionFeedback } from './session-feedback';

describe('SessionFeedback', () => {
  it('collects ratings and optional notes before finalizing the session', () => {
    const onSubmit = vi.fn();

    render(<SessionFeedback onSubmit={onSubmit} />);

    const finalizeButton = screen.getByRole('button', { name: 'Finalize session' });
    expect(finalizeButton).toBeDisabled();

    fireEvent.click(within(screen.getByRole('group', { name: 'Energy rating' })).getByRole('button', { name: '4' }));
    fireEvent.change(screen.getByPlaceholderText('Add a note about energy if it mattered today.'), {
      target: { value: 'Felt steady all the way through pressing.' },
    });

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Recovery rating' })).getByRole('button', {
        name: '3',
      }),
    );
    fireEvent.change(screen.getByPlaceholderText('Add a note about recovery if it mattered today.'), {
      target: { value: 'Leg soreness was still lingering a bit.' },
    });

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Technique rating' })).getByRole('button', {
        name: '5',
      }),
    );

    expect(finalizeButton).toBeEnabled();

    fireEvent.click(finalizeButton);

    expect(onSubmit).toHaveBeenCalledWith({
      energy: {
        note: 'Felt steady all the way through pressing.',
        score: 4,
      },
      recovery: {
        note: 'Leg soreness was still lingering a bit.',
        score: 3,
      },
      technique: {
        note: '',
        score: 5,
      },
    });
  });
});
