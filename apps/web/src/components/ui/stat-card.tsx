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
  value: React.ReactNode;
  label: string;
  trend?: StatTrend;
  icon?: React.ReactNode;
  accentTextClassName?: string;
  valueClassName?: string;
  valueTitle?: string;
  density?: 'default' | 'compact';
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
  valueClassName: customValueClassName,
  valueTitle,
  density = 'default',
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
  const valueTextClassName = hasAccent
    ? cn(accentClass, 'dark:text-foreground')
    : 'text-foreground';
  const iconClassName = hasAccent ? cn(accentClass, 'dark:text-muted') : 'text-muted';
  const trendClassName = hasAccent
    ? cn(accentClass, 'opacity-80 dark:text-muted dark:opacity-100')
    : trendStyle?.className;
  const resolvedValueTitle = valueTitle ?? (typeof value === 'string' ? value : undefined);
  const isCompact = density === 'compact';

  return (
    <Card
      data-density={density}
      data-slot="stat-card"
      className={cn(isCompact ? 'gap-2.5 py-2.5' : 'gap-3 py-4 sm:gap-4 sm:py-5', className)}
      {...props}
    >
      <CardHeader
        className={cn(
          'min-w-0 flex flex-row items-start justify-between pb-0',
          isCompact ? 'gap-1.5 px-3' : 'gap-2',
        )}
      >
        <p
          className={cn(
            isCompact
              ? 'min-w-0 truncate text-[11px] leading-4 font-semibold uppercase tracking-[0.14em] sm:text-xs'
              : 'min-w-0 truncate text-xs font-semibold uppercase tracking-wide sm:text-sm sm:normal-case sm:tracking-normal',
            labelClassName,
          )}
        >
          {label}
        </p>
        {icon ? <div className={cn('shrink-0', iconClassName)}>{icon}</div> : null}
      </CardHeader>
      <CardContent className={cn('min-w-0', isCompact ? 'space-y-1 px-3' : 'space-y-1.5')}>
        <p
          className={cn(
            isCompact
              ? 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-base leading-tight font-bold tracking-tight sm:text-lg lg:text-xl'
              : 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-bold tracking-tight sm:text-2xl lg:text-3xl',
            valueTextClassName,
            customValueClassName,
          )}
          title={resolvedValueTitle}
        >
          {value}
        </p>
        {trend && trendStyle && TrendIcon ? (
          <div
            aria-label={`trend ${trend.direction}`}
            data-slot="stat-card-trend"
            className={cn(
              isCompact
                ? 'flex items-center gap-1.5 text-xs font-medium'
                : 'flex items-center gap-2 text-sm font-medium',
              trendClassName,
            )}
          >
            <TrendIcon className={cn(isCompact ? 'size-3.5' : 'size-4')} />
            <span>{formattedTrend}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
