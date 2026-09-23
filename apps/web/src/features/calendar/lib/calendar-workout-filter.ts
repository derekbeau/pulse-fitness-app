import type { CalendarRuntimeItem } from '@pulse/shared';

// Workouts is a view of the same canonical record ids, never a second schedule.
export const calendarWorkoutItems = (items: readonly CalendarRuntimeItem[]) =>
  items.filter((item) => item.domain === 'workout');
