import { AlertTriangle, ChartNoAxesColumn, CircleDashed } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ChartStateKind = 'loading' | 'empty' | 'insufficient' | 'partial' | 'stale' | 'error';

type ChartStateProps = {
  actionLabel?: string;
  className?: string;
  description: string;
  kind: ChartStateKind;
  onAction?: () => void;
  title: string;
};

export function ChartState({
  actionLabel = 'Retry',
  className,
  description,
  kind,
  onAction,
  title,
}: ChartStateProps) {
  const Icon =
    kind === 'error' ? AlertTriangle : kind === 'loading' ? CircleDashed : ChartNoAxesColumn;
  const role = kind === 'error' ? 'alert' : 'status';

  return (
    <section
      aria-busy={kind === 'loading' ? 'true' : undefined}
      className={cn(
        'flex min-h-52 items-center justify-center rounded-2xl border px-5 py-8 text-center',
        kind === 'error'
          ? 'border-destructive/40 bg-destructive/5'
          : kind === 'empty' || kind === 'insufficient'
            ? 'border-dashed border-border bg-muted/10'
            : 'border-border/70 bg-muted/15',
        kind === 'loading' && 'animate-pulse motion-reduce:animate-none',
        className,
      )}
      data-chart-state={kind}
      role={role}
    >
      <div className="max-w-md">
        <Icon aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
        <h3 className="mt-3 font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        {onAction ? (
          <Button className="mt-4" onClick={onAction} type="button">
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
