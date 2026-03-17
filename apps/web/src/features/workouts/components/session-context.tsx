import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  HeartPulse,
  Layers3,
  MoonStar,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { PreviewBanner } from '@/components/ui/preview-banner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import type {
  ActiveWorkoutPhaseBadge,
  ActiveWorkoutSessionContext,
  ActiveWorkoutSleepStatus,
} from '../types';

const recentSessionDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
});

const sleepStatusConfig: Record<
  ActiveWorkoutSleepStatus,
  { className: string; description: string; iconClassName: string; label: string }
> = {
  poor: {
    className: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300',
    description: 'Recovery is limited. Reduce load or volume if the session feels off.',
    iconClassName: 'text-red-600 dark:text-red-300',
    label: 'Poor sleep',
  },
  fair: {
    className: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    description: 'Recovery is moderate. Keep intensity honest and adjust if needed.',
    iconClassName: 'text-amber-600 dark:text-amber-300',
    label: 'Fair sleep',
  },
  good: {
    className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    description: "Recovery looks stable for today's training.",
    iconClassName: 'text-emerald-600 dark:text-emerald-300',
    label: 'Good sleep',
  },
  great: {
    className: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    description: 'Fully recovered. Good day to push the top end of the plan.',
    iconClassName: 'text-sky-600 dark:text-sky-300',
    label: 'Great sleep',
  },
};

const phaseBadgeConfig: Record<ActiveWorkoutPhaseBadge, string> = {
  moderate: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  rebuild: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  recovery: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  test: 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
};

const XL_BREAKPOINT_QUERY = '(min-width: 1280px)';

type SessionContextProps = {
  className?: string;
  context: ActiveWorkoutSessionContext;
};

export function SessionContext({ className, context }: SessionContextProps) {
  const [isExpanded, setIsExpanded] = useState(() => shouldStartExpanded());
  const sleepStatus = sleepStatusConfig[context.sleepStatus];
  const phaseBadge = inferPhaseBadge(context.trainingPhaseLabel);
  const hasPreviewCards = true;

  return (
    <section
      aria-label="Session context"
      className={cn('rounded-2xl border border-border bg-card p-3 shadow-sm', className)}
    >
      <button
        aria-controls="session-context-panel"
        aria-expanded={isExpanded}
        className="flex w-full cursor-pointer items-center justify-between rounded-xl px-2 py-2 text-left"
        onClick={() => setIsExpanded((current) => !current)}
        type="button"
      >
        <div>
          <h2 className="text-base font-semibold text-foreground">Session Context</h2>
          <p className="text-xs text-muted">Training context and readiness notes</p>
        </div>
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 text-muted transition-transform', isExpanded && 'rotate-180')}
        />
      </button>

      <div className="space-y-3 pt-2" hidden={!isExpanded} id="session-context-panel">
        {hasPreviewCards ? (
          <PreviewBanner
            message="Some cards are in preview — sample data is shown and won't be saved."
            storageKey="pulse-preview-banner-dismissed:active-workout-session-context"
          />
        ) : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ContextCard
            className="w-full"
            description="Last 3 sessions"
            icon={CalendarClock}
            title="Recent Training"
          >
            {context.recentSessions.length > 0 ? (
              <ul className="space-y-2.5">
                {context.recentSessions.slice(0, 3).map((session) => (
                  <li className="flex items-start justify-between gap-3" key={session.id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{session.name}</p>
                      <p className="text-xs text-muted">
                        {recentSessionDateFormatter.format(parseDateKey(session.date))}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs font-medium text-muted">
                      {formatDaysSince(session.date)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No recent completed sessions yet.</p>
            )}
          </ContextCard>

          <ContextCard
            className="w-full"
            description="Sleep and readiness"
            icon={HeartPulse}
            preview
            title="Recovery Status"
          >
            <div
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-3 py-3',
                sleepStatus.className,
              )}
            >
              <MoonStar aria-hidden="true" className={cn('size-4', sleepStatus.iconClassName)} />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">{sleepStatus.label}</p>
                <p className="text-xs text-muted">{sleepStatus.description}</p>
              </div>
            </div>
          </ContextCard>

          <ContextCard
            className="w-full"
            description="Conditions to respect today"
            icon={AlertTriangle}
            preview
            title="Active Injuries"
          >
            <div className="space-y-3">
              <Badge className="w-fit border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                {`${context.activeInjuries.length} active`}
              </Badge>
              {context.activeInjuries.length > 0 ? (
                <ul className="space-y-2">
                  {context.activeInjuries.map((injury) => (
                    <li className="flex items-start gap-2" key={injury.id}>
                      <AlertTriangle
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300"
                      />
                      <span className="text-sm text-foreground">{injury.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No active conditions</p>
              )}
            </div>
          </ContextCard>

          <ContextCard
            className="w-full"
            description="Current program block"
            icon={Layers3}
            preview
            title="Training Phase"
          >
            <div className="space-y-3">
              <Badge className={cn('w-fit border-transparent', phaseBadgeConfig[phaseBadge])}>
                {formatPhaseBadgeLabel(phaseBadge)}
              </Badge>
              <p className="text-sm text-foreground">{context.trainingPhaseLabel}</p>
            </div>
          </ContextCard>
        </div>
      </div>
    </section>
  );
}

function ContextCard({
  className,
  children,
  description,
  icon: Icon,
  preview = false,
  title,
}: {
  className?: string;
  children: ReactNode;
  description: string;
  icon: typeof CalendarClock;
  preview?: boolean;
  title: string;
}) {
  return (
    <Card className={cn('gap-0 border-border/70 bg-secondary/25 py-0 shadow-sm', className)}>
      <CardHeader className="gap-3 border-b border-border/80 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{title}</CardTitle>
              {preview ? (
                <Badge
                  className="border-amber-500/30 bg-amber-500/10 text-[10px] tracking-wide text-amber-700 uppercase dark:text-amber-300"
                  variant="outline"
                >
                  Preview
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted">{description}</p>
          </div>
          <div className="rounded-full bg-secondary/70 p-2 text-muted">
            <Icon aria-hidden="true" className="size-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4 pb-5">{children}</CardContent>
    </Card>
  );
}

function formatDaysSince(dateKey: string) {
  const daysSince = Math.max(0, getDayDifference(parseDateKey(dateKey), new Date()));

  if (daysSince === 0) {
    return 'Today';
  }

  if (daysSince === 1) {
    return '1 day ago';
  }

  return `${daysSince} days ago`;
}

function getDayDifference(from: Date, to: Date) {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());

  return Math.floor((end - start) / 86_400_000);
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function inferPhaseBadge(trainingPhaseLabel: string): ActiveWorkoutPhaseBadge {
  const label = trainingPhaseLabel.toLowerCase();

  if (label.includes('rebuild')) {
    return 'rebuild';
  }

  if (label.includes('recovery')) {
    return 'recovery';
  }

  if (label.includes('test')) {
    return 'test';
  }

  return 'moderate';
}

function formatPhaseBadgeLabel(phase: ActiveWorkoutPhaseBadge) {
  return `${phase.charAt(0).toUpperCase()}${phase.slice(1)} Phase`;
}

function shouldStartExpanded() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(XL_BREAKPOINT_QUERY).matches;
}
