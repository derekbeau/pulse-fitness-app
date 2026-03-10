export type HabitTrackingType = 'boolean' | 'numeric' | 'time';
export type HabitFrequency = 'daily' | 'weekly' | 'specific_days';

export type HabitConfig = {
  id: string;
  name: string;
  emoji: string;
  trackingType: HabitTrackingType;
  target: number | null;
  unit: string | null;
  frequency: HabitFrequency;
  frequencyTarget: number | null;
  scheduledDays: number[] | null;
  pausedUntil: string | null;
};

export type HabitConfigDraft = Omit<HabitConfig, 'id'>;
