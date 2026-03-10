import type { DashboardSnapshot } from '@pulse/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getMacroRingState, MacroRings } from './macro-rings';

const snapshotFixture: DashboardSnapshot = {
  date: '2026-03-06',
  weight: null,
  macros: {
    actual: {
      calories: 1850,
      protein: 145,
      carbs: 200,
      fat: 65,
    },
    target: {
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 73,
    },
  },
  workout: null,
  habits: {
    total: 3,
    completed: 2,
    percentage: 66.7,
  },
};

const getMacroItem = (label: string): HTMLElement => {
  const macroLabel = screen.getByText(label);
  const item = macroLabel.closest('[data-slot="macro-ring-item"]');

  if (!item) {
    throw new Error(`Macro ring item "${label}" was not found.`);
  }

  return item as HTMLElement;
};

describe('getMacroRingState', () => {
  it('returns eaten mode progress and actual label', () => {
    expect(getMacroRingState({ actual: 150, target: 200 }, 'eaten', '#22C55E', 'g')).toEqual({
      color: '#22C55E',
      progress: 75,
      valueLabel: '150g',
    });
  });

  it('returns remaining mode over-target label and red color', () => {
    expect(getMacroRingState({ actual: 200, target: 180 }, 'remaining', '#22C55E', 'g')).toEqual({
      color: '#DC2626',
      progress: -11.111111111111114,
      valueLabel: '+20g over',
    });
  });
});

describe('MacroRings', () => {
  it('renders four macro rings with distinct colors and eaten values', () => {
    const { container } = render(<MacroRings snapshot={snapshotFixture} />);

    const grid = container.querySelector('div.grid.grid-cols-2.gap-4.lg\\:grid-cols-4');
    expect(grid).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(4);

    expect(screen.getByText('Calories')).toBeInTheDocument();
    expect(screen.getByText('Protein')).toBeInTheDocument();
    expect(screen.getByText('Carbs')).toBeInTheDocument();
    expect(screen.getByText('Fat')).toBeInTheDocument();

    expect(screen.getByText('1850kcal')).toBeInTheDocument();
    expect(screen.getByText('145g')).toBeInTheDocument();
    expect(screen.getByText('200g')).toBeInTheDocument();
    expect(screen.getByText('65g')).toBeInTheDocument();

    const caloriesRingIndicator = getMacroItem('Calories').querySelector(
      '[data-slot="progress-ring-indicator"]',
    );
    const proteinRingIndicator = getMacroItem('Protein').querySelector(
      '[data-slot="progress-ring-indicator"]',
    );
    const carbsRingIndicator = getMacroItem('Carbs').querySelector('[data-slot="progress-ring-indicator"]');
    const fatRingIndicator = getMacroItem('Fat').querySelector('[data-slot="progress-ring-indicator"]');

    expect(caloriesRingIndicator).toHaveAttribute('stroke', '#F59E0B');
    expect(proteinRingIndicator).toHaveAttribute('stroke', '#22C55E');
    expect(carbsRingIndicator).toHaveAttribute('stroke', '#3B82F6');
    expect(fatRingIndicator).toHaveAttribute('stroke', '#A855F7');
  });

  it('shows zeroed values when snapshot data is unavailable', () => {
    render(<MacroRings />);

    expect(screen.getByText('0kcal')).toBeInTheDocument();
    expect(screen.getAllByText('0g')).toHaveLength(3);
  });

  it('toggles to remaining mode and shows inverse progress labels', () => {
    render(<MacroRings snapshot={snapshotFixture} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remaining' }));

    expect(screen.getByText('350kcal')).toBeInTheDocument();
    expect(screen.getByText('35g')).toBeInTheDocument();
    expect(screen.getByText('50g')).toBeInTheDocument();
    expect(screen.getByText('8g')).toBeInTheDocument();

    const caloriesProgress = within(getMacroItem('Calories')).getByRole('progressbar');
    expect(caloriesProgress).toHaveAttribute('aria-valuenow', '16');

    expect(screen.getByRole('button', { name: 'Eaten' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Remaining' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('turns over-target macros red and shows overage text in remaining mode', () => {
    render(
      <MacroRings
        snapshot={{
          ...snapshotFixture,
          macros: {
            ...snapshotFixture.macros,
            actual: {
              ...snapshotFixture.macros.actual,
              protein: 200,
            },
          },
        }}
      />,
    );

    const proteinItem = getMacroItem('Protein');
    const eatenIndicator = proteinItem.querySelector('[data-slot="progress-ring-indicator"]');
    expect(eatenIndicator).toHaveAttribute('stroke', '#DC2626');

    fireEvent.click(screen.getByRole('button', { name: 'Remaining' }));

    expect(within(proteinItem).getByText('+20g over')).toBeInTheDocument();
    expect(within(proteinItem).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

    const remainingIndicator = proteinItem.querySelector('[data-slot="progress-ring-indicator"]');
    expect(remainingIndicator).toHaveAttribute('stroke', '#DC2626');
  });
});
