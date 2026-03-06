import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressBar } from '@/components/ui/progress-bar';

const getFill = () => {
  const fill = document.querySelector('[data-slot="progress-bar-fill"]');

  if (!(fill instanceof HTMLDivElement)) {
    throw new Error('Progress bar fill was not rendered.');
  }

  return fill;
};

describe('ProgressBar', () => {
  it('renders the expected width percentage for the given value', () => {
    render(<ProgressBar max={40} value={25} />);

    expect(getFill()).toHaveStyle({ width: '62.5%' });
  });

  it('renders an empty bar at 0%', () => {
    render(<ProgressBar max={100} value={0} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(getFill()).toHaveStyle({ width: '0%' });
  });

  it('renders a full bar at 100%', () => {
    render(<ProgressBar max={100} value={100} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(getFill()).toHaveStyle({ width: '100%' });
  });

  it('handles overflow values by clamping to a full bar', () => {
    render(<ProgressBar max={100} value={130} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(getFill()).toHaveStyle({ width: '100%' });
  });
});
