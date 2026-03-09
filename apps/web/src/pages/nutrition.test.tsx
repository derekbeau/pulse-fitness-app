import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { NutritionPage } from '@/pages/nutrition';

describe('NutritionPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00'));
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                id: 'target-current',
                calories: 2300,
                protein: 190,
                carbs: 260,
                fat: 75,
                effectiveDate: '2026-03-06',
                createdAt: 1,
                updatedAt: 1,
              },
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 200 },
          ),
        ),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('defaults to today with empty nutrition data, live targets, and blocked future navigation', async () => {
    const { wrapper } = createQueryClientWrapper();

    render(<NutritionPage />, { wrapper });
    const dailyTotals = screen.getByLabelText('Daily macro totals');

    expect(screen.getByRole('heading', { name: 'Nutrition' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Daily totals' })).toBeInTheDocument();
    expect(screen.getByText('Friday, March 6')).toBeInTheDocument();
    expect(screen.getByText('Friday, Mar 6')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to next day' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
    expect(screen.getByText('No meals logged for this day')).toBeInTheDocument();

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(within(dailyTotals).getByText(/2300 cal/)).toBeInTheDocument();

    expect(within(dailyTotals).getByText('0 cal')).toHaveClass('text-emerald-950');
    expect(within(dailyTotals).getAllByText('0g')).toHaveLength(3);
    expect(within(dailyTotals).getByText(/\/ 190g/)).toBeInTheDocument();
    expect(within(dailyTotals).getByText(/\/ 260g/)).toBeInTheDocument();
    expect(within(dailyTotals).getByText(/\/ 75g/)).toBeInTheDocument();

    for (const progressBar of screen.getAllByRole('progressbar')) {
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    }
  });

  it('shows the previous day data when navigating back and returns to today via the shortcut', () => {
    const { wrapper } = createQueryClientWrapper();

    render(<NutritionPage />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Go to previous day' }));

    const dailyTotals = screen.getByLabelText('Daily macro totals');
    const macroProgress = screen
      .getByRole('heading', { name: 'Macro progress' })
      .closest('section');
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
    expect(
      macroProgress.compareDocumentPosition(breakfast) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      dailyTotals.compareDocumentPosition(macroProgress) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    expect(screen.getByText('Friday, March 6')).toBeInTheDocument();
    expect(screen.getByText('No meals logged for this day')).toBeInTheDocument();
  });

  it('renders meal cards in breakfast, lunch, dinner, snacks order for a day with data', () => {
    const { wrapper } = createQueryClientWrapper();

    render(<NutritionPage />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Go to previous day' }));

    const breakfast = screen.getByRole('button', { name: /breakfast/i });
    const lunch = screen.getByRole('button', { name: /lunch/i });
    const dinner = screen.getByRole('button', { name: /dinner/i });
    const snacks = screen.getByRole('button', { name: /snacks/i });

    expect(
      breakfast.compareDocumentPosition(lunch) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(lunch.compareDocumentPosition(dinner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dinner.compareDocumentPosition(snacks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
