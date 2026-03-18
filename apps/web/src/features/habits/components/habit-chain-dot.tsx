import type { Habit, HabitEntry } from '@pulse/shared';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HabitDotEntry = {
  /** YYYY-MM-DD */
  date: string;
  /** Underlying entry record, if one exists */
  entry: HabitEntry | null;
  /** Whether the date is in the future */
  isFutureDate: boolean;
  /** Whether the habit was scheduled on this date */
  isScheduled: boolean;
  /** Resolved status */
  status: 'completed' | 'missed' | 'not_scheduled';
  /** 0–100 completion percentage (only meaningful for numeric/time habits) */
  completionPercent: number;
};

export type HabitDotSize = 'sm' | 'md';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const dateFormatterWithYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatDateLabel(date: string, includeYear = false): string {
  const formatter = includeYear ? dateFormatterWithYear : dateFormatter;
  return formatter.format(new Date(`${date}T00:00:00`));
}

function isQuotaHabit(habit: Habit): boolean {
  return habit.trackingType !== 'boolean' && habit.target != null;
}

function getProgress(entry: HabitDotEntry, habit: Habit): number | null {
  if (!isQuotaHabit(habit)) return null;
  return entry.completionPercent / 100;
}

function getStatusLabel(entry: HabitDotEntry): string {
  if (entry.status === 'completed') return 'Completed';
  if (entry.status === 'missed') return 'Missed';
  if (entry.isFutureDate) return 'Future';
  if (entry.isScheduled) return 'Not tracked';
  return 'Not scheduled';
}

function formatValueDetails(
  entry: HabitDotEntry,
  habit: Habit,
): { logged?: string; goal?: string } | null {
  if (entry.status === 'not_scheduled' && !entry.isScheduled) return null;
  if (habit.trackingType === 'boolean') return null;

  const value = entry.entry?.value;
  const target = habit.target;
  const unit = habit.unit ?? '';
  const result: { logged?: string; goal?: string } = {};

  if (value != null) {
    result.logged = `${value} ${unit}`.trim();
  }
  if (target != null) {
    result.goal = `${target} ${unit}`.trim();
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// ProgressRing (SVG arc inside a dot)
// ---------------------------------------------------------------------------

function ProgressRing({ progress, size }: { progress: number; size: number }) {
  const strokeWidth = size <= 14 ? 2.5 : 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <svg
      aria-hidden
      className="absolute inset-0 size-full -rotate-90"
      viewBox={`0 0 ${size} ${size}`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-muted)"
        strokeOpacity={0.4}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-accent-mint)"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// HabitChainDot — single dot
// ---------------------------------------------------------------------------

const SIZE_CLASSES: Record<HabitDotSize, string> = {
  sm: 'size-3.5',
  md: 'aspect-square max-w-8 w-full',
};

const SVG_SIZES: Record<HabitDotSize, number> = {
  sm: 14,
  md: 32,
};

type HabitChainDotProps = {
  entry: HabitDotEntry;
  habit: Habit;
  /** Visual size preset */
  size?: HabitDotSize;
  /** Highlight this dot (e.g. "today") */
  highlighted?: boolean;
  /** Called when the dot is clicked */
  onClick?: () => void;
  /** Show date with year in tooltip */
  includeYear?: boolean;
};

export function HabitChainDot({
  entry,
  habit,
  size = 'md',
  highlighted = false,
  onClick,
  includeYear = false,
}: HabitChainDotProps) {
  const quota = isQuotaHabit(habit);
  const progress = getProgress(entry, habit);
  const statusLabel = getStatusLabel(entry);
  const details = formatValueDetails(entry, habit);

  // Ring for quota habits with partial progress, including today's scheduled dot.
  const showRing =
    quota &&
    progress != null &&
    progress > 0 &&
    progress < 1 &&
    entry.isScheduled &&
    !entry.isFutureDate &&
    entry.status !== 'completed';

  const statusClass = showRing
    ? 'bg-transparent'
    : entry.status === 'completed'
      ? 'bg-[var(--color-accent-mint)]'
      : entry.status === 'missed'
        ? quota
          ? 'bg-[var(--color-muted)]/40'
          : 'bg-red-400/70 dark:bg-red-500/50'
        : 'bg-[var(--color-muted)]/40';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={`${habit.name} ${entry.date} ${statusLabel}`}
          className={cn(
            'relative cursor-pointer justify-self-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55',
            SIZE_CLASSES[size],
            statusClass,
            highlighted ? 'border-[var(--color-primary)]' : 'border-transparent',
          )}
          data-date={entry.date}
          data-status={entry.status}
          data-slot="habit-chain-day"
          disabled={entry.isFutureDate}
          onClick={onClick}
          type="button"
        >
          {showRing && progress != null ? (
            <ProgressRing progress={progress} size={SVG_SIZES[size]} />
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        <p className="font-medium">{formatDateLabel(entry.date, includeYear)}</p>
        <p className="text-xs text-muted-foreground">{statusLabel}</p>
        {details?.logged ? (
          <p className="text-xs text-muted-foreground">Logged: {details.logged}</p>
        ) : null}
        {details?.goal ? (
          <p className="text-xs text-muted-foreground">Goal: {details.goal}</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
