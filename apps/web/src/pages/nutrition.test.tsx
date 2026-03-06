import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NutritionPage } from '@/pages/nutrition';

describe('NutritionPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to today with empty nutrition data and blocked future navigation', () => {
    render(<NutritionPage />);
    const dailyTotals = screen.getByLabelText('Daily macro totals');

    expect(screen.getByRole('heading', { name: 'Nutrition' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Daily totals' })).toBeInTheDocument();
    expect(screen.getByText('Friday, March 6')).toBeInTheDocument();
    expect(screen.getByText('Friday, Mar 6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to next day' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
    expect(screen.getByText('No meals logged for this day')).toBeInTheDocument();

    expect(within(dailyTotals).getByText('0 cal')).toHaveClass('text-emerald-950');
    expect(within(dailyTotals).getByText(/\/ 2200 cal/)).toBeInTheDocument();
    expect(within(dailyTotals).getAllByText('0g')).toHaveLength(3);
    expect(within(dailyTotals).getByText(/\/ 180g/)).toBeInTheDocument();
    expect(within(dailyTotals).getByText(/\/ 250g/)).toBeInTheDocument();
    expect(within(dailyTotals).getByText(/\/ 73g/)).toBeInTheDocument();

    for (const progressBar of screen.getAllByRole('progressbar')) {
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    }
  });

  it('shows the previous day data when navigating back and returns to today via the shortcut', () => {
    render(<NutritionPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to previous day' }));

    const dailyTotals = screen.getByLabelText('Daily macro totals');
    const macroProgress = screen.getByRole('heading', { name: 'Macro progress' }).closest('section');
    const breakfast = screen.getByRole('button', { name: /breakfast/i });

    expect(screen.getByText('Thursday, March 5')).toBeInTheDocument();
    expect(screen.getByText('Thursday, Mar 5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to next day' })).not.toBeDisabled();

    expect(within(dailyTotals).getByText('2131 cal')).toHaveClass('text-emerald-950');
    expect(within(dailyTotals).getByText('192g')).toHaveClass('text-red-900');
    expect(screen.queryByText('No meals logged for this day')).not.toBeInTheDocument();

    expect(macroProgress).not.toBeNull();

    if (!macroProgress) {
      throw new Error('Expected macro progress section to exist');
    }

    expect(within(macroProgress).getAllByRole('progressbar')).toHaveLength(4);
    expect(macroProgress.compareDocumentPosition(breakfast) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dailyTotals.compareDocumentPosition(macroProgress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    expect(screen.getByText('Friday, March 6')).toBeInTheDocument();
    expect(screen.getByText('No meals logged for this day')).toBeInTheDocument();
  });

  it('renders meal cards in breakfast, lunch, dinner, snacks order for a day with data', () => {
    render(<NutritionPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to previous day' }));

    const breakfast = screen.getByRole('button', { name: /breakfast/i });
    const lunch = screen.getByRole('button', { name: /lunch/i });
    const dinner = screen.getByRole('button', { name: /dinner/i });
    const snacks = screen.getByRole('button', { name: /snacks/i });

    expect(breakfast.compareDocumentPosition(lunch) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lunch.compareDocumentPosition(dinner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dinner.compareDocumentPosition(snacks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
