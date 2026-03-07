import * as React from 'react';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type TrendDirection = 'up' | 'down' | 'neutral';

export type StatTrend = {
  direction: TrendDirection;
  value: number;
};

export type StatCardProps = Omit<React.ComponentProps<typeof Card>, 'children'> & {
  value: number | string;
  label: string;
  trend?: StatTrend;
  icon?: React.ReactNode;
  textClassName?: string;
};

const TREND_STYLES: Record<
  TrendDirection,
  {
    className: string;
    icon: React.ComponentType<React.ComponentProps<'svg'>>;
    symbol: string;
  }
> = {
  up: {
    className: 'text-[var(--color-accent-mint)]',
    icon: TrendingUp,
    symbol: '+',
  },
  down: {
    className: 'text-[var(--destructive)]',
    icon: TrendingDown,
    symbol: '-',
  },
  neutral: {
    className: 'text-[var(--color-muted)]',
    icon: Minus,
    symbol: '',
  },
};

export function StatCard({
  value,
  label,
  trend,
  icon,
  textClassName,
  className,
  ...props
}: StatCardProps) {
  const trendStyle = trend ? TREND_STYLES[trend.direction] : null;
  const TrendIcon = trendStyle?.icon;
  const trendSymbol = trend?.direction !== 'neutral' ? (trendStyle?.symbol ?? '') : '';
  const formattedTrend = `${trendSymbol}${Math.abs(trend?.value ?? 0)}%`;
  const labelClassName = textClassName ?? 'text-muted';
  const valueClassName = textClassName ?? 'text-foreground';
  const iconClassName = textClassName ?? 'text-muted';
  const trendClassName = trendStyle?.className;

  return (
    <Card data-slot="stat-card" className={cn('gap-4 py-5', className)} {...props}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-0">
        <p className={cn('text-sm font-medium', labelClassName)}>{label}</p>
        {icon ? <div className={iconClassName}>{icon}</div> : null}
      </CardHeader>
      <CardContent className="space-y-2">
        <p className={cn('text-2xl font-semibold tracking-tight sm:text-3xl', valueClassName)}>{value}</p>
        {trend && trendStyle && TrendIcon ? (
          <div
            aria-label={`trend ${trend.direction}`}
            data-slot="stat-card-trend"
            className={cn('flex items-center gap-2 text-sm font-medium', trendClassName)}
          >
            <TrendIcon className="size-4" />
            <span>{formattedTrend}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
