export type ActivityType =
  | 'walking'
  | 'running'
  | 'stretching'
  | 'yoga'
  | 'cycling'
  | 'swimming'
  | 'hiking'
  | 'other';

export type ActivityJournalEntryReference = {
  id: string;
  title: string;
};

export type Activity = {
  id: string;
  date: string;
  type: ActivityType;
  name: string;
  durationMinutes: number;
  notes: string;
  linkedJournalEntries: ActivityJournalEntryReference[];
};
