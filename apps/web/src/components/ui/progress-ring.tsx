import * as React from 'react';

import { cn } from '@/lib/utils';

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

export type ProgressRingProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: React.ReactNode;
  labelClassName?: string;
};

export function ProgressRing({
  value,
  size = 80,
  strokeWidth = 8,
  color = 'var(--color-primary)',
  label,
  labelClassName,
  className,
  ...props
}: ProgressRingProps) {
  const progress = clampPercent(value);
  const radius = Math.max((size - strokeWidth) / 2, 0);
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  const centerText = label ?? `${Math.round(progress)}%`;
  const labelWidth = Math.max(size - strokeWidth * 3, 0);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      data-slot="progress-ring"
      className={cn('relative inline-flex items-center justify-center', className)}
      {...props}
    >
      <svg className="-rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          data-slot="progress-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-secondary)"
          strokeWidth={strokeWidth}
        />
        <circle
          data-slot="progress-ring-indicator"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <span
        className={cn(
          'pointer-events-none absolute inline-flex items-center justify-center text-center text-sm font-semibold text-foreground',
          labelClassName,
        )}
        style={{ maxWidth: `${labelWidth}px` }}
      >
        {centerText}
      </span>
    </div>
  );
}
