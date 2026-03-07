import type { HabitConfig, HabitTrackingType } from '../types';

export const habitEmojiOptions = [
  '💧',
  '💊',
  '🥗',
  '😴',
  '🧘',
  '📚',
  '🥦',
  '🏃',
  '🏋️',
  '🚴',
  '🥾',
  '🧃',
  '☀️',
  '🌙',
  '🛌',
  '🧠',
  '🫀',
  '🥕',
  '🍎',
  '🥑',
  '🍵',
  '☕',
  '🧴',
  '🪥',
  '🧼',
  '🎯',
  '📝',
  '🎵',
  '🌿',
  '🚰',
] as const;

export const trackingTypeLabels: Record<HabitTrackingType, string> = {
  boolean: 'Check off',
  numeric: 'Count',
  time: 'Time',
};

export const trackingSurfaceClasses: Record<HabitTrackingType, string> = {
  boolean: 'bg-[var(--color-accent-pink)] text-[#8b2252]',
  numeric: 'bg-[var(--color-accent-cream)] text-[#8b6914]',
  time: 'bg-[var(--color-accent-mint)] text-[#1a6b45]',
};

export const defaultHabitConfigs: HabitConfig[] = [
  {
    id: 'hydrate',
    name: 'Hydrate',
    emoji: '💧',
    trackingType: 'numeric',
    target: 8,
    unit: 'glasses',
  },
  {
    id: 'vitamins',
    name: 'Take vitamins',
    emoji: '💊',
    trackingType: 'boolean',
    target: null,
    unit: null,
  },
  {
    id: 'protein',
    name: 'Protein goal',
    emoji: '🥗',
    trackingType: 'numeric',
    target: 120,
    unit: 'grams',
  },
  {
    id: 'sleep',
    name: 'Sleep',
    emoji: '😴',
    trackingType: 'time',
    target: 8,
    unit: 'hours',
  },
  {
    id: 'mobility',
    name: 'Mobility warm-up',
    emoji: '🧘',
    trackingType: 'boolean',
    target: null,
    unit: null,
  },
];
