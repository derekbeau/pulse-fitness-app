import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressBar } from '@/components/ui/progress-bar';

describe('ProgressBar', () => {
  it('renders label and value text when showValue is true', () => {
    render(<ProgressBar label="Hydration" max={8} showValue value={6} />);

    expect(screen.getByText('Hydration')).toBeInTheDocument();
    expect(screen.getByText('6 / 8')).toBeInTheDocument();
  });

  it('clamps percentage and fill width when value is greater than max', () => {
    render(<ProgressBar max={200} value={240} />);

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuemax', '200');
    expect(progress).toHaveAttribute('aria-valuenow', '200');

    const fill = document.querySelector('[data-slot="progress-bar-fill"]');
    expect(fill).toHaveStyle({ width: '100%' });
    expect(fill).toHaveStyle({ backgroundColor: 'var(--color-primary)' });
  });

  it('handles invalid max values by rendering an empty progress bar', () => {
    render(<ProgressBar max={0} showValue value={40} />);

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuemax', '0');
    expect(progress).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0 / 0')).toBeInTheDocument();

    const fill = document.querySelector('[data-slot="progress-bar-fill"]');
    expect(fill).toHaveStyle({ width: '0%' });
  });

  it('accepts className and custom fill color', () => {
    render(
      <ProgressBar
        className="custom-progress"
        color="var(--color-accent-mint)"
        max={100}
        value={25}
      />,
    );

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveClass('custom-progress');

    const fill = document.querySelector('[data-slot="progress-bar-fill"]');
    expect(fill).toHaveStyle({ backgroundColor: 'var(--color-accent-mint)' });
  });
});
