import type { JournalEntryType } from '../types';

const entryDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatJournalEntryDate(date: string) {
  return entryDateFormatter.format(new Date(`${date}T12:00:00`));
}

export function formatEntryType(type: JournalEntryType) {
  return type.replaceAll('-', ' ');
}

export function getJournalEntryPreview(content: string, maxLength = 132) {
  const normalized = content
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_`-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const truncated = normalized.slice(0, maxLength);
  const safeSlice = truncated.includes(' ')
    ? truncated.slice(0, truncated.lastIndexOf(' '))
    : truncated;

  return `${safeSlice.trimEnd()}...`;
}
