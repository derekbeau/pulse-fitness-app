import type { JournalEntryType } from '../types';

export const journalBadgeClassesByType: Record<JournalEntryType, string> = {
  'injury-update':
    'border-transparent bg-red-200 text-red-950 dark:bg-red-500/20 dark:text-red-300',
  milestone:
    'border-transparent bg-amber-200 text-amber-950 dark:bg-amber-500/20 dark:text-amber-300',
  observation: 'border-transparent bg-sky-200 text-sky-950 dark:bg-sky-500/20 dark:text-sky-300',
  'post-workout':
    'border-transparent bg-[var(--color-accent-mint)] text-[var(--color-on-accent)] dark:bg-emerald-500/20 dark:text-emerald-300',
  'weekly-summary':
    'border-transparent bg-violet-200 text-violet-950 dark:bg-violet-500/20 dark:text-violet-300',
};
