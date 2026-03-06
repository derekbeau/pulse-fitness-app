import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MealCard } from '@/features/nutrition/components/meal-card';
import { mockDailyMeals } from '@/lib/mock-data/nutrition';

const breakfastMeal = mockDailyMeals['2026-03-05'][0];

describe('MealCard', () => {
  it('renders the meal summary collapsed by default', () => {
    render(<MealCard meal={breakfastMeal} />);

    const trigger = screen.getByRole('button', { name: /breakfast/i });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('7:20 AM')).toBeInTheDocument();
    expect(screen.getByText('535 cal')).toBeInTheDocument();
    expect(screen.getByText('29g protein')).toBeInTheDocument();
    expect(screen.queryByText('Large Eggs')).not.toBeInTheDocument();
  });

  it('expands to show individual food items and per-item macros', () => {
    render(<MealCard meal={breakfastMeal} />);

    const trigger = screen.getByRole('button', { name: /breakfast/i });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Large Eggs')).toBeInTheDocument();
    expect(screen.getByText('3 eggs')).toBeInTheDocument();
    expect(screen.getByText('210 cal')).toBeInTheDocument();
    expect(screen.getByText('18g')).toBeInTheDocument();
    expect(screen.getByText('44g')).toBeInTheDocument();
    expect(screen.getByText('15g')).toBeInTheDocument();
  });

  it('collapses the item list when the header is clicked again', () => {
    render(<MealCard meal={breakfastMeal} />);

    const trigger = screen.getByRole('button', { name: /breakfast/i });

    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Large Eggs')).not.toBeInTheDocument();
  });
});
