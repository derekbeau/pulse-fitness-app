import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ScheduledWorkoutHeader } from './scheduled-workout-header';

function renderHeader(isTemplateAvailable: boolean) {
  render(
    <MemoryRouter>
      <ScheduledWorkoutHeader
        isMutating={false}
        isTemplateAvailable={isTemplateAvailable}
        onCancel={vi.fn()}
        onReschedule={vi.fn()}
        onStart={vi.fn()}
        scheduledDateLabel="Monday, August 24, 2026"
        templateId={null}
        templateName={null}
      />
    </MemoryRouter>,
  );
}

describe('ScheduledWorkoutHeader', () => {
  it('labels a valid snapshot-only workout as custom', () => {
    renderHeader(true);

    expect(screen.getByRole('heading', { name: 'Custom workout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeEnabled();
  });

  it('reserves unavailable copy for a workout that cannot start', () => {
    renderHeader(false);

    expect(screen.getByRole('heading', { name: 'Workout unavailable' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeDisabled();
  });
});
