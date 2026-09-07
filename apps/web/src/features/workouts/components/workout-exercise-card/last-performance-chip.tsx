import type { ExerciseTrackingType, WeightUnit } from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
import { useLastPerformance } from '@/hooks/use-last-performance';

import { formatCompactSets } from '../../lib/tracking';
import { HistoryEffortDetails } from '../effort-display';

const historyDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

type LastPerformanceChipProps = {
  enabled?: boolean;
  exerciseId: string;
  trackingType: ExerciseTrackingType;
  weightUnit: WeightUnit;
};

export function LastPerformanceChip({
  enabled = true,
  exerciseId,
  trackingType,
  weightUnit,
}: LastPerformanceChipProps) {
  const historyQuery = useLastPerformance(exerciseId, {
    enabled,
    includeRelated: false,
    limit: 1,
  });

  if (!enabled) {
    return null;
  }

  if (historyQuery.isPending) {
    return <Badge variant="outline">Last performance: loading…</Badge>;
  }

  if (historyQuery.isError) {
    return <Badge variant="outline">Last performance: unavailable</Badge>;
  }

  // `useLastPerformance` returns `historyEntries` in current API responses and `history` in legacy responses.
  const lastEntry = historyQuery.data?.historyEntries[0] ?? historyQuery.data?.history ?? null;
  if (!lastEntry) {
    return <Badge variant="outline">Last performance: no history</Badge>;
  }

  const setSummary = formatCompactSets(
    lastEntry.sets.map((set) =>
      trackingType === 'distance'
        ? {
            distance: set.distance ?? set.reps,
            rpe: set.rpe,
            rir: set.rir,
            weight: set.weight,
          }
        : {
            distance: set.distance,
            reps: set.reps,
            rpe: set.rpe,
            rir: set.rir,
            seconds: set.seconds,
            weight: set.weight,
          },
    ),
    trackingType,
    {
      useLegacySecondsFallback: trackingType !== 'reps_seconds',
      weightUnit,
    },
  );

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-x-1">
      <Badge
        className="max-w-full whitespace-normal text-left"
        variant="outline"
      >{`Last: ${historyDateFormatter.format(new Date(`${lastEntry.date}T12:00:00`))} · ${setSummary}`}</Badge>
      <HistoryEffortDetails
        sets={lastEntry.sets}
        trackingType={trackingType}
        label={`Last performance, ${lastEntry.date}`}
      />
    </span>
  );
}
