import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SessionContext } from './session-context';

vi.mock('../api/session-context', () => ({
  useSessionContext: () => ({ isPending: false, isError: false, data: null }),
}));

describe('SessionContext', () => {
  it('shows no preview claim and waits for a real session id', () => {
    render(<SessionContext sessionId={null} />);
    fireEvent.click(screen.getByRole('button', { name: /What matters today/ }));
    expect(screen.getByText('Start a workout to load its context.')).toBeInTheDocument();
    expect(screen.queryByText('Recovery Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Training Phase')).not.toBeInTheDocument();
  });
});
