import { useState } from 'react';
import { Activity as ActivityGlyph } from 'lucide-react';

import {
  ActivityForm,
  ActivityList,
  mockActivities,
  sortActivitiesByDateDesc,
} from '@/features/activity';
import type { Activity } from '@/features/activity';

export function ActivityPage() {
  const [activities, setActivities] = useState<Activity[]>(() =>
    sortActivitiesByDateDesc(mockActivities),
  );

  return (
    <section className="space-y-6">
      <header className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-[var(--color-accent-mint)] p-3 text-on-mint shadow-sm dark:bg-emerald-500/20 dark:text-emerald-400">
            <ActivityGlyph aria-hidden="true" className="size-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-primary">Activity</h1>
            <p className="max-w-2xl text-sm text-muted">
              Review recent movement sessions outside structured workouts, with quick filtering by
              activity type and linked journal context.
            </p>
          </div>
        </div>
      </header>

      <ActivityForm
        onSubmit={(activity) =>
          setActivities((current) => sortActivitiesByDateDesc([...current, activity]))
        }
      />

      <ActivityList activities={activities} />
    </section>
  );
}
