import { ArrowLeftIcon, CalendarDaysIcon, MapPinIcon } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProtocolList } from './protocol-list';
import { SeverityChart } from './severity-chart';
import type {
  ConditionStatus,
  HealthCondition,
  LinkedJournalEntryType,
  TimelineEventType,
} from '../types';

type ConditionDetailProps = {
  condition: HealthCondition;
};

const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const STATUS_META: Record<
  ConditionStatus,
  {
    badgeClassName: string;
    label: string;
  }
> = {
  active: {
    badgeClassName:
      'border-transparent bg-destructive text-white dark:bg-destructive/70 dark:text-white',
    label: 'Active',
  },
  monitoring: {
    badgeClassName:
      'border-transparent bg-amber-200 text-amber-950 dark:bg-amber-500/20 dark:text-amber-300',
    label: 'Monitoring',
  },
  resolved: {
    badgeClassName:
      'border-transparent bg-emerald-200 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-300',
    label: 'Resolved',
  },
};

const TIMELINE_META: Record<
  TimelineEventType,
  {
    badgeClassName: string;
    dotClassName: string;
    label: string;
  }
> = {
  onset: {
    badgeClassName:
      'border-transparent bg-rose-200 text-rose-950 dark:bg-rose-500/20 dark:text-rose-300',
    dotClassName: 'bg-rose-500 ring-4 ring-rose-500/15',
    label: 'Onset',
  },
  flare: {
    badgeClassName:
      'border-transparent bg-orange-200 text-orange-950 dark:bg-orange-500/20 dark:text-orange-300',
    dotClassName: 'bg-orange-500 ring-4 ring-orange-500/15',
    label: 'Flare',
  },
  improvement: {
    badgeClassName:
      'border-transparent bg-emerald-200 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-300',
    dotClassName: 'bg-emerald-500 ring-4 ring-emerald-500/15',
    label: 'Improvement',
  },
  treatment: {
    badgeClassName:
      'border-transparent bg-sky-200 text-sky-950 dark:bg-sky-500/20 dark:text-sky-300',
    dotClassName: 'bg-sky-500 ring-4 ring-sky-500/15',
    label: 'Treatment',
  },
  milestone: {
    badgeClassName:
      'border-transparent bg-[var(--color-accent-cream)] text-[var(--color-on-accent)] dark:bg-yellow-500/20 dark:text-yellow-300',
    dotClassName: 'bg-yellow-500 ring-4 ring-yellow-500/15',
    label: 'Milestone',
  },
};

const JOURNAL_META: Record<
  LinkedJournalEntryType,
  {
    badgeClassName: string;
    label: string;
  }
> = {
  milestone: {
    badgeClassName:
      'border-transparent bg-[var(--color-accent-mint)] text-[var(--color-on-accent)] dark:bg-emerald-500/20 dark:text-emerald-300',
    label: 'Milestone',
  },
  observation: {
    badgeClassName:
      'border-transparent bg-[var(--color-accent-cream)] text-[var(--color-on-accent)] dark:bg-amber-500/20 dark:text-amber-300',
    label: 'Observation',
  },
  weekly_summary: {
    badgeClassName:
      'border-transparent bg-[var(--color-accent-pink)] text-[var(--color-on-accent)] dark:bg-pink-500/20 dark:text-pink-300',
    label: 'Weekly Summary',
  },
};

function parseDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

function formatDate(date: string) {
  return fullDateFormatter.format(parseDate(date));
}

function sortByNewest<T extends { date: string }>(items: T[]) {
  return [...items].sort(
    (left, right) => parseDate(right.date).getTime() - parseDate(left.date).getTime(),
  );
}

export function ConditionDetail({ condition }: ConditionDetailProps) {
  const timeline = sortByNewest(condition.timeline);
  const linkedEntries = sortByNewest(condition.linkedJournalEntries);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-10">
      <Button asChild className="w-fit gap-2" size="sm" variant="ghost">
        <Link to="/profile/injuries">
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Back to Health Tracking
        </Link>
      </Button>

      <Card className="overflow-hidden border-transparent bg-gradient-to-br from-[var(--color-accent-pink)]/35 via-card to-[var(--color-accent-cream)]/45 py-0 shadow-sm dark:border-border/60 dark:from-secondary dark:via-card dark:to-secondary">
        <CardHeader className="gap-5 border-b border-border/50 py-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Condition overview
              </p>
              <div className="space-y-2">
                <CardTitle className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
                  {condition.name}
                </CardTitle>
                <CardDescription className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  {condition.description}
                </CardDescription>
              </div>
            </div>

            <Badge className={STATUS_META[condition.status].badgeClassName}>
              {STATUS_META[condition.status].label}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="grid gap-3 px-6 py-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Body area
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <MapPinIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              {condition.bodyArea}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Onset date
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <CalendarDaysIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              {formatDate(condition.onsetDate)}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="py-6 shadow-sm">
        <CardHeader className="gap-2">
          <CardTitle className="text-2xl text-foreground">Timeline</CardTitle>
          <CardDescription>
            Most recent changes first to keep the current recovery picture visible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="relative space-y-5 border-l border-border/70 pl-6">
            {timeline.map((item) => (
              <li className="relative space-y-3" key={`${item.date}-${item.type}-${item.event}`}>
                <span
                  aria-hidden="true"
                  className={`absolute -left-[1.95rem] top-1.5 size-3 rounded-full ${TIMELINE_META[item.type].dotClassName}`}
                />
                <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {formatDate(item.date)}
                      </p>
                      <p className="text-sm leading-6 text-foreground">{item.event}</p>
                    </div>
                    <Badge className={TIMELINE_META[item.type].badgeClassName}>
                      {TIMELINE_META[item.type].label}
                    </Badge>
                  </div>
                  {item.notes ? (
                    <p className="rounded-xl bg-background/80 px-3 py-2 text-sm leading-6 text-muted-foreground">
                      {item.notes}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <ProtocolList protocols={condition.protocols} />

      <SeverityChart severityHistory={condition.severityHistory} timeline={condition.timeline} />

      <Card className="py-6 shadow-sm">
        <CardHeader className="gap-2">
          <CardTitle className="text-2xl text-foreground">Related Journal Entries</CardTitle>
          <CardDescription>
            Linked reflections, flare notes, and milestone updates for this condition.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkedEntries.length > 0 ? (
            <div className="grid gap-3">
              {linkedEntries.map((entry) => (
                <Link className="block cursor-pointer" key={entry.id} to={`/journal/${entry.id}`}>
                  <article className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          {formatDate(entry.date)}
                        </p>
                        <h3 className="text-sm font-semibold text-foreground sm:text-base">
                          {entry.title}
                        </h3>
                      </div>
                      <Badge className={JOURNAL_META[entry.type].badgeClassName}>
                        {JOURNAL_META[entry.type].label}
                      </Badge>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
              No journal entries linked to this condition
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
