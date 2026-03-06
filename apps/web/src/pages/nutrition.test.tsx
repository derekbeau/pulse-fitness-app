import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NutritionPage } from '@/pages/nutrition';

describe('NutritionPage', () => {
  it('renders the latest day summary with actual and target macros', () => {
    render(<NutritionPage />);
    const dailyTotals = screen.getByLabelText('Daily macro totals');

    expect(screen.getByRole('heading', { name: 'Nutrition' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Daily totals' })).toBeInTheDocument();
    expect(screen.getByText('Thursday, March 5')).toBeInTheDocument();

    expect(within(dailyTotals).getByText('2131 cal')).toHaveClass('text-emerald-950');
    expect(within(dailyTotals).getByText(/\/ 2200 cal/)).toBeInTheDocument();
    expect(within(dailyTotals).getByText('192g')).toHaveClass('text-red-900');
    expect(within(dailyTotals).getByText(/\/ 180g/)).toBeInTheDocument();
    expect(within(dailyTotals).getByText('185g')).toHaveClass('text-emerald-950');
    expect(within(dailyTotals).getByText(/\/ 250g/)).toBeInTheDocument();
    expect(within(dailyTotals).getByText('70g')).toHaveClass('text-emerald-950');
    expect(within(dailyTotals).getByText(/\/ 73g/)).toBeInTheDocument();
  });

  it('renders macro progress rings between the daily totals summary and meal cards', () => {
    render(<NutritionPage />);

    const dailyTotals = screen.getByLabelText('Daily macro totals');
    const macroProgress = screen.getByRole('heading', { name: 'Macro progress' }).closest('section');
    const breakfast = screen.getByRole('button', { name: /breakfast/i });

    expect(macroProgress).not.toBeNull();

    if (!macroProgress) {
      throw new Error('Expected macro progress section to exist');
    }

    expect(within(macroProgress).getAllByRole('progressbar')).toHaveLength(4);
    expect(macroProgress.compareDocumentPosition(breakfast) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dailyTotals.compareDocumentPosition(macroProgress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders meal cards in breakfast, lunch, dinner, snacks order', () => {
    render(<NutritionPage />);

    const breakfast = screen.getByRole('button', { name: /breakfast/i });
    const lunch = screen.getByRole('button', { name: /lunch/i });
    const dinner = screen.getByRole('button', { name: /dinner/i });
    const snacks = screen.getByRole('button', { name: /snacks/i });

    expect(breakfast.compareDocumentPosition(lunch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lunch.compareDocumentPosition(dinner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dinner.compareDocumentPosition(snacks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
