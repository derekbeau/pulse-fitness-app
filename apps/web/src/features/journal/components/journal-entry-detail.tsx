import { ArrowLeft, Sparkles } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import {
  formatEntryType,
  formatJournalEntryDate,
  getJournalEntrySubtitle,
} from '../lib/formatters';
import { renderJournalMarkdown } from '../lib/markdown';
import { journalBadgeClassesByType } from '../lib/presentation';
import type { JournalEntry } from '../types';
import { EntityChip } from './entity-chip';

type JournalEntryDetailProps = {
  entry: JournalEntry;
};

export function JournalEntryDetail({ entry }: JournalEntryDetailProps) {
  const hasLinkedEntities = entry.linkedEntities.length > 0;

  return (
    <section className="space-y-6">
      <Button asChild className="gap-2" size="sm" variant="ghost">
        <Link to="/journal">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to Journal
        </Link>
      </Button>

      <Card className="gap-4 overflow-hidden border-transparent bg-card/80 py-0">
        <div className="space-y-4 bg-[var(--color-accent-cream)] px-6 py-6 text-on-cream dark:border-b dark:border-border dark:bg-card dark:text-foreground">
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
              <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70 dark:text-muted dark:opacity-100">
                {formatJournalEntryDate(entry.date)}
              </p>
              <Badge
                className="border-white/45 bg-white/55 dark:border-border dark:bg-secondary"
                variant="outline"
              >
                Created by {entry.createdBy}
              </Badge>
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground dark:text-foreground">
                {entry.title}
              </h1>
              <p className="max-w-3xl text-sm opacity-80 sm:text-base dark:text-muted dark:opacity-100">
                {getJournalEntrySubtitle(entry.type)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle>Entry Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              'max-w-3xl space-y-4 text-sm leading-7 text-foreground',
              '[&_br]:block [&_br]:content-[""] [&_h2]:mt-1 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight',
              '[&_code]:rounded-sm [&_code]:bg-secondary/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] [&_code]:text-foreground',
              '[&_em]:font-medium [&_em]:italic [&_em]:text-foreground',
              '[&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-semibold',
              '[&_p]:text-muted [&_strong]:font-semibold [&_strong]:text-foreground',
              '[&_ul]:space-y-2 [&_ul]:pl-5 [&_li]:list-disc [&_li]:text-muted',
            )}
            dangerouslySetInnerHTML={{ __html: renderJournalMarkdown(entry.content) }}
          />
        </CardContent>
      </Card>

      {hasLinkedEntities && (
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="flex items-center gap-2">
              <Sparkles aria-hidden="true" className="size-5 text-primary" />
              Linked To
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {entry.linkedEntities.map((entity) => (
                <EntityChip entity={entity} key={`${entry.id}-${entity.type}-${entity.id}`} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
