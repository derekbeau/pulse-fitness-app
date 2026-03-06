import * as React from 'react';

import { cn } from '@/lib/utils';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export type ProgressBarProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  value: number;
  max: number;
  label?: string;
  color?: string;
  showValue?: boolean;
};

export function ProgressBar({
  value,
  max,
  label,
  color = 'var(--color-primary)',
  showValue = false,
  className,
  ...props
}: ProgressBarProps) {
  const safeMax = max > 0 ? max : 0;
  const safeValue = safeMax > 0 ? clamp(value, 0, safeMax) : 0;
  const percentage = safeMax > 0 ? (safeValue / safeMax) * 100 : 0;
  const valueText = `${Math.round(safeValue)} / ${Math.round(safeMax)}`;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.round(safeValue)}
      data-slot="progress-bar"
      className={cn('space-y-2', className)}
      {...props}
    >
      {(label || showValue) && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted">{label}</span>
          {showValue ? <span className="font-medium text-foreground">{valueText}</span> : null}
        </div>
      )}
      <div
        data-slot="progress-bar-track"
        className="h-3 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div
          data-slot="progress-bar-fill"
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{
            backgroundColor: color,
            width: `${percentage}%`,
          }}
        />
      </div>
    </div>
  );
}
