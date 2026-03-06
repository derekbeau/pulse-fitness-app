import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

import { cn } from '@/lib/utils';

export type TrendSparklineDatum = {
  date: string;
  value: number;
};

export type TrendSparklineProps = {
  data: TrendSparklineDatum[];
  color: string;
  label: string;
  currentValue: number | string;
  changePercent: number;
  className?: string;
};

type ChangeDirection = 'up' | 'down' | 'neutral';

const CHANGE_ICONS = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  neutral: Minus,
} satisfies Record<ChangeDirection, typeof ArrowUpRight>;

const formatChangePercent = (changePercent: number): string => {
  if (changePercent > 0) {
    return `+${changePercent}%`;
  }

  return `${changePercent}%`;
};

const getChangeDirection = (changePercent: number): ChangeDirection => {
  if (changePercent > 0) {
    return 'up';
  }

  if (changePercent < 0) {
    return 'down';
  }

  return 'neutral';
};

export function TrendSparkline({
  data,
  color,
  label,
  currentValue,
  changePercent,
  className,
}: TrendSparklineProps) {
  const direction = getChangeDirection(changePercent);
  const ChangeIcon = CHANGE_ICONS[direction];

  return (
    <div className={cn('flex h-full flex-col gap-4', className)} data-slot="trend-sparkline">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium text-on-accent/70">{label}</p>

        <div className="space-y-1 text-right">
          <p className="text-3xl font-semibold tracking-tight text-on-accent">{currentValue}</p>
          <div
            aria-label={`trend ${direction}`}
            className="flex items-center justify-end gap-1 text-sm font-medium text-on-accent/80"
            data-slot="trend-sparkline-change"
          >
            <ChangeIcon aria-hidden="true" className="size-4" />
            <span>{formatChangePercent(changePercent)}</span>
          </div>
        </div>
      </div>

      <div
        aria-label={`${label} sparkline`}
        className="h-[60px] w-full"
        data-slot="trend-sparkline-chart"
        role="img"
      >
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={data} margin={{ top: 6, right: 0, bottom: 2, left: 0 }}>
            <Line
              dataKey="value"
              dot={false}
              isAnimationActive={false}
              stroke={color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
