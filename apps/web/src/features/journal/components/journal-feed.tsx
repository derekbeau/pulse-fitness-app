import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { mockJournalEntries } from '../lib/mock-data';
import type { JournalEntryType } from '../types';
import { EntityChip } from './entity-chip';

const entryDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const badgeClassesByType: Record<JournalEntryType, string> = {
  'injury-update':
    'border-transparent bg-red-200 text-red-950 dark:bg-red-500/20 dark:text-red-300',
  milestone:
    'border-transparent bg-amber-200 text-amber-950 dark:bg-amber-500/20 dark:text-amber-300',
  observation:
    'border-transparent bg-sky-200 text-sky-950 dark:bg-sky-500/20 dark:text-sky-300',
  'post-workout':
    'border-transparent bg-[var(--color-accent-mint)] text-[var(--color-on-accent)] dark:bg-emerald-500/20 dark:text-emerald-300',
  'weekly-summary':
    'border-transparent bg-violet-200 text-violet-950 dark:bg-violet-500/20 dark:text-violet-300',
};

function formatJournalEntryDate(date: string) {
  return entryDateFormatter.format(new Date(`${date}T12:00:00`));
}

function formatEntryType(type: JournalEntryType) {
  return type.replaceAll('-', ' ');
}

function getPreview(content: string, maxLength = 132) {
  const normalized = content
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_`-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const truncated = normalized.slice(0, maxLength);
  const safeSlice = truncated.includes(' ') ? truncated.slice(0, truncated.lastIndexOf(' ')) : truncated;

  return `${safeSlice.trimEnd()}...`;
}

const entriesNewestFirst = [...mockJournalEntries].sort((left, right) =>
  right.date.localeCompare(left.date),
);

export function JournalFeed() {
  return (
    <div aria-label="Journal feed" className="space-y-4">
      {entriesNewestFirst.map((entry) => (
        <Card
          key={entry.id}
          className="overflow-hidden border-border/70 bg-card/95 shadow-sm"
          data-slot="journal-entry-card"
        >
          <CardHeader className="gap-4 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={cn(
                      'cursor-default px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]',
                      badgeClassesByType[entry.type],
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
                  className="text-xl leading-tight text-foreground"
                  role="heading"
                >
                  {entry.title}
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <p className="max-w-3xl text-sm leading-6 text-muted">{getPreview(entry.content)}</p>
            <div className="flex flex-wrap gap-2">
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
