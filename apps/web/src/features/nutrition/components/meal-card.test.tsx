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
  it('renders summary text while collapsed and expands on click', () => {
    render(<MealCard meal={breakfastMeal} />);

    expect(screen.getByText('Large Eggs, Whole Wheat Bread, Whey Protein')).toBeInTheDocument();
    expect(screen.queryByText(/535cal · 29P · 72C · 17F/)).not.toBeInTheDocument();
    expect(screen.queryByText('3 foods', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText('7:20 AM')).toBeInTheDocument();
    expect(screen.queryByText('Large Eggs', { selector: 'li p' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Breakfast/i }));

    expect(screen.getByText('Large Eggs')).toBeInTheDocument();
    expect(screen.getByText('3 eggs')).toBeInTheDocument();
    expect(screen.getByText('210cal')).toBeInTheDocument();
    expect(screen.getByText('5.5 oz')).toBeInTheDocument();
  });

  it('falls back to concatenated item names when summary is empty', () => {
    render(<MealCard meal={{ ...breakfastMeal, summary: null }} />);

    expect(screen.getByText('Large Eggs, Whole Wheat Bread, Whey Protein')).toBeInTheDocument();
  });

  it('shows default collapsed copy when summary and items are both empty', () => {
    render(<MealCard meal={{ ...breakfastMeal, summary: '', items: [] }} />);

    expect(screen.getByText('No meal details available')).toBeInTheDocument();
  });

  it('uses compact row styling with truncated item names after expanding', () => {
    render(<MealCard meal={breakfastMeal} />);

    fireEvent.click(screen.getByRole('button', { name: /Breakfast/i }));

    expect(screen.getByText('Large Eggs')).toHaveClass('truncate');
  });

  it('shows fallback time copy when meal time is not set', () => {
    render(<MealCard meal={{ ...breakfastMeal, time: null }} />);

    expect(screen.getByText('Time not set')).toBeInTheDocument();
  });

  it('calls onDelete with the meal id when delete is clicked', () => {
    const onDelete = vi.fn();

    render(<MealCard meal={breakfastMeal} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Breakfast' }));

    expect(onDelete).toHaveBeenCalledWith('meal-breakfast');
  });
});
