import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HelpIcon } from '@/components/ui/help-icon';

describe('HelpIcon', () => {
  it('renders a help icon button with the intended icon button sizing', () => {
    render(
      <HelpIcon title="Page help">
        <p>Helpful details.</p>
      </HelpIcon>,
    );

    const button = screen.getByRole('button', { name: 'Help' });

    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveClass('h-11', 'w-11', 'text-muted-foreground');
  });

  it('opens and closes the help modal when interacting with the button', () => {
    render(
      <HelpIcon title="Workout tips">
        <p>Use gradual overload and good form.</p>
      </HelpIcon>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Help' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Workout tips' })).toBeInTheDocument();
    expect(screen.getByText('Use gradual overload and good form.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
