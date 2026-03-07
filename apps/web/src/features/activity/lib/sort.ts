import type { Activity } from '../types';

export function sortActivitiesByDateDesc(activities: Activity[]) {
  return [...activities].sort((left, right) => right.date.localeCompare(left.date));
}
