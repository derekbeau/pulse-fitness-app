import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressRing } from '@/components/ui/progress-ring';

const getIndicatorMetrics = () => {
  const indicator = document.querySelector('[data-slot="progress-ring-indicator"]');

  if (!indicator) {
    throw new Error('Progress ring indicator was not rendered.');
  }

  return {
    stroke: indicator.getAttribute('stroke'),
    dasharray: Number(indicator.getAttribute('stroke-dasharray')),
    dashoffset: Number(indicator.getAttribute('stroke-dashoffset')),
  };
};

describe('ProgressRing', () => {
  it('renders a half arc for value=50', () => {
    render(<ProgressRing value={50} />);

    const metrics = getIndicatorMetrics();

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(metrics.dashoffset).toBeCloseTo(metrics.dasharray / 2, 5);
  });

  it('renders an empty arc for value=0', () => {
    render(<ProgressRing value={0} />);

    const metrics = getIndicatorMetrics();

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(metrics.dashoffset).toBeCloseTo(metrics.dasharray, 5);
  });

  it('renders a full arc for value=100', () => {
    render(<ProgressRing value={100} />);

    const metrics = getIndicatorMetrics();

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(metrics.dashoffset).toBeCloseTo(0, 5);
  });

  it('applies the provided color to the progress stroke', () => {
    render(<ProgressRing color="var(--color-accent-mint)" value={60} />);

    const metrics = getIndicatorMetrics();

    expect(metrics.stroke).toBe('var(--color-accent-mint)');
  });

  it('handles values above 100 by clamping to a full arc', () => {
    render(<ProgressRing value={150} />);

    const metrics = getIndicatorMetrics();

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(metrics.dashoffset).toBeCloseTo(0, 5);
  });
});
