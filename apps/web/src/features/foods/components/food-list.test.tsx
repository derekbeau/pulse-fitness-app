import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FoodList } from '@/features/foods/components/food-list';

function getVisibleFoodNames() {
  return screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
}

function selectSortOption(optionLabel: string) {
  const trigger = screen.getByRole('combobox', { name: 'Sort foods' });

  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.click(screen.getByText(optionLabel));
}

describe('FoodList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders food cards with serving info, macros, verified badges, and last-used text', () => {
    render(<FoodList />);

    const wheyProteinCard = screen.getByText('Whey Protein').closest('[data-slot="card"]');
    const cheddarCard = screen.getByText('Cheddar Cheese').closest('[data-slot="card"]');

    expect(wheyProteinCard).not.toBeNull();
    expect(cheddarCard).not.toBeNull();

    if (!wheyProteinCard || !cheddarCard) {
      throw new Error('Expected food cards to render');
    }

    expect(screen.getAllByText('Verified').length).toBeGreaterThan(0);
    expect(wheyProteinCard).toHaveTextContent('Optimum Nutrition Gold Standard');
    expect(wheyProteinCard).toHaveTextContent('Serving: 1 scoop');
    expect(wheyProteinCard).toHaveTextContent('Last used: 1 day ago');
    expect(wheyProteinCard).toHaveTextContent('120 cal');
    expect(wheyProteinCard).toHaveTextContent('24g');
    expect(wheyProteinCard).toHaveTextContent('3g');
    expect(wheyProteinCard).toHaveTextContent('1g');
    expect(cheddarCard).toHaveTextContent('Last used: Never');
  });

  it('filters foods in real time by name or brand', () => {
    render(<FoodList />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search foods' }), {
      target: { value: 'fairlife' },
    });

    expect(screen.getByText('2% Milk')).toBeInTheDocument();
    expect(screen.queryByText('Chicken Breast')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 20 foods')).toBeInTheDocument();
  });

  it('sorts foods alphabetically by default', () => {
    render(<FoodList />);

    expect(getVisibleFoodNames().slice(0, 5)).toEqual([
      '2% Milk',
      'Almonds',
      'Apple',
      'Atlantic Salmon',
      'Avocado',
    ]);
  });

  it('sorts foods by recency with null last-used dates at the end', () => {
    render(<FoodList />);

    selectSortOption('Most Recent');

    const visibleNames = getVisibleFoodNames();

    expect(visibleNames[0]).toBe('Atlantic Salmon');
    expect(visibleNames[1]).toBe('Spinach');
    expect(visibleNames.at(-1)).toBe('Cheddar Cheese');
  });

  it('sorts foods by highest protein first', () => {
    render(<FoodList />);

    selectSortOption('Highest Protein');

    expect(getVisibleFoodNames().slice(0, 4)).toEqual([
      'Chicken Breast',
      'Atlantic Salmon',
      'Whey Protein',
      'Ground Beef 90/10',
    ]);
  });

  it('toggles sort direction for the current sort option', () => {
    render(<FoodList />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle sort direction' }));

    expect(getVisibleFoodNames().slice(0, 5)).toEqual([
      'Whole Wheat Bread',
      'White Rice',
      'Whey Protein',
      'Sweet Potato',
      'Spinach',
    ]);

    selectSortOption('Most Recent');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sort direction' }));

    expect(getVisibleFoodNames()[0]).toBe('Avocado');
    expect(getVisibleFoodNames().at(-1)).toBe('Cheddar Cheese');
  });

  it('saves an inline food-name edit on Enter and reapplies the active search filter', () => {
    render(<FoodList />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search foods' }), {
      target: { value: 'whey' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Whey Protein' }));

    const editInput = screen.getByRole('textbox', { name: 'Edit Whey Protein name' });

    fireEvent.change(editInput, { target: { value: 'Casein Protein' } });
    fireEvent.submit(editInput.closest('form') as HTMLFormElement);

    expect(screen.getByText('No foods found')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Whey Protein' })).not.toBeInTheDocument();
    expect(screen.getByText('Showing 0 of 20 foods')).toBeInTheDocument();
  });

  it('cancels inline editing on Escape and on outside focus changes', () => {
    render(<FoodList />);

    fireEvent.click(screen.getByRole('button', { name: 'Greek Yogurt' }));

    const escapeInput = screen.getByRole('textbox', { name: 'Edit Greek Yogurt name' });
    fireEvent.change(escapeInput, { target: { value: 'Skyr Yogurt' } });
    fireEvent.keyDown(escapeInput, { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'Greek Yogurt' })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Skyr Yogurt')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apple' }));

    const blurInput = screen.getByRole('textbox', { name: 'Edit Apple name' });
    fireEvent.change(blurInput, { target: { value: 'Honeycrisp Apple' } });
    fireEvent.blur(blurInput);

    expect(screen.getByRole('button', { name: 'Apple' })).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Honeycrisp Apple')).not.toBeInTheDocument();
  });

  it('confirms deletion with the food name and removes the food from local state', () => {
    render(<FoodList />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search foods' }), {
      target: { value: 'spinach' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Spinach' }));

    expect(
      screen.getByText('Are you sure you want to remove Spinach?'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.queryByRole('heading', { level: 3, name: 'Spinach' })).not.toBeInTheDocument();
    expect(screen.getByText('No foods found')).toBeInTheDocument();
    expect(screen.getByText('Showing 0 of 19 foods')).toBeInTheDocument();
  });

  it('shows an empty state when the search yields no matches', () => {
    render(<FoodList />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search foods' }), {
      target: { value: 'dragonfruit jerky' },
    });

    expect(screen.getByText('No foods found')).toBeInTheDocument();
    expect(screen.getByText('Showing 0 of 20 foods')).toBeInTheDocument();
  });
});
