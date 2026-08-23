import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type ChartSummaryItem = {
  detail?: ReactNode;
  label: ReactNode;
  value: ReactNode;
};

type ChartSummaryProps = {
  className?: string;
  items: readonly ChartSummaryItem[];
  label: string;
};

export function ChartSummary({ className, items, label }: ChartSummaryProps) {
  return (
    <dl
      aria-label={label}
      className={cn('grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4', className)}
      data-slot="chart-summary"
    >
      {items.map((item, index) => (
        <div
          className="min-w-0 rounded-2xl border border-border/60 bg-background/60 p-3"
          key={index}
        >
          <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-1 break-words text-lg font-semibold text-foreground tabular-nums">
            {item.value}
          </dd>
          {item.detail ? (
            <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.detail}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
