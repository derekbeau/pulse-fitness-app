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
  accentTextClassName?: string;
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
  accentTextClassName,
  className,
  ...props
}: StatCardProps) {
  const trendStyle = trend ? TREND_STYLES[trend.direction] : null;
  const TrendIcon = trendStyle?.icon;
  const trendSymbol = trend?.direction !== 'neutral' ? (trendStyle?.symbol ?? '') : '';
  const formattedTrend = `${trendSymbol}${Math.abs(trend?.value ?? 0)}%`;
  const hasAccent = !!accentTextClassName;
  const accentClass = accentTextClassName ?? 'text-on-accent';
  const labelClassName = hasAccent
    ? cn(accentClass, 'opacity-70 dark:text-muted dark:opacity-100')
    : 'text-muted';
  const valueClassName = hasAccent ? cn(accentClass, 'dark:text-foreground') : 'text-foreground';
  const iconClassName = hasAccent ? cn(accentClass, 'dark:text-muted') : 'text-muted';
  const trendClassName = hasAccent
    ? cn(accentClass, 'opacity-80 dark:text-muted dark:opacity-100')
    : trendStyle?.className;
  const valueTitle = typeof value === 'string' ? value : undefined;

  return (
    <Card data-slot="stat-card" className={cn('gap-3 py-4 sm:gap-4 sm:py-5', className)} {...props}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-0">
        <p
          className={cn(
            'min-w-0 truncate text-xs font-semibold uppercase tracking-wide sm:text-sm sm:normal-case sm:tracking-normal',
            labelClassName,
          )}
        >
          {label}
        </p>
        {icon ? <div className={iconClassName}>{icon}</div> : null}
      </CardHeader>
      <CardContent className="space-y-1.5">
        <p
          className={cn(
            'overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold tracking-tight sm:text-2xl lg:text-3xl',
            valueClassName,
          )}
          title={valueTitle}
        >
          {value}
        </p>
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
