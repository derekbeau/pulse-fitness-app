import { Link, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { JournalEntryDetail, mockJournalEntries } from '@/features/journal';

export function JournalEntryPage() {
  const { entryId = '' } = useParams();
  const entry = mockJournalEntries.find((candidate) => candidate.id === entryId);

  if (!entry) {
    return (
      <Card>
        <CardHeader className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Journal entry not found</h1>
          <p className="text-sm text-muted">
            The requested journal entry is not available in the current prototype data.
          </p>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full sm:w-auto">
            <Link to="/journal">Back to Journal</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <JournalEntryDetail entry={entry} />;
}
