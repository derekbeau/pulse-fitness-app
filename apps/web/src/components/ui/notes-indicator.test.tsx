import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NotesIndicator } from '@/components/ui/notes-indicator';

function GuardedNotesIndicator({ notes }: { notes: string | null | undefined }) {
  return notes?.trim() ? <NotesIndicator notes={notes} /> : null;
}

describe('NotesIndicator', () => {
  it('renders a notes icon button', () => {
    render(<NotesIndicator notes="Felt strong on the last set." />);

    const button = screen.getByRole('button', { name: 'View notes' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('text-muted-foreground');
  });

  it('shows note content in a popover when clicked', () => {
    render(<NotesIndicator notes="**Ramp-up** sets felt great." />);

    expect(screen.queryByText('Ramp-up')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View notes' }));
    expect(screen.getByText('Ramp-up')).toBeInTheDocument();
    expect(screen.getByText('sets felt great.')).toBeInTheDocument();
  });

  it('does not render when guarded at call site for empty or null notes', () => {
    const { rerender } = render(<GuardedNotesIndicator notes="   " />);

    expect(screen.queryByRole('button', { name: 'View notes' })).not.toBeInTheDocument();

    rerender(<GuardedNotesIndicator notes={null} />);
    expect(screen.queryByRole('button', { name: 'View notes' })).not.toBeInTheDocument();
  });
});
