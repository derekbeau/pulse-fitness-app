import type { JournalEntry, JournalEntryType, LinkedEntityType } from '../types';

export type JournalTypeFilter = 'all' | JournalEntryType;
export type JournalEntityFilter = 'all' | LinkedEntityType;

export type JournalFilterOption<T extends string> = {
  label: string;
  value: T;
};

export const journalTypeFilterOptions: JournalFilterOption<JournalTypeFilter>[] = [
  { label: 'All', value: 'all' },
  { label: 'Post-Workout', value: 'post-workout' },
  { label: 'Milestone', value: 'milestone' },
  { label: 'Observation', value: 'observation' },
  { label: 'Weekly Summary', value: 'weekly-summary' },
  { label: 'Injury Update', value: 'injury-update' },
];

export const journalEntityFilterOptions: JournalFilterOption<JournalEntityFilter>[] = [
  { label: 'All', value: 'all' },
  { label: 'Workouts', value: 'workout' },
  { label: 'Activities', value: 'activity' },
  { label: 'Habits', value: 'habit' },
  { label: 'Injuries', value: 'injury' },
];

export function sortJournalEntriesNewestFirst(entries: JournalEntry[]) {
  return [...entries].sort((left, right) => right.date.localeCompare(left.date));
}

type FilterJournalEntriesArgs = {
  entityFilter: JournalEntityFilter;
  typeFilter: JournalTypeFilter;
};

export function filterJournalEntries(
  entries: JournalEntry[],
  { entityFilter, typeFilter }: FilterJournalEntriesArgs,
) {
  return entries.filter((entry) => {
    const matchesType = typeFilter === 'all' || entry.type === typeFilter;
    const matchesEntity =
      entityFilter === 'all' ||
      entry.linkedEntities.some((linkedEntity) => linkedEntity.type === entityFilter);

    return matchesType && matchesEntity;
  });
}
