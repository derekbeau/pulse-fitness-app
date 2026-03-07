import { BookOpen } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type JournalEntryType = 'milestone' | 'observation' | 'weekly_summary';

type JournalSampleEntry = {
  contentPreview: string;
  date: string;
  title: string;
  type: JournalEntryType;
};

const entryDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const badgeClassesByType: Record<JournalEntryType, string> = {
  milestone:
    'border-transparent bg-[var(--color-accent-mint)] text-on-mint dark:bg-emerald-500/20 dark:text-emerald-400',
  observation:
    'border-transparent bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
  weekly_summary:
    'border-transparent bg-[var(--color-accent-pink)] text-on-pink dark:bg-pink-500/20 dark:text-pink-400',
};

const journalSampleEntries: JournalSampleEntry[] = [
  {
    contentPreview:
      'Noticed a significant boost in morning energy after switching to earlier bedtime and keeping caffeine before noon.',
    date: '2026-02-16',
    title: 'Feeling More Energetic',
    type: 'observation',
  },
  {
    contentPreview:
      'Ran my first 5K today in 28:32. Started training 8 weeks ago and finally felt confident pushing the last kilometer.',
    date: '2026-02-28',
    title: 'First 5K Completed!',
    type: 'milestone',
  },
  {
    contentPreview:
      'Consistent with all habits this week. Weight trending down slightly, workouts felt steady, and recovery improved by Friday.',
    date: '2026-03-02',
    title: 'Week 12 Summary',
    type: 'weekly_summary',
  },
];

function formatJournalEntryDate(date: string) {
  // Parse date-only strings at noon local time to avoid timezone shifts when formatting preview content.
  return entryDateFormatter.format(new Date(`${date}T12:00:00`));
}

export function JournalPage() {
  return (
    <section className="space-y-6">
      <header className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-[var(--color-accent-cream)] p-3 text-on-cream shadow-sm dark:bg-amber-500/20 dark:text-amber-400">
            <BookOpen aria-hidden="true" className="size-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-primary">Journal</h1>
            <div className="space-y-1">
              <p className="text-lg font-medium text-foreground">Coming Soon</p>
              <p className="max-w-2xl text-sm text-muted">
                Track your health observations, milestones, and weekly reflections.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Preview entries
        </p>
        <div className="grid gap-4 xl:grid-cols-3">
          {journalSampleEntries.map((entry) => (
            <Card
              key={`${entry.date}-${entry.title}`}
              className="border-dashed bg-card/70 opacity-90"
            >
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Badge
                    className={cn(
                      'cursor-default px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]',
                      badgeClassesByType[entry.type],
                    )}
                    variant="secondary"
                  >
                    {entry.type}
                  </Badge>
                  <CardDescription className="text-xs font-medium uppercase tracking-[0.14em]">
                    {formatJournalEntryDate(entry.date)}
                  </CardDescription>
                </div>
                <CardTitle aria-level={2} className="text-xl text-foreground" role="heading">
                  {entry.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="max-h-[4.5rem] overflow-hidden text-sm leading-6 text-muted">
                  {entry.contentPreview}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
