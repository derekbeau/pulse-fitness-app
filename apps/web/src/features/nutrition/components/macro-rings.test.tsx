import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MacroRings } from '@/features/nutrition/components/macro-rings';

describe('MacroRings', () => {
  it('renders a responsive grid layout for ring cards', () => {
    const { container } = render(
      <MacroRings
        actual={{ protein: 140, carbs: 210, fat: 65 }}
        targets={{ protein: 180, carbs: 250, fat: 73 }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Macro rings' })).toBeInTheDocument();

    const ringsGrid = container.querySelector('.grid.grid-cols-2.md\\:grid-cols-3');
    expect(ringsGrid).toBeInTheDocument();
  });
});
