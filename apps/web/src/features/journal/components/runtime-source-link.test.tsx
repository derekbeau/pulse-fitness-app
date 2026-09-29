import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RuntimeSourceLink } from './runtime-source-link';

describe('compact runtime source link', () => {
  it('keeps the complete reference behind a keyboard-accessible disclosure', () => {
    render(
      <MemoryRouter>
        <RuntimeSourceLink
          compact
          label="View workout session · Sep 28"
          reference={{
            kind: 'workout_session',
            id: 'fictional-long-source-id',
            revisionId: 'sha256:fictional-revision',
            subjectUserId: 'owner',
          }}
        />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'View workout session · Sep 28' });
    expect(link).toHaveAttribute('href', '/workouts/session/fictional-long-source-id');
    expect(screen.queryByText(/sha256:fictional-revision/)).not.toBeVisible();
    const detail = screen.getByText('Source details');
    fireEvent.click(detail);
    expect(screen.getByText(/sha256:fictional-revision/)).toBeVisible();
    expect(screen.getByText(/fictional-long-source-id/)).toBeVisible();
  });
});
