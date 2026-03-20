import { useState } from 'react';
import { Activity as ActivityGlyph } from 'lucide-react';

import { PageHeader } from '@/components/layout/page-header';
import { PreviewBanner } from '@/components/ui/preview-banner';
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
      <div className="mx-auto w-full max-w-6xl">
        <PreviewBanner />
      </div>
      <PageHeader
        description="Review recent movement sessions outside structured workouts, with quick filtering by activity type and linked journal context."
        icon={
          <div className="rounded-2xl bg-[var(--color-accent-mint)] p-3 text-on-mint shadow-sm dark:bg-emerald-500/20 dark:text-emerald-400">
            <ActivityGlyph aria-hidden="true" className="size-6" />
          </div>
        }
        title="Activity"
      />

      <ActivityForm
        onSubmit={(activity) =>
          setActivities((current) => sortActivitiesByDateDesc([...current, activity]))
        }
      />

      <ActivityList activities={activities} />
    </section>
  );
}
