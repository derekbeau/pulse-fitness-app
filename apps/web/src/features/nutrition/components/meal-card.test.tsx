import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MealCard } from '@/features/nutrition/components/meal-card';

const breakfastMeal = {
  id: 'meal-breakfast',
  name: 'Breakfast',
  time: '07:20',
  items: [
    {
      id: 'item-eggs',
      name: 'Large Eggs',
      amount: 3,
      unit: 'eggs',
      calories: 210,
      protein: 18,
      carbs: 1,
      fat: 15,
    },
    {
      id: 'item-bread',
      name: 'Whole Wheat Bread',
      amount: 2,
      unit: 'slices',
      calories: 220,
      protein: 10,
      carbs: 44,
      fat: 2,
    },
    {
      id: 'item-shake',
      name: 'Whey Protein',
      amount: 1,
      unit: 'scoop',
      calories: 105,
      protein: 1,
      carbs: 27,
      fat: 0,
    },
  ],
};

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

  it('calls onDelete with the meal id when delete is clicked', () => {
    const onDelete = vi.fn();

    render(<MealCard meal={breakfastMeal} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Breakfast' }));

    expect(onDelete).toHaveBeenCalledWith('meal-breakfast');
  });
});
