import { cn } from '@/lib/utils';

export type ChartTooltipRow = {
  color?: string;
  label: string;
  value: string | null;
};

type ChartTooltipProps = {
  className?: string;
  dataSlot?: string;
  date: string;
  rows: readonly ChartTooltipRow[];
};

export function ChartTooltip({
  className,
  dataSlot = 'chart-tooltip',
  date,
  rows,
}: ChartTooltipProps) {
  return (
    <div
      className={cn(
        'min-w-44 rounded-xl border border-border bg-card p-3 text-sm shadow-lg',
        className,
      )}
      data-slot={dataSlot}
      role="tooltip"
    >
      <p className="font-medium text-foreground">{date}</p>
      <dl className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3" key={row.label}>
            <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
              {row.color ? (
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
              ) : null}
              <span className="truncate">{row.label}</span>
            </dt>
            <dd className="font-medium text-foreground tabular-nums">
              {' '}
              {row.value ?? 'Not available'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
