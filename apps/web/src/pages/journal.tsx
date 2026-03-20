import { BookOpen } from 'lucide-react';

import { PageHeader } from '@/components/layout/page-header';
import { PreviewBanner } from '@/components/ui/preview-banner';
import { JournalFeed, mockJournalEntries } from '@/features/journal';

export function JournalPage() {
  return (
    <section className="space-y-6">
      <div className="mx-auto w-full max-w-6xl">
        <PreviewBanner />
      </div>
      <PageHeader
        description="Review coaching notes, milestones, observations, and injury updates in one chronological feed."
        icon={
          <div className="rounded-2xl bg-[var(--color-accent-cream)] p-3 text-on-cream shadow-sm dark:bg-amber-500/20 dark:text-amber-400">
            <BookOpen aria-hidden="true" className="size-6" />
          </div>
        }
        title="Journal"
      />
      <JournalFeed entries={mockJournalEntries} getEntryHref={(entryId) => `/journal/${entryId}`} />
    </section>
  );
}
