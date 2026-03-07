import { useState } from 'react';
import { BookOpen, CalendarDays, Clock3, SlidersHorizontal } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { parseDateKey } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

import {
  activityTypeOptions,
  getActivityTypeBadgeClasses,
  getActivityTypeIcon,
  getActivityTypeLabel,
} from '../lib/mock-data';
import { formatDuration } from '../lib/format';
import type { Activity, ActivityType } from '../types';

type ActivityListProps = {
  activities: Activity[];
};

type ActivityFilter = 'all' | ActivityType;

const activityDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatActivityDate(date: string) {
  return activityDateFormatter.format(parseDateKey(date));
}

export function ActivityList({ activities }: ActivityListProps) {
  const [selectedType, setSelectedType] = useState<ActivityFilter>('all');

  const filteredActivities =
    selectedType === 'all'
      ? activities
      : activities.filter((activity) => activity.type === selectedType);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          <SlidersHorizontal aria-hidden="true" className="size-3.5" />
          Type filter
        </div>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-2 pb-1">
            <Button
              aria-pressed={selectedType === 'all'}
              className={cn(
                'shrink-0 rounded-full border px-4',
                selectedType === 'all'
                  ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'border-border/70 bg-card/80 text-muted hover:bg-secondary hover:text-foreground',
              )}
              onClick={() => setSelectedType('all')}
              size="sm"
              variant="ghost"
            >
              All
            </Button>
            {activityTypeOptions.map((type) => {
              const ActivityTypeIcon = getActivityTypeIcon(type);

              return (
                <Button
                  key={type}
                  aria-pressed={selectedType === type}
                  className={cn(
                    'shrink-0 rounded-full border px-4',
                    selectedType === type
                      ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'border-border/70 bg-card/80 text-muted hover:bg-secondary hover:text-foreground',
                  )}
                  onClick={() => setSelectedType(type)}
                  size="sm"
                  variant="ghost"
                >
                  <ActivityTypeIcon aria-hidden="true" className="size-4" />
                  {getActivityTypeLabel(type)}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {filteredActivities.length === 0 ? (
        <Card className="border-dashed bg-card/70 py-0">
          <CardContent className="px-5 py-6 sm:px-6">
            <p className="text-sm font-medium text-foreground">No activities match this filter.</p>
            <p className="mt-1 text-sm text-muted">
              Try a different activity type to view the rest of the activity log.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredActivities.map((activity) => {
            const ActivityTypeIcon = getActivityTypeIcon(activity.type);

            return (
              <Card key={activity.id} className="gap-0 border-border/70 bg-card/95 py-0">
                <CardContent className="space-y-4 px-5 py-5 sm:px-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-secondary/80 text-primary shadow-sm">
                        <ActivityTypeIcon aria-hidden="true" className="size-5" />
                      </div>
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            className={cn(
                              'cursor-default gap-1.5 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]',
                              getActivityTypeBadgeClasses(activity.type),
                            )}
                            variant="secondary"
                          >
                            <ActivityTypeIcon aria-hidden="true" className="size-3.5" />
                            {getActivityTypeLabel(activity.type)}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          <h2 className="text-lg font-semibold text-foreground sm:text-xl">
                            {activity.name}
                          </h2>
                          {activity.notes ? (
                            <p className="max-w-3xl text-sm leading-6 text-muted line-clamp-2">
                              {activity.notes}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:min-w-72">
                      <div className="rounded-2xl border border-border/60 bg-background/75 px-3.5 py-3">
                        <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">
                          <Clock3 aria-hidden="true" className="size-3.5" />
                          Duration
                        </p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {formatDuration(activity.durationMinutes)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-background/75 px-3.5 py-3">
                        <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted">
                          <CalendarDays aria-hidden="true" className="size-3.5" />
                          Date
                        </p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {formatActivityDate(activity.date)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {activity.linkedJournalEntries.length > 0 ? (
                    <div className="space-y-2 border-t border-border/60 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                        Linked journal
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {activity.linkedJournalEntries.map((entry) => (
                          <Badge
                            key={entry.id}
                            className="cursor-default gap-1.5 rounded-full border-border/70 bg-background/80 px-3 py-1 text-xs font-medium text-muted"
                            variant="outline"
                          >
                            <BookOpen aria-hidden="true" className="size-3.5" />
                            {entry.title}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
