import { fireEvent, render, screen } from '@testing-library/react';
import type { NutritionWeekSummary } from '@pulse/shared';
import { describe, expect, it, vi } from 'vitest';

import { NutritionWeekStrip } from '@/features/nutrition/components/nutrition-week-strip';

const weekSummary: NutritionWeekSummary = [
  {
    date: '2026-03-02',
    calories: 0,
    caloriesTarget: 2200,
    protein: 0,
    proteinTarget: 180,
    mealCount: 0,
    completeness: 0,
  },
  {
    date: '2026-03-03',
    calories: 1800,
    caloriesTarget: 2200,
    protein: 140,
    proteinTarget: 180,
    mealCount: 2,
    completeness: 0.79,
  },
  {
    date: '2026-03-04',
    calories: 2200,
    caloriesTarget: 2200,
    protein: 180,
    proteinTarget: 180,
    mealCount: 3,
    completeness: 1,
  },
  {
    date: '2026-03-05',
    calories: 2100,
    caloriesTarget: 2200,
    protein: 172,
    proteinTarget: 180,
    mealCount: 3,
    completeness: 0.95,
  },
  {
    date: '2026-03-06',
    calories: 2000,
    caloriesTarget: 2200,
    protein: 160,
    proteinTarget: 180,
    mealCount: 3,
    completeness: 0.9,
  },
  {
    date: '2026-03-07',
    calories: 1700,
    caloriesTarget: 2200,
    protein: 135,
    proteinTarget: 180,
    mealCount: 2,
    completeness: 0.76,
  },
  {
    date: '2026-03-08',
    calories: 1500,
    caloriesTarget: 2200,
    protein: 120,
    proteinTarget: 180,
    mealCount: 2,
    completeness: 0.67,
  },
];

describe('NutritionWeekStrip', () => {
  it('renders seven day cells', () => {
    render(
      <NutritionWeekStrip
        days={weekSummary}
        selectedDate={new Date('2026-03-06T09:00:00')}
        onSelectDate={() => {}}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(7);
  });

  it('marks the selected day cell as distinct', () => {
    render(
      <NutritionWeekStrip
        days={weekSummary}
        selectedDate={new Date('2026-03-06T09:00:00')}
        onSelectDate={() => {}}
      />,
    );

    const selectedButton = screen.getByRole('button', { name: 'Select 2026-03-06' });
    const unselectedButton = screen.getByRole('button', { name: 'Select 2026-03-05' });

    expect(selectedButton).toHaveAttribute('data-selected', 'true');
    expect(unselectedButton).toHaveAttribute('data-selected', 'false');
  });

  it('fires date select handler for the clicked day', () => {
    const onSelectDate = vi.fn();
    render(
      <NutritionWeekStrip
        days={weekSummary}
        selectedDate={new Date('2026-03-06T09:00:00')}
        onSelectDate={onSelectDate}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select 2026-03-03' }));

    expect(onSelectDate).toHaveBeenCalledWith(new Date('2026-03-03T00:00:00'));
  });

  it('renders indicator states for empty, partial, and complete days', () => {
    render(
      <NutritionWeekStrip
        days={weekSummary}
        selectedDate={new Date('2026-03-06T09:00:00')}
        onSelectDate={() => {}}
      />,
    );

    expect(screen.getByLabelText('Completeness empty for 2026-03-02')).toHaveAttribute(
      'data-state',
      'empty',
    );
    expect(screen.getByLabelText('Completeness partial for 2026-03-03')).toHaveAttribute(
      'data-state',
      'partial',
    );
    expect(screen.getByLabelText('Completeness complete for 2026-03-04')).toHaveAttribute(
      'data-state',
      'complete',
    );
  });
});
