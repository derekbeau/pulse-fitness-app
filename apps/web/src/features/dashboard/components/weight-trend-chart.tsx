import { Link } from 'react-router';

import { TrendWeightWorkspace } from '@/features/weight/components/trend-weight-workspace';

type WeightTrendChartProps = {
  endDate?: string;
};

export function WeightTrendChart({ endDate }: WeightTrendChartProps) {
  return (
    <div className="relative" data-slot="weight-trend-chart">
      <Link
        aria-label="View weight history"
        className="absolute right-4 top-4 z-10 rounded-full border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        to="/weight/history"
      >
        Details
      </Link>
      <TrendWeightWorkspace compact end={endDate} />
    </div>
  );
}
