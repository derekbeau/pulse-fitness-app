export type JournalEntryType =
  | 'post-workout'
  | 'milestone'
  | 'observation'
  | 'weekly-summary'
  | 'injury-update';

export type LinkedEntityType = 'workout' | 'activity' | 'habit' | 'injury';

export interface LinkedEntity {
  type: LinkedEntityType;
  id: string;
  name: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  title: string;
  type: JournalEntryType;
  content: string;
  linkedEntities: LinkedEntity[];
  createdBy: 'agent' | 'user';
}
