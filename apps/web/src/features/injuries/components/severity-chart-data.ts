import { chartDateCoordinate } from '@pulse/shared';

import type { SeverityPoint, TimelineEvent, TimelineEventType } from '../types';

export type SeverityChartDatum = {
  date: string;
  events: TimelineEvent[];
  observed: boolean;
  primaryEventType?: TimelineEventType;
  timestamp: number;
  value: number | null;
};

export function buildSeverityChartData(
  severityHistory: SeverityPoint[],
  timeline: TimelineEvent[],
): SeverityChartDatum[] {
  const sortedHistory = [...severityHistory].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const historyByDate = new Map(sortedHistory.map((entry) => [entry.date, entry.value]));
  const eventMap = new Map<string, TimelineEvent[]>();
  for (const item of timeline) {
    eventMap.set(item.date, [...(eventMap.get(item.date) ?? []), item]);
  }
  const severitySeries = sortedHistory.map((entry) => ({
    timestamp: chartDateCoordinate(entry.date),
    value: entry.value,
  }));
  const dates = Array.from(new Set([...historyByDate.keys(), ...eventMap.keys()])).sort();

  return dates.map((date) => {
    const events = eventMap.get(date) ?? [];
    const timestamp = chartDateCoordinate(date);
    return {
      date,
      events,
      observed: historyByDate.has(date),
      primaryEventType: events[0]?.type,
      timestamp,
      value: historyByDate.get(date) ?? interpolateSeverity(severitySeries, timestamp),
    };
  });
}

function interpolateSeverity(
  history: Array<{ timestamp: number; value: number }>,
  timestamp: number,
): number | null {
  const firstPoint = history[0];
  const lastPoint = history.at(-1);
  if (!firstPoint || !lastPoint) return null;
  if (timestamp <= firstPoint.timestamp) return firstPoint.value;
  if (timestamp >= lastPoint.timestamp) return lastPoint.value;

  for (let index = 0; index < history.length - 1; index += 1) {
    const currentPoint = history[index];
    const nextPoint = history[index + 1];
    if (timestamp === currentPoint.timestamp) return currentPoint.value;
    if (timestamp < nextPoint.timestamp) {
      const progress =
        (timestamp - currentPoint.timestamp) / (nextPoint.timestamp - currentPoint.timestamp);
      return (
        Math.round((currentPoint.value + (nextPoint.value - currentPoint.value) * progress) * 100) /
        100
      );
    }
  }
  return lastPoint.value;
}
