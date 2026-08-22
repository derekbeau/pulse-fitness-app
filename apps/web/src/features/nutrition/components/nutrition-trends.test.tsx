import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useMacroTrend } from '@/hooks/use-macro-trend';
import { buildNutritionTrendData, computeNutritionDailyAverages } from './nutrition-trend-data';
import { NutritionTrends } from './nutrition-trends';

vi.mock('@/hooks/use-macro-trend', () => ({ useMacroTrend: vi.fn() }));
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">
        {React.isValidElement(children)
          ? React.cloneElement(
              children as React.ReactElement<{ height?: number; width?: number }>,
              { height: 260, width: 640 },
            )
          : children}
      </div>
    ),
  };
});

const points = [
  { date: '2026-08-20', calories: 2000, protein: 140, carbs: 210, fat: 65 },
  { date: '2026-08-22', calories: 2200, protein: 160, carbs: 230, fat: 75 },
];

describe('NutritionTrends', () => {
  it('renders synchronized averages, gaps, and exact keyboard-operable rows', () => {
    vi.mocked(useMacroTrend).mockReturnValue({
      data: points,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useMacroTrend>);

    render(<NutritionTrends referenceDate="2026-08-22" />);

    expect(screen.getByLabelText('Selected nutrition range summary')).toHaveTextContent(
      'Average calories2100 kcal2 logged days',
    );
    fireEvent.click(screen.getByText('View exact chart values'));
    const missingRow = screen.getByRole('row', { name: /Aug 21, 2026/ });
    expect(within(missingRow).getAllByText('Not available')).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: /Inspect Aug 20, 2026/ }));
    expect(screen.getByLabelText('Selected chart point')).toHaveTextContent(
      'Aug 20, 2026Calories 2000 kcal',
    );
  });

  it('uses the shared calendar contract when the range changes', () => {
    vi.mocked(useMacroTrend).mockReturnValue({
      data: points,
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useMacroTrend>);

    render(<NutritionTrends referenceDate="2026-08-22" />);
    expect(useMacroTrend).toHaveBeenLastCalledWith('2026-07-24', '2026-08-22');

    fireEvent.click(screen.getByRole('button', { name: '1W' }));
    expect(useMacroTrend).toHaveBeenLastCalledWith('2026-08-16', '2026-08-22');
  });

  it('keeps pure transformations explicit and never fills missing nutrition with zero', () => {
    expect(buildNutritionTrendData(points, '2026-08-20', '2026-08-22')).toEqual([
      points[0],
      { date: '2026-08-21', calories: null, protein: null, carbs: null, fat: null },
      points[1],
    ]);
    expect(computeNutritionDailyAverages(points)).toEqual({
      calories: 2100,
      protein: 150,
      carbs: 220,
      fat: 70,
    });
  });

  it('keeps range controls mounted and exposes a retryable error state', () => {
    const refetch = vi.fn();
    vi.mocked(useMacroTrend).mockReturnValue({
      data: undefined,
      isError: true,
      isLoading: false,
      refetch,
    } as unknown as ReturnType<typeof useMacroTrend>);

    render(<NutritionTrends referenceDate="2026-08-22" />);
    expect(screen.getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
