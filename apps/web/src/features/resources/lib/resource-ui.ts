import type { ResourceType } from '../types';

export const resourceTypeBadgeClasses: Record<ResourceType, string> = {
  program:
    'border-transparent bg-violet-200 text-violet-950 dark:bg-violet-500/20 dark:text-violet-300',
  book: 'border-transparent bg-sky-200 text-sky-950 dark:bg-sky-500/20 dark:text-sky-300',
  creator:
    'border-transparent bg-emerald-200 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-300',
};

export const resourceTypeLabels: Record<ResourceType, string> = {
  program: 'Program',
  book: 'Book',
  creator: 'Creator',
};

// TODO: Replace this derived slug with a stored route id/slug when injury detail routes are backed by real data.
export function buildConditionDetailPath(conditionName: string) {
  const slug = conditionName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `/profile/injuries/${slug}`;
}
