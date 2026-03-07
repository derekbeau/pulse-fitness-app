export type ConditionStatus = 'active' | 'monitoring' | 'resolved';

export type TimelineEventType = 'onset' | 'flare' | 'improvement' | 'treatment' | 'milestone';

export type TimelineEvent = {
  date: string;
  event: string;
  type: TimelineEventType;
  notes?: string;
};

export type ProtocolStatus = 'active' | 'discontinued' | 'completed';

export type Protocol = {
  id: string;
  name: string;
  status: ProtocolStatus;
  startDate: string;
  endDate?: string;
  notes: string;
};

export type LinkedJournalEntry = {
  id: string;
  title: string;
  date: string;
};

export type SeverityPoint = {
  date: string;
  value: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
};

export type HealthCondition = {
  id: string;
  name: string;
  bodyArea: string;
  status: ConditionStatus;
  onsetDate: string;
  description: string;
  timeline: TimelineEvent[];
  protocols: Protocol[];
  linkedJournalEntries: LinkedJournalEntry[];
  severityHistory: SeverityPoint[];
};
