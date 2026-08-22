import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ChartFrameProps = {
  annotations?: ReactNode;
  children: ReactNode;
  className?: string;
  controls?: ReactNode;
  description: ReactNode;
  detail?: ReactNode;
  id?: string;
  summary?: ReactNode;
  table?: ReactNode;
  title: ReactNode;
  visualClassName?: string;
};

export function ChartFrame({
  annotations,
  children,
  className,
  controls,
  description,
  detail,
  id,
  summary,
  table,
  title,
  visualClassName,
}: ChartFrameProps) {
  const generatedId = useId().replaceAll(':', '');
  const frameId = id ?? `pulse-chart-${generatedId}`;
  const titleId = `${frameId}-title`;
  const descriptionId = `${frameId}-description`;
  const visualId = `${frameId}-visual`;

  return (
    <figure
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className={cn(
        'min-w-0 space-y-4 overflow-hidden rounded-3xl border border-border/70 bg-card p-4 shadow-sm sm:p-5',
        className,
      )}
      data-slot="chart-frame"
    >
      <figcaption className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground" id={titleId}>
            {title}
          </h2>
          <div className="text-sm leading-6 text-muted-foreground" id={descriptionId}>
            {description}
          </div>
        </div>
        {controls ? <div className="shrink-0">{controls}</div> : null}
      </figcaption>

      {summary}
      {annotations}
      <div className={cn('min-w-0', visualClassName)} id={visualId}>
        {children}
      </div>
      {detail}
      {table}
    </figure>
  );
}
