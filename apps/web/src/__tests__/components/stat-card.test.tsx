import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatCard } from '@/components/ui/stat-card';

describe('StatCard', () => {
  it('renders the value and label', () => {
    render(<StatCard label="Weekly Workouts" value={5} />);

    expect(screen.getByText('Weekly Workouts')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders trend indicators when trend is provided', () => {
    const { rerender } = render(
      <StatCard label="Recovery Score" trend={{ direction: 'up', value: 12 }} value="81%" />,
    );

    expect(screen.getByLabelText('trend up')).toHaveClass('text-[var(--color-accent-mint)]');

    rerender(<StatCard label="Sleep Debt" trend={{ direction: 'down', value: 8 }} value="1.4h" />);

    expect(screen.getByLabelText('trend down')).toHaveClass('text-[var(--destructive)]');
  });

  it('does not render trend content when trend is not provided', () => {
    render(<StatCard label="Calories" value={2260} />);

    expect(screen.queryByLabelText(/trend/i)).not.toBeInTheDocument();
  });
});
