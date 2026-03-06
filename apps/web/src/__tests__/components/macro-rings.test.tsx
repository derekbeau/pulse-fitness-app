import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MacroRings } from '@/features/nutrition';

const actual = {
  protein: 130,
  carbs: 220,
  fat: 60,
};

const targets = {
  protein: 120,
  carbs: 260,
  fat: 70,
};

function getMacroCard(name: string) {
  const card = screen.getByRole('heading', { name }).closest('div.rounded-2xl');

  if (!(card instanceof HTMLElement)) {
    throw new Error(`Macro card not found for ${name}.`);
  }

  return card;
}

describe('MacroRings', () => {
  it('displays actual macro values in eaten mode by default', () => {
    render(<MacroRings actual={actual} targets={targets} />);

    expect(within(getMacroCard('Protein')).getByText('130g eaten')).toBeInTheDocument();
    expect(within(getMacroCard('Carbs')).getByText('220g eaten')).toBeInTheDocument();
    expect(within(getMacroCard('Fat')).getByText('60g eaten')).toBeInTheDocument();
  });

  it('toggles to remaining mode and shows target minus actual values', () => {
    render(<MacroRings actual={actual} targets={targets} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remaining' }));

    expect(within(getMacroCard('Protein')).getByText('-10g remaining')).toBeInTheDocument();
    expect(within(getMacroCard('Carbs')).getByText('40g remaining')).toBeInTheDocument();
    expect(within(getMacroCard('Fat')).getByText('10g remaining')).toBeInTheDocument();
  });

  it('marks over-target macros with a warning color', () => {
    render(<MacroRings actual={actual} targets={targets} />);

    expect(within(getMacroCard('Protein')).getByText('130g eaten')).toHaveClass('text-red-600');
  });
});
