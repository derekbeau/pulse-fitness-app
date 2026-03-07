import { BookOpen } from 'lucide-react';

import { JournalFeed } from '@/features/journal';

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
            <p className="max-w-2xl text-sm text-muted">
              Review coaching notes, milestones, observations, and injury updates in one
              chronological feed.
            </p>
          </div>
        </div>
      </header>
      <JournalFeed />
    </section>
  );
}
