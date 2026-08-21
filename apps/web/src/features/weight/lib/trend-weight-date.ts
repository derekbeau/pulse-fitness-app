const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

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

export function trendWeightDateCoordinate(dateKey: string): number {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) throw new RangeError(`Invalid Trend Weight date key: ${dateKey}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const coordinate = Date.UTC(year, month - 1, day);

  if (new Date(coordinate).toISOString().slice(0, 10) !== dateKey) {
    throw new RangeError(`Invalid Trend Weight calendar date: ${dateKey}`);
  }

  return coordinate;
}

export function trendWeightCoordinateDateKey(coordinate: number): string {
  if (!Number.isFinite(coordinate)) {
    throw new RangeError(`Invalid Trend Weight chart coordinate: ${coordinate}`);
  }
  return new Date(coordinate).toISOString().slice(0, 10);
}

export function formatTrendWeightDate(dateKey: string): string {
  return fullDateFormatter.format(trendWeightDateCoordinate(dateKey));
}

export function formatTrendWeightAxisDate(coordinate: number): string {
  return axisDateFormatter.format(coordinate);
}

export function trendWeightChartTicks(startDate: string, endDate: string): number[] {
  const start = trendWeightDateCoordinate(startDate);
  const end = trendWeightDateCoordinate(endDate);
  if (end < start) throw new RangeError('Trend Weight chart range ends before it starts');
  if (end === start) return [start];

  const spanDays = Math.round((end - start) / DAY_MS);
  return [
    ...new Set(
      [0, 0.25, 0.5, 0.75, 1].map((ratio) => start + Math.round(spanDays * ratio) * DAY_MS),
    ),
  ];
}
