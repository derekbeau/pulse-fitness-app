import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Checkbox } from '@/components/ui/checkbox';

describe('Checkbox', () => {
  it('keeps a small visual box while adding an expanded tap target hit area', () => {
    render(<Checkbox aria-label="Track complete" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Track complete' });
    expect(checkbox).toHaveClass('size-5', 'before:-inset-3');
  });
});
