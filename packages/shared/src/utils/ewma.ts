export type WeightEntry = { date: string; weight: number };
export type EWMAOptions = { alpha?: number };
export type EWMAResult = { date: string; scale: number; trend: number }[];

function clampAlpha(alpha: number): number {
  if (alpha < 0) return 0;
  if (alpha > 1) return 1;
  return alpha;
}

export function computeEWMA(entries: WeightEntry[], options: EWMAOptions = {}): EWMAResult {
  if (entries.length === 0) {
    return [];
  }

  const alpha = clampAlpha(options.alpha ?? 0.1);
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  let previousTrend = sortedEntries[0].weight;

  return sortedEntries.map((entry, index) => {
    const scale = entry.weight;
    const trend = index === 0 ? scale : alpha * scale + (1 - alpha) * previousTrend;

    previousTrend = trend;

    return {
      date: entry.date,
      scale,
      trend,
    };
  });
}

export function computeWeightInsights(
  ewmaResults: EWMAResult,
  periodDays: number,
): { avgWeight: number; periodChange: number; direction: 'up' | 'down' | 'stable' } {
  if (ewmaResults.length === 0) {
    return {
      avgWeight: 0,
      periodChange: 0,
      direction: 'stable',
    };
  }

  const sortedResults = [...ewmaResults].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const latestDate = new Date(sortedResults[sortedResults.length - 1].date);
  const startDate = new Date(latestDate);
  startDate.setDate(startDate.getDate() - Math.max(periodDays - 1, 0));

  const periodResults = sortedResults.filter(
    (result) => new Date(result.date).getTime() >= startDate.getTime(),
  );
  const scopedResults = periodResults.length > 0 ? periodResults : sortedResults;

  const totalTrend = scopedResults.reduce((sum, result) => sum + result.trend, 0);
  const avgWeight = totalTrend / scopedResults.length;
  const firstTrend = scopedResults[0].trend;
  const lastTrend = scopedResults[scopedResults.length - 1].trend;
  const periodChange = lastTrend - firstTrend;

  const direction: 'up' | 'down' | 'stable' =
    Math.abs(periodChange) < 0.1 ? 'stable' : periodChange > 0 ? 'up' : 'down';

  return {
    avgWeight,
    periodChange,
    direction,
  };
}
