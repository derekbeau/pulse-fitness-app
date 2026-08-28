import { fireEvent, render, screen, within } from '@testing-library/react';
import { calculateProteinFloorProgress } from '@pulse/shared';
import { describe, expect, it } from 'vitest';

import { NutritionMacroRings } from '@/features/nutrition/components/nutrition-macro-rings';

type RenderOptions = {
  actualProtein?: number;
  floor?: number | null;
  dataState?: 'in_progress' | 'gradeable';
  actuals?: { calories: number; protein: number; carbs: number; fat: number };
  targets?: { calories: number; protein: number; carbs: number; fat: number };
};

const renderRings = (options: RenderOptions = {}) => {
  const actualProtein = options.actualProtein ?? 160;
  const floor = options.floor === undefined ? 180 : options.floor;
  return render(
    <NutritionMacroRings
      actuals={options.actuals ?? { calories: 1850, protein: actualProtein, carbs: 190, fat: 60 }}
      dataState={options.dataState ?? 'in_progress'}
      proteinFloor={calculateProteinFloorProgress({
        actualProteinGrams: actualProtein,
        proteinFloorGrams: floor,
        isFinal: options.dataState === 'gradeable',
        canEvaluate: true,
      })}
      selectedDate="2026-08-27"
      targets={options.targets ?? { calories: 2200, protein: floor ?? 0, carbs: 250, fat: 73 }}
    />,
  );
};

describe('NutritionMacroRings', () => {
  it('renders distinct protein-floor facts in eaten mode', () => {
    renderRings();

    expect(screen.getByRole('heading', { name: 'Macro progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eaten' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Remaining' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getAllByRole('progressbar')).toHaveLength(4);

    const proteinCard = screen.getByRole('heading', { name: 'Protein' }).closest('article');
    expect(proteinCard).not.toBeNull();
    const protein = within(proteinCard as HTMLElement);
    expect(protein.getByText('160g')).toBeInTheDocument();
    expect(protein.getByText('20g to minimum')).toBeInTheDocument();
    expect(protein.getByText('Minimum 180g')).toBeInTheDocument();
    expect(protein.getByText('Based on food logged so far')).toBeInTheDocument();
    expect(
      protein.getByRole('progressbar', {
        name: /2026-08-27: 160g protein logged; minimum 180g; 20g to minimum/i,
      }),
    ).toHaveAttribute('aria-valuenow', '89');
  });

  it('keeps the minimum nonnegative and logged total visible in remaining mode', () => {
    renderRings();
    fireEvent.click(screen.getByRole('button', { name: 'Remaining' }));

    const proteinCard = screen.getByRole('heading', { name: 'Protein' }).closest('article');
    const protein = within(proteinCard as HTMLElement);
    expect(protein.getAllByText('20g')).not.toHaveLength(0);
    expect(protein.getByText(/160g logged · Minimum 180g/)).toBeInTheDocument();
    expect(proteinCard).not.toHaveTextContent(/over|-/i);
    expect(screen.getByRole('button', { name: 'Remaining' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it.each([
    { name: 'exactly at', actualProtein: 180 },
    { name: 'one gram above', actualProtein: 181 },
    { name: 'materially above', actualProtein: 225 },
  ])('renders $name the floor as neutral success', ({ actualProtein }) => {
    renderRings({ actualProtein });

    const proteinCard = screen.getByRole('heading', { name: 'Protein' }).closest('article');
    const protein = within(proteinCard as HTMLElement);
    expect(protein.getByText('Minimum met')).toBeInTheDocument();
    expect(proteinCard).not.toHaveTextContent(/over target|too much|failure/i);
    expect(proteinCard?.querySelector('[data-slot="progress-ring-indicator"]')).toHaveAttribute(
      'stroke',
      'var(--protein-progress-stroke)',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remaining' }));
    expect(protein.getByText('Met')).toBeInTheDocument();
    expect(proteinCard).not.toHaveTextContent(/-\d|\+\d.*over/i);
  });

  it('preserves raw below-floor truth when the display distance is less than one gram', () => {
    renderRings({ actualProtein: 179.999, floor: 180 });
    const proteinCard = screen.getByRole('heading', { name: 'Protein' }).closest('article');
    expect(within(proteinCard as HTMLElement).getByText('<1g to minimum')).toBeInTheDocument();
    expect(proteinCard).not.toHaveTextContent('Minimum met');
  });

  it('shows an explicit unavailable state for a missing floor', () => {
    renderRings({ floor: null });
    const proteinCard = screen.getByRole('heading', { name: 'Protein' }).closest('article');
    expect(
      within(proteinCard as HTMLElement).getByText('Protein minimum unavailable'),
    ).toBeInTheDocument();
    expect(proteinCard).not.toHaveTextContent('Minimum met');
  });

  it('retains destructive over-target semantics for non-protein plan macros', () => {
    renderRings({
      actuals: { calories: 2250, protein: 190, carbs: 280, fat: 80 },
      actualProtein: 190,
      targets: { calories: 2200, protein: 180, carbs: 250, fat: 73 },
    });

    const proteinCard = screen.getByRole('heading', { name: 'Protein' }).closest('article');
    const carbsCard = screen.getByRole('heading', { name: 'Carbs' }).closest('article');
    expect(proteinCard).toHaveTextContent('Minimum met');
    expect(proteinCard?.querySelector('[data-slot="progress-ring-indicator"]')).not.toHaveAttribute(
      'stroke',
      'var(--color-destructive)',
    );
    expect(carbsCard).toHaveTextContent('+30g');
    expect(carbsCard).toHaveTextContent('over');
    expect(carbsCard?.querySelector('[data-slot="progress-ring-indicator"]')).toHaveAttribute(
      'stroke',
      'var(--color-destructive)',
    );
  });

  it.each([
    {
      name: 'calories over while protein remains below',
      actuals: { calories: 2_250, protein: 170, carbs: 220, fat: 60 },
      proteinText: '10g to minimum',
      destructiveMacro: 'Calories',
    },
    {
      name: 'calories below while protein is met',
      actuals: { calories: 1_900, protein: 180, carbs: 220, fat: 60 },
      proteinText: 'Minimum met',
      destructiveMacro: null,
    },
    {
      name: 'protein met while carbs and fat are over',
      actuals: { calories: 1_900, protein: 190, carbs: 270, fat: 80 },
      proteinText: 'Minimum met',
      destructiveMacro: 'Carbs',
    },
  ])(
    'keeps metric semantics independent when $name',
    ({ actuals, proteinText, destructiveMacro }) => {
      renderRings({
        actualProtein: actuals.protein,
        actuals,
        targets: { calories: 2_200, protein: 180, carbs: 250, fat: 73 },
      });

      const proteinCard = screen.getByRole('heading', { name: 'Protein' }).closest('article');
      expect(proteinCard).toHaveTextContent(proteinText);
      expect(proteinCard).not.toHaveTextContent(/over target|too much|failure/i);
      expect(
        proteinCard?.querySelector('[data-slot="progress-ring-indicator"]'),
      ).not.toHaveAttribute('stroke', 'var(--color-destructive)');
      if (destructiveMacro) {
        const planCard = screen.getByRole('heading', { name: destructiveMacro }).closest('article');
        expect(planCard).toHaveTextContent('over');
        expect(planCard?.querySelector('[data-slot="progress-ring-indicator"]')).toHaveAttribute(
          'stroke',
          'var(--color-destructive)',
        );
      }
    },
  );

  it('uses responsive layout and 44px toggle targets', () => {
    const { container } = renderRings();
    expect(container.querySelector('.grid.grid-cols-2.lg\\:grid-cols-4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eaten' })).toHaveClass('min-h-11', 'min-w-11');
    expect(screen.getByRole('button', { name: 'Remaining' })).toHaveClass('min-h-11', 'min-w-11');
  });
});
