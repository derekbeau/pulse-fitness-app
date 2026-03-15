import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MealCard } from '@/features/nutrition/components/meal-card';

const breakfastMeal = {
  id: 'meal-breakfast',
  name: 'Breakfast',
  summary: 'Large Eggs, Whole Wheat Bread, Whey Protein',
  time: '07:20',
  items: [
    {
      id: 'item-eggs',
      name: 'Large Eggs',
      amount: 3,
      unit: 'eggs',
      displayQuantity: null,
      displayUnit: null,
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
      displayQuantity: 5.5,
      displayUnit: 'oz',
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
      displayQuantity: 2,
      displayUnit: 'scoops',
      calories: 105,
      protein: 1,
      carbs: 27,
      fat: 0,
    },
  ],
};

describe('MealCard', () => {
  it('renders a compact meal header with visible food rows by default', () => {
    render(<MealCard meal={breakfastMeal} />);

    expect(screen.queryByText('Large Eggs, Whole Wheat Bread, Whey Protein')).not.toBeInTheDocument();
    expect(screen.getByText('535cal · 29P · 72C · 17F')).toBeInTheDocument();
    expect(screen.getByText('7:20 AM · 3 foods')).toBeInTheDocument();
    expect(screen.getByText('Large Eggs')).toBeInTheDocument();
    expect(screen.getByText('3 eggs')).toBeInTheDocument();
    expect(screen.getByText('210cal · 18P · 1C · 15F')).toBeInTheDocument();
    expect(screen.getByText('5.5 oz')).toBeInTheDocument();
    expect(screen.getByText('220cal · 10P · 44C · 2F')).toBeInTheDocument();
  });

  it('uses compact row styling while keeping meal headers and rows at a 44px touch target', () => {
    render(<MealCard meal={breakfastMeal} />);

    const mealCard = screen.getByRole('heading', { name: 'Breakfast' }).closest('[data-slot="card"]');
    const mealHeader = mealCard?.firstElementChild;
    const firstRow = screen.getByText('Large Eggs').closest('li');

    expect(mealHeader).toHaveClass('min-h-11');
    expect(firstRow).toHaveClass('min-h-11');
    expect(screen.getByText('Large Eggs')).toHaveClass('truncate');
  });

  it('shows fallback time copy when meal time is not set', () => {
    render(<MealCard meal={{ ...breakfastMeal, time: null }} />);

    expect(screen.getByText('Time not set · 3 foods')).toBeInTheDocument();
  });

  it('calls onDelete with the meal id when delete is clicked', () => {
    const onDelete = vi.fn();

    render(<MealCard meal={breakfastMeal} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Breakfast' }));

    expect(onDelete).toHaveBeenCalledWith('meal-breakfast');
  });
});
