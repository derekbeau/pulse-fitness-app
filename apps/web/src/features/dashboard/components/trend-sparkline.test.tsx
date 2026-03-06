import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { mockMacroTrend, mockWeightTrend } from '@/lib/mock-data/dashboard';
import { calculateTrendChangePercent } from '@/features/dashboard/lib/trend-sparklines';

import { DashboardTrendSparklines } from './dashboard-trend-sparklines';
import { TrendSparkline } from './trend-sparkline';

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
              {
                height: 60,
                width: 320,
              },
            )
          : children}
      </div>
    ),
  };
});

describe('calculateTrendChangePercent', () => {
  it('returns zero when the previous value is not positive', () => {
    expect(calculateTrendChangePercent(175, 0)).toBe(0);
    expect(calculateTrendChangePercent(175, -12)).toBe(0);
  });

  it('returns a signed percentage rounded to one decimal place', () => {
    expect(calculateTrendChangePercent(180, 175)).toBe(2.9);
    expect(calculateTrendChangePercent(170, 175)).toBe(-2.9);
  });
});

describe('TrendSparkline', () => {
  it('renders a mini line chart without axes or legends', () => {
    const { container } = render(
      <div className="w-80">
        <TrendSparkline
          changePercent={-0.4}
          color="#3B82F6"
          currentValue="175.2 lbs"
          data={mockWeightTrend.slice(-7)}
          label="Weight Trend"
        />
      </div>,
    );

    expect(screen.getByText('Weight Trend')).toBeInTheDocument();
    expect(screen.getByText('175.2 lbs')).toBeInTheDocument();
    expect(screen.getByText('-0.4%')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Weight Trend sparkline' })).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(container.querySelector('.recharts-line .recharts-curve')).toBeInTheDocument();
    expect(container.querySelector('.recharts-cartesian-axis')).not.toBeInTheDocument();
    expect(container.querySelector('.recharts-legend-wrapper')).not.toBeInTheDocument();
  });
});

describe('DashboardTrendSparklines', () => {
  it('renders weight, calorie, and protein trend cards from dashboard mock data', () => {
    const { container } = render(<DashboardTrendSparklines />);

    const cards = container.querySelectorAll('[data-slot="trend-sparkline-card"]');
    expect(cards).toHaveLength(3);

    const latestWeight = mockWeightTrend.at(-1)?.value ?? 0;
    const latestCalories = mockMacroTrend.at(-1)?.calories ?? 0;
    const latestProtein = mockMacroTrend.at(-1)?.protein ?? 0;

    expect(screen.getByText('Weight Trend')).toBeInTheDocument();
    expect(screen.getByText('Calorie Trend')).toBeInTheDocument();
    expect(screen.getByText('Protein Trend')).toBeInTheDocument();
    expect(screen.getByText(`${latestWeight.toFixed(1)} lbs`)).toBeInTheDocument();
    expect(screen.getByText(`${latestCalories} kcal`)).toBeInTheDocument();
    expect(screen.getByText(`${latestProtein} g`)).toBeInTheDocument();

    const weightCard = screen
      .getByText('Weight Trend')
      .closest('[data-slot="trend-sparkline-card"]');
    const calorieCard = screen
      .getByText('Calorie Trend')
      .closest('[data-slot="trend-sparkline-card"]');
    const proteinCard = screen
      .getByText('Protein Trend')
      .closest('[data-slot="trend-sparkline-card"]');

    expect(weightCard).toHaveClass('bg-[var(--color-accent-cream)]');
    expect(calorieCard).toHaveClass('bg-[var(--color-accent-pink)]');
    expect(proteinCard).toHaveClass('bg-[var(--color-accent-mint)]');
    expect(weightCard).toHaveClass('text-on-accent');
    expect(calorieCard).toHaveClass('text-on-accent');
    expect(proteinCard).toHaveClass('text-on-accent');

    expect(weightCard?.querySelector('[data-slot="trend-sparkline-change"]')).toBeInTheDocument();
    expect(calorieCard?.querySelector('[data-slot="trend-sparkline-change"]')).toBeInTheDocument();
    expect(proteinCard?.querySelector('[data-slot="trend-sparkline-change"]')).toBeInTheDocument();
    expect(
      within(weightCard as HTMLElement).getByRole('img', { name: 'Weight Trend sparkline' }),
    ).toBeInTheDocument();
  });
});
