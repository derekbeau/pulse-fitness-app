import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ChartPointDetailProps = {
  children: ReactNode;
  className?: string;
  dataSlot?: string;
  label?: string;
};

export function ChartPointDetail({
  children,
  className,
  dataSlot = 'chart-point-detail',
  label = 'Selected chart point',
}: ChartPointDetailProps) {
  return (
    <section
      aria-label={label}
      aria-live="polite"
      className={cn('rounded-xl border border-border/70 bg-muted/15 p-3 text-sm', className)}
      data-slot={dataSlot}
    >
      {children}
    </section>
  );
}
