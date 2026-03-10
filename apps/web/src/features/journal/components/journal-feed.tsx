import { useState } from 'react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { formatEntryType, formatJournalEntryDate, getJournalEntryPreview } from '../lib/formatters';
import {
  filterJournalEntries,
  journalEntityFilterOptions,
  journalTypeFilterOptions,
  sortJournalEntriesNewestFirst,
  type JournalEntityFilter,
  type JournalFilterOption,
  type JournalTypeFilter,
} from '../lib/filters';
import { journalBadgeClassesByType } from '../lib/presentation';
import type { JournalEntry } from '../types';
import { EntityChip } from './entity-chip';

type JournalFeedProps = {
  entries: JournalEntry[];
  getEntryHref?: (entryId: string) => string;
};

export function JournalFeed({ entries, getEntryHref }: JournalFeedProps) {
  const [typeFilter, setTypeFilter] = useState<JournalTypeFilter>('all');
  const [entityFilter, setEntityFilter] = useState<JournalEntityFilter>('all');

  const entriesNewestFirst = sortJournalEntriesNewestFirst(entries);
  const filteredEntries = filterJournalEntries(entriesNewestFirst, {
    entityFilter,
    typeFilter,
  });
  const hasActiveFilters = entityFilter !== 'all' || typeFilter !== 'all';

  return (
    <div className="space-y-5">
      <Card className="border-border/70 bg-card/80 shadow-sm">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Feed Filters
              </p>
              <p className="text-sm text-muted">
                Showing {filteredEntries.length} of {entriesNewestFirst.length} entries
              </p>
            </div>
            {hasActiveFilters && (
              <Button
                className="w-full sm:w-auto"
                size="sm"
                type="button"
                variant="outline"
                onClick={() => {
                  setTypeFilter('all');
                  setEntityFilter('all');
                }}
              >
                Reset filters
              </Button>
            )}
          </div>

          <FilterRow
            label="Type"
            options={journalTypeFilterOptions}
            selectedValue={typeFilter}
            onSelect={setTypeFilter}
          />
          <FilterRow
            label="Linked entity"
            options={journalEntityFilterOptions}
            selectedValue={entityFilter}
            onSelect={setEntityFilter}
          />
        </CardContent>
      </Card>

      <div aria-label="Journal feed" className="space-y-4" role="list">
        {filteredEntries.length === 0 ? (
          <Card
            className="border-dashed border-border/70 bg-card/95 shadow-sm"
            data-slot="journal-empty-state"
            role="listitem"
          >
            <CardContent className="py-8 text-center text-sm text-muted">
              No journal entries match the current filters.
            </CardContent>
          </Card>
        ) : (
          filteredEntries.map((entry) => (
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
                    <EntityChip entity={entity} key={`${entity.type}-${entity.id}`} />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

type FilterRowProps<T extends string> = {
  label: string;
  onSelect: (value: T) => void;
  options: JournalFilterOption<T>[];
  selectedValue: T;
};

function FilterRow<T extends string>({
  label,
  onSelect,
  options,
  selectedValue,
}: FilterRowProps<T>) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
      </div>
      <div
        aria-label={`${label} filter`}
        className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="toolbar"
      >
        {options.map((option) => {
          const isActive = option.value === selectedValue;

          return (
            <button
              key={option.value}
              aria-pressed={isActive}
              className={cn(
                'cursor-pointer whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-transparent bg-[var(--color-accent-mint)] text-[var(--color-on-accent)] shadow-sm'
                  : 'border-border/70 bg-background/70 text-muted hover:border-primary/35 hover:text-foreground',
              )}
              type="button"
              onClick={() => onSelect(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
