import { chartDateCoordinate } from '@pulse/shared';

const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

const axisDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export function formatChartDate(dateKey: string): string {
  return fullDateFormatter.format(chartDateCoordinate(dateKey));
}

export function formatChartAxisDate(value: string | number): string {
  const coordinate = typeof value === 'string' ? chartDateCoordinate(value) : value;
  return axisDateFormatter.format(coordinate);
}
