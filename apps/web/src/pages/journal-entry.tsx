import { useParams } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { JournalEntryDetail, mockJournalEntries } from '@/features/journal';

export function JournalEntryPage() {
  const { entryId = '' } = useParams();
  const entry = mockJournalEntries.find((candidate) => candidate.id === entryId);

  if (!entry) {
    return (
      <section className="space-y-4">
        <PageHeader
          description="The requested journal entry is not available in the current prototype data."
          showBack
          title="Journal entry not found"
        />
        <Card>
          <CardHeader className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">Entry unavailable</h2>
            <p className="text-sm text-muted">Return to the journal feed and select another entry.</p>
          </CardHeader>
        </Card>
      </section>
    );
  }

  return <JournalEntryDetail entry={entry} />;
}
