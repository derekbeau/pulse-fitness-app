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

const detailSubtitleByType: Record<JournalEntryType, string> = {
  'post-workout': 'Detailed session debrief with linked training and recovery context.',
  milestone: 'Milestone recap tying the win back to the work that drove it.',
  observation: 'Observation log capturing trends, signals, and linked context.',
  'weekly-summary': 'Weekly recap connecting standout sessions, recovery, and next steps.',
  'injury-update': 'Injury status update with rehab notes, guardrails, and linked context.',
};

export function getJournalEntrySubtitle(type: JournalEntryType) {
  return detailSubtitleByType[type];
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
