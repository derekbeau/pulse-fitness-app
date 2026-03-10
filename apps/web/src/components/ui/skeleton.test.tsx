import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Skeleton } from '@/components/ui/skeleton';

describe('Skeleton', () => {
  it('renders the base shimmer styles and merges custom classes', () => {
    render(<Skeleton className="h-8 w-24 rounded-xl" data-testid="skeleton" />);

    const skeleton = screen.getByTestId('skeleton');

    expect(skeleton).toHaveClass('animate-pulse');
    expect(skeleton).toHaveClass('bg-muted');
    expect(skeleton).toHaveClass('h-8');
    expect(skeleton).toHaveClass('w-24');
    expect(skeleton).toHaveClass('rounded-xl');
  });
});
