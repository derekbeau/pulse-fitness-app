import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressRing } from '@/components/ui/progress-ring';

describe('ProgressRing', () => {
  it('renders percentage text and default token color', () => {
    render(<ProgressRing value={42} />);

    expect(screen.getByText('42%')).toBeInTheDocument();

    const indicator = document.querySelector('[data-slot="progress-ring-indicator"]');
    expect(indicator).toHaveAttribute('stroke', 'var(--color-primary)');
  });

  it('renders the custom label instead of percentage text', () => {
    render(<ProgressRing label="Recovery" value={72} />);

    expect(screen.getByText('Recovery')).toBeInTheDocument();
    expect(screen.queryByText('72%')).not.toBeInTheDocument();
  });

  it('clamps values and calculates stroke offsets', () => {
    render(<ProgressRing value={150} />);

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '100');

    const indicator = document.querySelector('[data-slot="progress-ring-indicator"]');
    const maxOffset = Number(indicator?.getAttribute('stroke-dashoffset'));
    expect(maxOffset).toBeCloseTo(0, 5);
  });

  it('accepts className and clamps negative values', () => {
    render(<ProgressRing className="custom-ring" value={-25} />);

    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveClass('custom-ring');
    expect(progress).toHaveAttribute('aria-valuenow', '0');
  });

  it('scales label max-width proportionally to ring size', () => {
    render(<ProgressRing value={40} size={116} strokeWidth={10} label="1850 cal" />);

    const label = screen.getByText('1850 cal') as HTMLElement;
    expect(label.style.maxWidth).toMatch(/^74\.13/);
  });
});
