import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card } from '@/components/ui/card';

describe('Card', () => {
  it('uses full-width, shrink-safe, overflow-hidden layout defaults', () => {
    render(<Card>Card body</Card>);

    const card = screen.getByText('Card body').closest('[data-slot="card"]');
    expect(card).toHaveClass('w-full', 'min-w-0', 'overflow-hidden');
  });
});
