import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NutritionMacroRings } from '@/features/nutrition/components/nutrition-macro-rings';

describe('NutritionMacroRings', () => {
  it('renders four macro progress rings in eaten mode by default', () => {
    render(
      <NutritionMacroRings
        actuals={{ calories: 1850, protein: 160, carbs: 190, fat: 60 }}
        targets={{ calories: 2200, protein: 180, carbs: 250, fat: 73 }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Macro progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eaten' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Remaining' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByRole('progressbar')).toHaveLength(4);
    expect(screen.getByText('1850 cal')).toBeInTheDocument();
    expect(screen.getByText('160g')).toBeInTheDocument();
    expect(screen.getByText('190g')).toBeInTheDocument();
    expect(screen.getByText('60g')).toBeInTheDocument();
  });

  it('switches to remaining mode and shows values left toward each target', () => {
    render(
      <NutritionMacroRings
        actuals={{ calories: 1850, protein: 160, carbs: 190, fat: 60 }}
        targets={{ calories: 2200, protein: 180, carbs: 250, fat: 73 }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remaining' }));

    expect(screen.getByRole('button', { name: 'Remaining' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Eaten' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('350 cal')).toBeInTheDocument();
    expect(screen.getByText('20g')).toBeInTheDocument();
    expect(screen.getByText('60g')).toBeInTheDocument();
    expect(screen.getByText('13g')).toBeInTheDocument();

    const caloriesRing = screen.getByRole('progressbar', { name: 'Calories remaining progress' });
    expect(caloriesRing).toHaveAttribute('aria-valuenow', '16');
  });

  it('shows a full red ring and overage copy when a macro exceeds the target', () => {
    render(
      <NutritionMacroRings
        actuals={{ calories: 2250, protein: 192, carbs: 185, fat: 70 }}
        targets={{ calories: 2200, protein: 180, carbs: 250, fat: 73 }}
      />,
    );

    const proteinCard = screen.getByRole('heading', { name: 'Protein' }).closest('article');
    expect(proteinCard).not.toBeNull();

    if (!proteinCard) {
      throw new Error('Expected protein card to exist');
    }

    expect(within(proteinCard).getByText('+12g')).toBeInTheDocument();
    expect(within(proteinCard).getByText('over')).toBeInTheDocument();

    const proteinRing = within(proteinCard).getByRole('progressbar', { name: 'Protein eaten progress' });
    expect(proteinRing).toHaveAttribute('aria-valuenow', '100');

    const indicator = proteinCard.querySelector('[data-slot="progress-ring-indicator"]');
    expect(indicator).toHaveAttribute('stroke', '#DC2626');
  });
});
