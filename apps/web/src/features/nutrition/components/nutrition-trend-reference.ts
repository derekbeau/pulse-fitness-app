import { chartDateKeyInTimeZone } from '@pulse/shared';

export function nutritionTrendReferenceDate(instant: Date | number, timeZone: string) {
  return chartDateKeyInTimeZone(instant, timeZone);
}
