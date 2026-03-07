import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { formatEntryType, formatJournalEntryDate, getJournalEntryPreview } from '../lib/formatters';
import { mockJournalEntries } from '../lib/mock-data';
import { journalBadgeClassesByType } from '../lib/presentation';
import { EntityChip } from './entity-chip';

const entriesNewestFirst = [...mockJournalEntries].sort((left, right) =>
  right.date.localeCompare(left.date),
);

type JournalFeedProps = {
  getEntryHref?: (entryId: string) => string;
};

export function JournalFeed({ getEntryHref }: JournalFeedProps) {
  return (
    <div aria-label="Journal feed" className="space-y-4" role="list">
      {entriesNewestFirst.map((entry) => (
        <Card
          key={entry.id}
          className={cn(
            'group relative overflow-hidden border-border/70 bg-card/95 shadow-sm',
            getEntryHref && 'transition-colors hover:border-primary/35',
          )}
          data-slot="journal-entry-card"
          role="listitem"
        >
          {getEntryHref && (
            <Link
              aria-label={`Open journal entry ${entry.title}`}
              className="absolute inset-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              to={getEntryHref(entry.id)}
            />
          )}

          <CardHeader className="pointer-events-none relative gap-4 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={cn(
                      'cursor-default px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]',
                      journalBadgeClassesByType[entry.type],
                    )}
                    variant="secondary"
                  >
                    {formatEntryType(entry.type)}
                  </Badge>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                    {formatJournalEntryDate(entry.date)}
                  </p>
                </div>
                <CardTitle
                  aria-level={2}
                  className="text-xl leading-tight text-foreground transition-colors group-hover:text-primary"
                  role="heading"
                >
                  {entry.title}
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pointer-events-none relative space-y-4 pt-0">
            <p className="max-w-3xl text-sm leading-6 text-muted">
              {getJournalEntryPreview(entry.content)}
            </p>
            <div className="pointer-events-auto flex flex-wrap gap-2">
              {entry.linkedEntities.map((entity) => (
                <EntityChip entity={entity} key={`${entry.id}-${entity.type}-${entity.id}`} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
