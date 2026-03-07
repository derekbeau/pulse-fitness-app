export { EntityChip } from './components/entity-chip';
export { JournalFeed } from './components/journal-feed';
export { JournalEntryDetail } from './components/journal-entry-detail';
// TODO: remove this export when journal entries are query-backed; pages should use hooks, not static data.
export { mockJournalEntries } from './lib/mock-data';
export type { JournalEntry, JournalEntryType, LinkedEntity, LinkedEntityType } from './types';
