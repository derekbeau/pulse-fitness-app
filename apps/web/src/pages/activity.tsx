import { Activity } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ActivityType = 'Stretching' | 'Walking' | 'Yoga';

type ActivityPreview = {
  description: string;
  duration: string;
  note?: string;
  type: ActivityType;
};

const badgeClassesByType: Record<ActivityType, string> = {
  Stretching: 'border-transparent bg-sky-200 text-slate-950',
  Walking: 'border-transparent bg-emerald-200 text-slate-950',
  Yoga: 'border-transparent bg-violet-200 text-slate-950',
};

const sampleActivities: ActivityPreview[] = [
  {
    description: 'Mobility session',
    duration: '20 min',
    note: 'Morning mobility routine - hip openers and shoulder work',
    type: 'Stretching',
  },
  {
    description: 'Outdoor walk',
    duration: '45 min',
    note: 'Afternoon walk around the park, 3.2 km',
    type: 'Walking',
  },
  {
    description: 'Vinyasa flow',
    duration: '30 min',
    note: 'Vinyasa flow session, focused on balance poses',
    type: 'Yoga',
  },
];

export function ActivityPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-[var(--color-accent-mint)] p-3 text-slate-950 shadow-sm">
            <Activity aria-hidden="true" className="size-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-primary">Activity</h1>
            <div className="space-y-1">
              <p className="text-lg font-medium text-foreground">Coming Soon</p>
              <p className="max-w-2xl text-sm text-muted">
                Log walks, stretching, yoga, and other movement activities.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Preview activities
        </p>
        <div className="grid gap-4 xl:grid-cols-3">
          {sampleActivities.map((activity) => (
            <Card
              key={`${activity.type}-${activity.duration}`}
              className="border-dashed bg-card/70 opacity-85"
            >
              <CardHeader className="gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={cn(
                          'cursor-default px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]',
                          badgeClassesByType[activity.type],
                        )}
                        variant="secondary"
                      >
                        {activity.type}
                      </Badge>
                      <Badge
                        className="cursor-default border-border/80 bg-background/80 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted"
                        variant="outline"
                      >
                        Preview
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-xl font-semibold text-foreground">{activity.description}</h2>
                      <CardDescription>{activity.note ?? 'Sample activity note coming soon.'}</CardDescription>
                    </div>
                  </div>
                  <div className="min-w-20 rounded-xl bg-secondary/70 px-3 py-2 text-right">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      Duration
                    </p>
                    <p className="text-2xl font-semibold text-foreground">{activity.duration}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm leading-6 text-muted">
                  Future entries will capture the activity type, time spent, and optional context
                  about how the session felt.
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
