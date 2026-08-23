export const CHART_RANGE_PRESETS = ['1w', '1m', '3m', '6m', '1y', 'all', 'custom'] as const;

export type ChartRangePreset = (typeof CHART_RANGE_PRESETS)[number];
export type ChartAggregationInterval = 'daily' | 'weekly' | 'monthly';
export type ChartAggregationStrategy = 'sum' | 'mean' | 'last' | 'min_max' | 'count';

export type ChartDateRange = {
  preset: ChartRangePreset;
  startDate: string;
  endDate: string;
  calendarDays: number;
};

export type ChartNumericPoint = {
  date: string;
  value: number | null;
};

export type ChartAggregateBucket = {
  periodStart: string;
  periodEnd: string;
  totalRecordCount: number;
  validObservationCount: number;
  value: number | null;
  minimum: number | null;
  maximum: number | null;
};

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
const PRESET_DAYS: Record<Exclude<ChartRangePreset, 'all' | 'custom'>, number> = {
  '1w': 7,
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
};

export function chartDateCoordinate(dateKey: string): number {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) throw new RangeError(`Invalid chart date key: ${dateKey}`);

  const coordinate = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (new Date(coordinate).toISOString().slice(0, 10) !== dateKey) {
    throw new RangeError(`Invalid chart calendar date: ${dateKey}`);
  }
  return coordinate;
}

export function chartCoordinateDateKey(coordinate: number): string {
  if (!Number.isFinite(coordinate)) {
    throw new RangeError(`Invalid chart coordinate: ${coordinate}`);
  }
  return new Date(coordinate).toISOString().slice(0, 10);
}

export function addChartCalendarDays(dateKey: string, days: number): string {
  if (!Number.isInteger(days)) throw new RangeError('Chart calendar-day offset must be an integer');
  return chartCoordinateDateKey(chartDateCoordinate(dateKey) + days * DAY_MS);
}

export function chartCalendarDaysBetween(startDate: string, endDate: string): number {
  const difference = (chartDateCoordinate(endDate) - chartDateCoordinate(startDate)) / DAY_MS;
  if (difference < 0) throw new RangeError('Chart range ends before it starts');
  return difference;
}

export function chartDateKeyInTimeZone(instant: Date | number, timeZone: string): string {
  const date = typeof instant === 'number' ? new Date(instant) : instant;
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid chart reference instant');

  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function resolveChartDateRange(input: {
  preset: ChartRangePreset;
  referenceDate: string;
  earliestDate?: string | null;
  customRange?: { startDate: string; endDate: string } | null;
}): ChartDateRange {
  chartDateCoordinate(input.referenceDate);

  let startDate: string;
  if (input.preset === 'all') {
    if (!input.earliestDate) throw new RangeError('All chart ranges require an earliest date');
    startDate = input.earliestDate;
  } else if (input.preset === 'custom') {
    if (!input.customRange) throw new RangeError('Custom chart ranges require start and end dates');
    if (input.customRange.endDate !== input.referenceDate) {
      throw new RangeError('Custom chart range end must equal the reference date');
    }
    startDate = input.customRange.startDate;
  } else {
    startDate = addChartCalendarDays(input.referenceDate, -(PRESET_DAYS[input.preset] - 1));
  }

  const calendarDays = chartCalendarDaysBetween(startDate, input.referenceDate) + 1;
  return { preset: input.preset, startDate, endDate: input.referenceDate, calendarDays };
}

export function aggregateChartNumericPoints(input: {
  points: ChartNumericPoint[];
  interval: ChartAggregationInterval;
  strategy: ChartAggregationStrategy;
}): ChartAggregateBucket[] {
  const buckets = new Map<string, ChartNumericPoint[]>();
  for (const point of input.points) {
    chartDateCoordinate(point.date);
    if (point.value !== null && !Number.isFinite(point.value)) {
      throw new RangeError(`Invalid chart value on ${point.date}`);
    }
    const key = aggregationBucketKey(point.date, input.interval);
    buckets.set(key, [...(buckets.get(key) ?? []), point]);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, points]) => summarizeBucket(points, input.strategy));
}

function aggregationBucketKey(date: string, interval: ChartAggregationInterval): string {
  if (interval === 'daily') return date;
  if (interval === 'monthly') return date.slice(0, 7);

  const coordinate = chartDateCoordinate(date);
  const day = new Date(coordinate).getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return chartCoordinateDateKey(coordinate + mondayOffset * DAY_MS);
}

function summarizeBucket(
  points: ChartNumericPoint[],
  strategy: ChartAggregationStrategy,
): ChartAggregateBucket {
  const sorted = [...points].sort((left, right) => left.date.localeCompare(right.date));
  const valid = sorted.filter(
    (point): point is { date: string; value: number } => point.value !== null,
  );
  const values = valid.map((point) => point.value);
  let value: number | null = null;

  if (strategy === 'count') value = valid.length;
  else if (values.length > 0 && strategy === 'sum')
    value = values.reduce((sum, item) => sum + item, 0);
  else if (values.length > 0 && strategy === 'mean') {
    value = values.reduce((sum, item) => sum + item, 0) / values.length;
  } else if (values.length > 0 && strategy === 'last') value = valid.at(-1)?.value ?? null;

  return {
    periodStart: sorted[0]?.date ?? '',
    periodEnd: sorted.at(-1)?.date ?? '',
    totalRecordCount: sorted.length,
    validObservationCount: valid.length,
    value,
    minimum: strategy === 'min_max' && values.length > 0 ? Math.min(...values) : null,
    maximum: strategy === 'min_max' && values.length > 0 ? Math.max(...values) : null,
  };
}
