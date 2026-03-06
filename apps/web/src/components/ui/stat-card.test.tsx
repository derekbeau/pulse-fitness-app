import { render, screen } from '@testing-library/react';
import { Activity } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { StatCard } from '@/components/ui/stat-card';

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Weekly Workouts" value={5} />);

    expect(screen.getByText('Weekly Workouts')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.queryByLabelText(/trend/i)).not.toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(
      <StatCard icon={<Activity data-testid="stat-icon" />} label="Active Minutes" value="320" />,
    );

    expect(screen.getByTestId('stat-icon')).toBeInTheDocument();
  });

  it('renders up trend with positive symbol and green token class', () => {
    render(<StatCard label="Recovery Score" trend={{ direction: 'up', value: 12 }} value="81%" />);

    const trend = screen.getByLabelText('trend up');
    expect(trend).toHaveTextContent('+12%');
    expect(trend).toHaveClass('text-[var(--color-accent-mint)]');
  });

  it('renders down trend with negative symbol and red token class', () => {
    render(<StatCard label="Sleep Debt" trend={{ direction: 'down', value: 8 }} value="1.4h" />);

    const trend = screen.getByLabelText('trend down');
    expect(trend).toHaveTextContent('-8%');
    expect(trend).toHaveClass('text-[var(--destructive)]');
  });

  it('renders neutral trend without +/- symbol and with muted token class', () => {
    render(<StatCard label="Calories" trend={{ direction: 'neutral', value: 0 }} value={2260} />);

    const trend = screen.getByLabelText('trend neutral');
    expect(trend).toHaveTextContent('0%');
    expect(trend).not.toHaveTextContent('+');
    expect(trend).not.toHaveTextContent('-');
    expect(trend).toHaveClass('text-[var(--color-muted)]');
  });

  it('accepts className on the card root', () => {
    render(<StatCard className="custom-card" label="Pace" value="4:58/km" />);

    const card = document.querySelector('[data-slot="stat-card"]');
    expect(card).toHaveClass('custom-card');
  });

  it('keeps semantic trend colors when accentText is enabled', () => {
    render(
      <StatCard
        accentText
        label="Body Weight"
        trend={{ direction: 'up', value: 1.2 }}
        value="178.4 lbs"
      />,
    );

    expect(screen.getByText('Body Weight')).toHaveClass('text-on-accent');
    expect(screen.getByText('178.4 lbs')).toHaveClass('text-on-accent');
    expect(screen.getByLabelText('trend up')).toHaveClass('text-[var(--color-accent-mint)]');
  });
});
