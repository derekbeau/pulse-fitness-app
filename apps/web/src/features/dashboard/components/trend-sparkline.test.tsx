import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { calculateTrendChangePercent } from '@/features/dashboard/lib/trend-sparklines';
import { useTrendWeightAnalytics } from '@/features/weight/api/weight';
import { useMacroTrend } from '@/hooks/use-macro-trend';

import {
  TrendSparkline,
  TrendSparklineTooltipContent,
  TrendSparklines,
  type TrendSparklinePlotDatum,
} from './trend-sparkline';

vi.mock('@/features/weight/api/weight', () => ({
  useTrendWeightAnalytics: vi.fn(),
}));

vi.mock('@/hooks/use-macro-trend', () => ({
  useMacroTrend: vi.fn(),
}));

vi.mock('@/hooks/use-weight-unit', () => ({
  useWeightUnit: () => ({ weightUnit: 'lbs' }),
}));

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    ResponsiveContainer: ({
      children,
      initialDimension,
    }: {
      children: React.ReactNode;
      initialDimension?: { height: number; width: number };
    }) => (
      <div
        data-initial-height={initialDimension?.height}
        data-initial-width={initialDimension?.width}
        data-testid="responsive-container"
      >
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

const sampleTrendAnalytics = {
  unit: 'lbs',
  current: { trendWeight: 175.4, ratePerWeek: -0.3 },
  points: [
    { date: '2026-03-06', scaleWeight: 175.6, trendWeight: 175.6 },
    { date: '2026-03-07', scaleWeight: 175.2, trendWeight: 175.4 },
  ],
};

const sampleMacroTrend = [
  {
    date: '2026-03-06',
    calories: 1900,
    protein: 160,
    carbs: 210,
    fat: 70,
  },
  {
    date: '2026-03-07',
    calories: 2050,
    protein: 170,
    carbs: 220,
    fat: 72,
  },
];

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
  const plotData: TrendSparklinePlotDatum[] = [
    { date: '2026-03-06', value: 175.6, trend: 175.6 },
    { date: '2026-03-07', value: 175.2, trend: 175.4 },
  ];

  it('renders a mini line chart without axes or legends', () => {
    const { container } = render(
      <div className="w-80">
        <TrendSparkline
          changePercent={-0.4}
          color="#3B82F6"
          currentValue="175.4 lbs"
          data={plotData}
          label="Weight Trend"
        />
      </div>,
    );

    expect(screen.getByText('Weight Trend')).toBeInTheDocument();
    expect(screen.getByText('175.4 lbs')).toBeInTheDocument();
    expect(screen.getByText('-0.4%')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Weight Trend sparkline' })).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toHaveAttribute('data-initial-height', '48');
    expect(screen.getByTestId('responsive-container')).toHaveAttribute('data-initial-width', '320');
    const rawLinePath = container.querySelector('.recharts-line .recharts-curve');
    expect(rawLinePath).toBeInTheDocument();
    const pathCommands = rawLinePath?.getAttribute('d')?.matchAll(/[MLC][^,]*,([\d.]+)/g);
    const yCoordinates = Array.from(pathCommands ?? [], (match) => Number(match[1]));
    expect(Math.max(...(yCoordinates ?? [])) - Math.min(...(yCoordinates ?? []))).toBeGreaterThan(
      10,
    );
    expect(container.querySelector('.recharts-cartesian-axis')).not.toBeInTheDocument();
    expect(container.querySelector('.recharts-legend-wrapper')).not.toBeInTheDocument();
  });

  it('renders empty state text when data is empty', () => {
    render(
      <TrendSparkline
        changePercent={0}
        color="#3B82F6"
        currentValue="--"
        data={[]}
        label="Weight Trend"
      />,
    );

    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Weight Trend sparkline' })).not.toBeInTheDocument();
  });

  it('renders a real path break for server-declared Trend Weight gaps', () => {
    const { container } = render(
      <TrendSparkline
        changePercent={0}
        color="#3B82F6"
        currentValue="178 lbs"
        data={[
          { date: '2026-03-01', value: 180, trend: 180 },
          { date: '2026-03-02', value: 179.5, trend: 179.8 },
          {
            date: '2026-03-10',
            value: 179,
            trend: 179.4,
            startsNewTrendSegment: true,
          },
          { date: '2026-03-11', value: 178, trend: 179 },
        ]}
        label="Trend Weight"
        showRawSeries={false}
      />,
    );

    const path = container.querySelector('.recharts-line .recharts-curve');
    expect(path?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
  });

  it('labels hidden-raw-series tooltip values as Trend Weight', () => {
    render(
      <TrendSparklineTooltipContent
        entry={{ date: '2026-03-07', value: 190, trend: 175.4 }}
        formatValue={(value) => `${value} lbs`}
        showRawSeries={false}
      />,
    );

    expect(screen.getByText('Trend 175.4 lbs')).toBeInTheDocument();
    expect(screen.queryByText(/190 lbs/)).not.toBeInTheDocument();
  });
});

describe('TrendSparklines', () => {
  beforeEach(() => {
    vi.mocked(useTrendWeightAnalytics).mockReset();
    vi.mocked(useMacroTrend).mockReset();
  });

  it('renders server-owned Trend Weight alongside smoothed calorie and protein cards', () => {
    vi.mocked(useTrendWeightAnalytics).mockReturnValue({
      data: sampleTrendAnalytics,
      isLoading: false,
    } as ReturnType<typeof useTrendWeightAnalytics>);
    vi.mocked(useMacroTrend).mockReturnValue({
      data: sampleMacroTrend,
      isLoading: false,
    } as ReturnType<typeof useMacroTrend>);

    const { container } = render(
      <MemoryRouter>
        <TrendSparklines endDate="2026-03-07" />
      </MemoryRouter>,
    );

    const cards = container.querySelectorAll('[data-slot="trend-sparkline-card"]');
    expect(cards).toHaveLength(3);

    expect(screen.getByText('Trend Weight')).toBeInTheDocument();
    expect(screen.getByText('Calorie Trend')).toBeInTheDocument();
    expect(screen.getByText('Protein Trend')).toBeInTheDocument();
    expect(screen.getAllByText('7d avg')).toHaveLength(2);

    // "View details" links navigate to correct routes
    const links = screen.getAllByRole('link', { name: /view .+ details/i });
    expect(links).toHaveLength(3);

    const weightCard = screen
      .getByText('Trend Weight')
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
    expect(within(weightCard as HTMLElement).getByRole('link')).toHaveAttribute(
      'href',
      '/weight/history',
    );
    expect(within(weightCard as HTMLElement).getByText('175.4 lbs')).toBeInTheDocument();
    expect(within(weightCard as HTMLElement).getByText('-0.3 lbs/week')).toBeInTheDocument();
    expect(within(weightCard as HTMLElement).getByText('Product trend')).toBeInTheDocument();
    expect(within(calorieCard as HTMLElement).getByRole('link')).toHaveAttribute(
      'href',
      '/nutrition?view=trends',
    );
    expect(within(proteinCard as HTMLElement).getByRole('link')).toHaveAttribute(
      'href',
      '/nutrition?view=trends',
    );

    expect(weightCard?.querySelector('[data-slot="trend-sparkline-change"]')).toBeInTheDocument();
    expect(calorieCard?.querySelector('[data-slot="trend-sparkline-change"]')).toBeInTheDocument();
    expect(proteinCard?.querySelector('[data-slot="trend-sparkline-change"]')).toBeInTheDocument();
    expect(
      within(weightCard as HTMLElement).getByRole('img', { name: 'Trend Weight sparkline' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['stale', 'Product trend · Stale'],
    ['scale_only', 'Product trend · Still learning'],
    ['developing', 'Product trend · Limited evidence'],
    ['no_data', 'Product trend · No data'],
  ] as const)('explains the %s server state on the weight card', (state, subtitle) => {
    vi.mocked(useTrendWeightAnalytics).mockReturnValue({
      data: {
        ...sampleTrendAnalytics,
        current: { ...sampleTrendAnalytics.current, state },
      },
      isLoading: false,
    } as ReturnType<typeof useTrendWeightAnalytics>);
    vi.mocked(useMacroTrend).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useMacroTrend>);

    render(
      <MemoryRouter>
        <TrendSparklines endDate="2026-03-07" metrics={['weight']} />
      </MemoryRouter>,
    );

    expect(screen.getByText(subtitle)).toBeInTheDocument();
  });

  it('shows skeleton cards while trend queries are loading', () => {
    vi.mocked(useTrendWeightAnalytics).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useTrendWeightAnalytics>);
    vi.mocked(useMacroTrend).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useMacroTrend>);

    const { container } = render(
      <MemoryRouter>
        <TrendSparklines />
      </MemoryRouter>,
    );

    expect(container.querySelectorAll('[data-slot="trend-sparkline-card-skeleton"]')).toHaveLength(
      3,
    );
    expect(screen.queryByText('Trend Weight')).not.toBeInTheDocument();
  });

  it('renders only selected trend metrics', () => {
    vi.mocked(useTrendWeightAnalytics).mockReturnValue({
      data: sampleTrendAnalytics,
      isLoading: false,
    } as ReturnType<typeof useTrendWeightAnalytics>);
    vi.mocked(useMacroTrend).mockReturnValue({
      data: sampleMacroTrend,
      isLoading: false,
    } as ReturnType<typeof useMacroTrend>);

    const { container } = render(
      <MemoryRouter>
        <TrendSparklines endDate="2026-03-07" metrics={['protein']} />
      </MemoryRouter>,
    );

    const cards = container.querySelectorAll('[data-slot="trend-sparkline-card"]');
    expect(cards).toHaveLength(1);
    expect(screen.getByText('Protein Trend')).toBeInTheDocument();
    expect(screen.queryByText('Trend Weight')).not.toBeInTheDocument();
    expect(screen.queryByText('Calorie Trend')).not.toBeInTheDocument();
    expect(vi.mocked(useTrendWeightAnalytics)).toHaveBeenCalledWith('1m', '2026-03-07', {
      enabled: false,
      refetchIntervalMs: undefined,
    });
    expect(vi.mocked(useMacroTrend)).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
      enabled: true,
    });
  });

  it('renders an empty state when no metrics are selected', () => {
    vi.mocked(useTrendWeightAnalytics).mockReturnValue({
      data: sampleTrendAnalytics,
      isLoading: false,
    } as ReturnType<typeof useTrendWeightAnalytics>);
    vi.mocked(useMacroTrend).mockReturnValue({
      data: sampleMacroTrend,
      isLoading: false,
    } as ReturnType<typeof useMacroTrend>);

    render(
      <MemoryRouter>
        <TrendSparklines metrics={[]} />
      </MemoryRouter>,
    );

    expect(screen.getByText('No trend metrics selected.')).toBeInTheDocument();
    expect(screen.queryByText('Trend Weight')).not.toBeInTheDocument();
  });

  it('renders an error state when a required trend query fails', () => {
    vi.mocked(useTrendWeightAnalytics).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as ReturnType<typeof useTrendWeightAnalytics>);
    vi.mocked(useMacroTrend).mockReturnValue({
      data: sampleMacroTrend,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMacroTrend>);

    render(
      <MemoryRouter>
        <TrendSparklines metrics={['weight']} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Unable to load trend data.')).toBeInTheDocument();
    expect(screen.queryByText('Trend Weight')).not.toBeInTheDocument();
  });

  it('shows "--" and "No data" when all macro points are zero', () => {
    vi.mocked(useTrendWeightAnalytics).mockReturnValue({
      data: sampleTrendAnalytics,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useTrendWeightAnalytics>);
    vi.mocked(useMacroTrend).mockReturnValue({
      data: [
        { date: '2026-03-06', calories: 0, protein: 0, carbs: 0, fat: 0 },
        { date: '2026-03-07', calories: 0, protein: 0, carbs: 0, fat: 0 },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useMacroTrend>);

    render(
      <MemoryRouter>
        <TrendSparklines endDate="2026-03-07" metrics={['calories']} />
      </MemoryRouter>,
    );

    const calorieCard = screen
      .getByText('Calorie Trend')
      .closest('[data-slot="trend-sparkline-card"]') as HTMLElement;

    expect(within(calorieCard).getByText('--')).toBeInTheDocument();
    expect(within(calorieCard).getByText('7d avg')).toBeInTheDocument();
    expect(within(calorieCard).getByText('No data')).toBeInTheDocument();
  });
});
