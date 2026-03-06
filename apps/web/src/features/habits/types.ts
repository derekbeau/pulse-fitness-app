export type HabitTrackingType = 'boolean' | 'numeric' | 'time';

export type HabitConfig = {
  id: string;
  name: string;
  emoji: string;
  trackingType: HabitTrackingType;
  target: number | null;
  unit: string | null;
};

export type HabitConfigDraft = Omit<HabitConfig, 'id'>;
