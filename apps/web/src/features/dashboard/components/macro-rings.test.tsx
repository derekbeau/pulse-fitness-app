import type { DashboardSnapshot } from '@pulse/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
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

  it('formats calories without unit suffix', () => {
    expect(getMacroRingState({ actual: 368.2, target: 2200 }, 'eaten', '#F59E0B', 'kcal')).toEqual({
      color: '#F59E0B',
      progress: expect.closeTo(16.74, 1),
      valueLabel: '368',
    });
  });

  it('rounds floating-point grams in eaten mode', () => {
    expect(getMacroRingState({ actual: 150.7, target: 200 }, 'eaten', '#22C55E', 'g')).toEqual({
      color: '#22C55E',
      progress: expect.closeTo(75.35, 1),
      valueLabel: '151g',
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
  it('renders four macro rings with labels and values', () => {
    render(
      <MemoryRouter>
        <MacroRings snapshot={snapshotFixture} />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('progressbar')).toHaveLength(4);

    expect(screen.getByText('Calories')).toBeInTheDocument();
    expect(screen.getByText('Protein')).toBeInTheDocument();
    expect(screen.getByText('Carbs')).toBeInTheDocument();
    expect(screen.getByText('Fat')).toBeInTheDocument();

    expect(screen.getByText('1850')).toBeInTheDocument();
    expect(screen.getByText('145g')).toBeInTheDocument();
    expect(screen.getByText('200g')).toBeInTheDocument();
    expect(screen.getByText('65g')).toBeInTheDocument();
  });

  it('shows zeroed values when snapshot data is unavailable', () => {
    render(
      <MemoryRouter>
        <MacroRings />
      </MemoryRouter>,
    );

    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getAllByText('0g')).toHaveLength(3);
    expect(screen.getAllByText('No target')).toHaveLength(4);
  });

  it('toggles to remaining mode and shows inverse progress labels', () => {
    render(
      <MemoryRouter>
        <MacroRings snapshot={snapshotFixture} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remaining' }));

    expect(screen.getByText('350')).toBeInTheDocument();
    expect(screen.getByText('35g')).toBeInTheDocument();
    expect(screen.getByText('50g')).toBeInTheDocument();
    expect(screen.getByText('8g')).toBeInTheDocument();

    const caloriesProgress = within(getMacroItem('Calories')).getByRole('progressbar');
    expect(caloriesProgress).toHaveAttribute('aria-valuenow', '16');

    expect(screen.getByRole('button', { name: 'Eaten' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Remaining' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('turns over-target macros red in remaining mode', () => {
    render(
      <MemoryRouter>
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
        />
      </MemoryRouter>,
    );

    const proteinItem = getMacroItem('Protein');
    const eatenIndicator = proteinItem.querySelector('[data-slot="progress-ring-indicator"]');
    expect(eatenIndicator).toHaveAttribute('stroke', '#DC2626');

    fireEvent.click(screen.getByRole('button', { name: 'Remaining' }));

    expect(within(proteinItem).getByText('+20g over')).toBeInTheDocument();
  });
});
