import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  HeartPulse,
  Layers3,
  MoonStar,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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

type SessionContextProps = {
  className?: string;
  context: ActiveWorkoutSessionContext;
};

export function SessionContext({ className, context }: SessionContextProps) {
  const sleepStatus = sleepStatusConfig[context.sleepStatus];
  const phaseBadge = inferPhaseBadge(context.trainingPhaseLabel);

  return (
    <section aria-label="Session context" className={className}>
      <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-4">
        <ContextCard
          className="min-w-[17rem] shrink-0 md:min-w-0"
          description="Last 3 sessions"
          icon={CalendarClock}
          title="Recent Training"
        >
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
        </ContextCard>

        <ContextCard
          className="min-w-[17rem] shrink-0 md:min-w-0"
          description="Sleep and readiness"
          icon={HeartPulse}
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
          className="min-w-[17rem] shrink-0 md:min-w-0"
          description="Conditions to respect today"
          icon={AlertTriangle}
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
          className="min-w-[17rem] shrink-0 md:min-w-0"
          description="Current program block"
          icon={Layers3}
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
    </section>
  );
}

function ContextCard({
  className,
  children,
  description,
  icon: Icon,
  title,
}: {
  className?: string;
  children: ReactNode;
  description: string;
  icon: typeof CalendarClock;
  title: string;
}) {
  return (
    <Card className={cn('gap-0 py-0 shadow-sm', className)}>
      <CardHeader className="gap-3 border-b border-border/80 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
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
