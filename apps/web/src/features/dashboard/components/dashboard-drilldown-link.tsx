import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { cn } from '@/lib/utils';

type DashboardDrilldownLinkProps = {
  children: ReactNode;
  className?: string;
  indicatorClassName?: string;
  indicatorLabel?: string;
  to: string;
  viewLabel: string;
};

export const dashboardDrilldownCardClassName =
  'cursor-pointer transition-[transform,box-shadow,filter,border-color,background-color] duration-200 group-hover/drilldown:-translate-y-0.5 group-hover/drilldown:border-primary/35 group-hover/drilldown:shadow-md group-hover/drilldown:brightness-[0.98] group-focus-within/drilldown:-translate-y-0.5 group-focus-within/drilldown:border-primary/45 group-focus-within/drilldown:shadow-md group-focus-within/drilldown:brightness-[0.98] dark:group-hover/drilldown:brightness-[1.08] dark:group-focus-within/drilldown:brightness-[1.08]';

export function DashboardDrilldownIndicator({
  className,
  label = 'View',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute right-3 bottom-3 z-20 inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/85 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm transition-colors group-hover/drilldown:text-foreground group-hover/drilldown:border-primary/35 group-focus-within/drilldown:text-foreground group-focus-within/drilldown:border-primary/45',
        className,
      )}
    >
      {label ? <span>{label}</span> : null}
      <ChevronRight className="size-3.5" />
    </span>
  );
}

export function DashboardDrilldownLink({
  children,
  className,
  indicatorClassName,
  indicatorLabel,
  to,
  viewLabel,
}: DashboardDrilldownLinkProps) {
  return (
    <div className={cn('group/drilldown relative isolate rounded-[inherit]', className)}>
      {children}
      <Link
        aria-label={viewLabel}
        className="absolute inset-0 z-10 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        to={to}
      />
      <DashboardDrilldownIndicator className={indicatorClassName} label={indicatorLabel} />
    </div>
  );
}
