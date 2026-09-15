import {
  BODY_PROGRESS_ANALYTICS_CONSTANTS,
  type BodyProgressPoint,
  type BodyProgressReasonCode,
  type BodyProgressSegment,
  type BodyProgressSignal,
  type BodyProgressStrengthEvidence,
} from '../schemas/body-progress-analytics.js';
import { chartCalendarDaysBetween } from './chart-exploration.js';

const round = (value: number) => Number(value.toFixed(8));

function independentlySpacedPointCount(points: BodyProgressPoint[]): number {
  let count = 0;
  let lastAccepted: string | null = null;
  for (const point of points) {
    if (
      lastAccepted === null ||
      chartCalendarDaysBetween(lastAccepted, point.date) >=
        BODY_PROGRESS_ANALYTICS_CONSTANTS.minimumSpacingDays
    ) {
      count += 1;
      lastAccepted = point.date;
    }
  }
  return count;
}

function datedRegression(points: BodyProgressPoint[]) {
  const firstDate = points[0]?.date;
  const lastDate = points.at(-1)?.date;
  if (!firstDate || !lastDate) return null;
  const x = points.map((point) => chartCalendarDaysBetween(firstDate, point.date));
  const y = points.map((point) => point.canonicalMm);
  const xMean = x.reduce((sum, value) => sum + value, 0) / x.length;
  const yMean = y.reduce((sum, value) => sum + value, 0) / y.length;
  const denominator = x.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
  if (denominator === 0) return null;
  const numerator = x.reduce(
    (sum, value, index) => sum + (value - xMean) * ((y[index] ?? yMean) - yMean),
    0,
  );
  const slopeMmPerDay = numerator / denominator;
  const elapsedDays = chartCalendarDaysBetween(firstDate, lastDate);
  return {
    elapsedDays,
    fittedTotalChangeMm: slopeMmPerDay * elapsedDays,
    slopeMmPerDay,
  };
}

export function analyzeBodyProgressSegments(input: {
  points: BodyProgressPoint[];
  cadenceDays: number | null;
  asOfDate: string;
}): BodyProgressSegment[] {
  const grouped = new Map<string, BodyProgressPoint[]>();
  for (const point of input.points) {
    const key = `${point.site}:${point.laterality}:${point.protocolVersion}`;
    grouped.set(key, [...(grouped.get(key) ?? []), point]);
  }

  return [...grouped.entries()]
    .map(([id, unsorted]) => {
      const points = [...unsorted].sort(
        (left, right) =>
          left.date.localeCompare(right.date) ||
          left.measurementId.localeCompare(right.measurementId),
      );
      const first = points[0];
      const last = points.at(-1);
      if (!first || !last) throw new Error('Body Progress segments cannot be empty');
      const elapsedDays = chartCalendarDaysBetween(first.date, last.date);
      const latestAgeDays = chartCalendarDaysBetween(last.date, input.asOfDate);
      const spacedCount = independentlySpacedPointCount(points);
      const freshnessLimitDays =
        input.cadenceDays === null
          ? null
          : input.cadenceDays + BODY_PROGRESS_ANALYTICS_CONSTANTS.freshnessGraceDays;
      const reasonCodes: BodyProgressReasonCode[] = [];
      let state: BodyProgressSegment['analysis']['state'] = 'supported';
      let direction: BodyProgressSegment['analysis']['direction'] = 'unavailable';
      let slopeMmPerDay: number | null = null;
      let fittedTotalChangeMm: number | null = null;

      if (points.length < BODY_PROGRESS_ANALYTICS_CONSTANTS.minimumCompatibleCheckIns) {
        reasonCodes.push('INSUFFICIENT_COMPATIBLE_CHECK_INS');
        state = 'insufficient';
      }
      if (spacedCount < BODY_PROGRESS_ANALYTICS_CONSTANTS.minimumCompatibleCheckIns) {
        reasonCodes.push('CHECK_INS_TOO_CLOSE');
        state = 'insufficient';
      }
      if (elapsedDays < BODY_PROGRESS_ANALYTICS_CONSTANTS.minimumElapsedDays) {
        reasonCodes.push('INSUFFICIENT_ELAPSED_DAYS');
        state = 'insufficient';
      }
      if (state === 'supported' && points.some((point) => point.quality === 'high_variance')) {
        reasonCodes.push('HIGH_VARIANCE_PRESENT');
        state = 'high_variance';
      }
      if (state === 'supported' && freshnessLimitDays === null) {
        reasonCodes.push('MEASUREMENT_FRESHNESS_UNRESOLVED');
        state = 'freshness_unresolved';
      }
      if (
        state === 'supported' &&
        freshnessLimitDays !== null &&
        latestAgeDays > freshnessLimitDays
      ) {
        reasonCodes.push('MEASUREMENTS_STALE');
        state = 'stale';
      }

      if (state === 'supported') {
        const result = datedRegression(points);
        if (result) {
          slopeMmPerDay = round(result.slopeMmPerDay);
          fittedTotalChangeMm = round(result.fittedTotalChangeMm);
          const floor = BODY_PROGRESS_ANALYTICS_CONSTANTS.noiseFloorMm[first.site];
          direction =
            result.fittedTotalChangeMm > floor
              ? 'up'
              : result.fittedTotalChangeMm < -floor
                ? 'down'
                : 'stable_within_measurement_noise';
        }
      }

      return {
        id,
        site: first.site,
        laterality: first.laterality,
        protocolVersion: first.protocolVersion,
        noiseFloorMm: BODY_PROGRESS_ANALYTICS_CONSTANTS.noiseFloorMm[first.site],
        points,
        rawDelta:
          points.length < 2
            ? null
            : {
                fromCheckInId: first.checkInId,
                fromDate: first.date,
                fromCanonicalMm: first.canonicalMm,
                toCheckInId: last.checkInId,
                toDate: last.date,
                toCanonicalMm: last.canonicalMm,
                deltaMm: last.canonicalMm - first.canonicalMm,
              },
        analysis: {
          state,
          direction,
          compatiblePointCount: points.length,
          independentlySpacedPointCount: spacedCount,
          elapsedDays,
          latestAgeDays,
          freshnessLimitDays,
          slopeMmPerDay,
          fittedTotalChangeMm,
          reasonCodes,
        },
        qualityStates: [...new Set(points.map((point) => point.quality))],
      } satisfies BodyProgressSegment;
    })
    .sort(
      (left, right) =>
        left.site.localeCompare(right.site) ||
        left.laterality.localeCompare(right.laterality) ||
        left.protocolVersion.localeCompare(right.protocolVersion),
    );
}

type WeightPolicyInput = {
  state: 'no_data' | 'scale_only' | 'developing' | 'sufficient' | 'stale';
  direction: 'up' | 'down' | 'stable' | 'unavailable';
};

const fact = (
  code: BodyProgressReasonCode,
  label: string,
  source: 'body_check_ins' | 'trend_weight' | 'workout_progression' | 'goal',
  date: string | null,
) => ({ code, label, source, date });

const directionCode = (direction: 'up' | 'down' | 'stable_within_measurement_noise') =>
  direction === 'up' ? 'WAIST_UP' : direction === 'down' ? 'WAIST_DOWN' : 'WAIST_STABLE';

const signalCopy: Record<
  BodyProgressSignal['state'],
  Pick<BodyProgressSignal, 'headline' | 'detail' | 'nextAction'>
> = {
  insufficient_data: {
    headline: 'More compatible evidence is needed.',
    detail:
      'Pulse is preserving the raw facts, but the required measurement and Product Trend Weight gates are not all met.',
    nextAction:
      'Gather another standardized check-in on the configured cadence and keep weight observations current.',
  },
  stale: {
    headline: 'The available Body Progress evidence is stale.',
    detail: 'Older facts remain visible, but they do not support a current interpretation.',
    nextAction:
      'Complete a standardized check-in and update weight observations before interpreting the direction.',
  },
  favorable_gain_signal: {
    headline: 'Current evidence supports a favorable gain signal.',
    detail:
      'Product Trend Weight is rising while supported waist evidence is stable and muscular or progression evidence is improving.',
    nextAction: 'Maintain the current course and keep collecting standardized check-ins.',
  },
  possible_fat_gain_signal: {
    headline: 'Weight and waist are both rising.',
    detail:
      'This pattern may indicate that the current gain phase deserves a surplus review; it does not measure tissue change.',
    nextAction: 'Review the current surplus without automatically changing nutrition targets.',
  },
  possible_recomp_signal: {
    headline: 'Current evidence supports possible recomposition.',
    detail:
      'Product Trend Weight is stable or down, waist is stable or down, and muscular or progression evidence is improving.',
    nextAction:
      'Maintain the current course and confirm the pattern with future standardized check-ins.',
  },
  favorable_loss_signal: {
    headline: 'Current evidence supports a favorable loss signal.',
    detail:
      'Product Trend Weight and supported waist evidence are down without contrary progression evidence.',
    nextAction: 'Maintain the current course and keep progression evidence current.',
  },
  maintenance_signal: {
    headline: 'Current evidence supports maintenance.',
    detail:
      'Product Trend Weight is inside the existing maintenance corridor and supported circumference directions are stable within measurement noise.',
    nextAction: 'Maintain the current course and continue the configured check-in cadence.',
  },
  mixed_signal: {
    headline: 'The current evidence is mixed.',
    detail:
      'The available weight, circumference, and progression facts do not point in one supported direction.',
    nextAction:
      'Review the contradictory facts and gather the next standardized check-in before changing course.',
  },
};

export function buildBodyProgressSignal(input: {
  asOfDate: string;
  goal: {
    type: 'gain' | 'lose' | 'maintain' | 'unset';
    maintenanceBandState:
      | 'inside_maintenance_band'
      | 'outside_maintenance_band'
      | 'unavailable'
      | 'not_applicable'
      | null;
  };
  weight: WeightPolicyInput;
  segments: BodyProgressSegment[];
  strength: BodyProgressStrengthEvidence;
  cadenceDays: number | null;
}): BodyProgressSignal {
  const supported = input.segments.filter((segment) => segment.analysis.state === 'supported');
  const waist = supported
    .filter((segment) => segment.site === 'waist_iliac_crest_nhanes')
    .sort((left, right) =>
      (right.points.at(-1)?.date ?? '').localeCompare(left.points.at(-1)?.date ?? ''),
    )[0];
  const muscular = supported.filter((segment) =>
    ['chest_nipple_line_relaxed', 'upper_arm_midpoint_flexed', 'thigh_midpoint'].includes(
      segment.site,
    ),
  );
  const staleSegment = input.segments.some((segment) => segment.analysis.state === 'stale');
  const freshnessUnresolved = input.segments.some(
    (segment) => segment.analysis.state === 'freshness_unresolved',
  );
  const unavailableInputs: BodyProgressSignal['unavailableInputs'] = [];
  if (input.goal.type === 'unset') unavailableInputs.push('goal');
  if (input.weight.state !== 'sufficient' || input.weight.direction === 'unavailable')
    unavailableInputs.push('trend_weight');
  if (!waist) unavailableInputs.push('waist');
  if (muscular.length === 0) unavailableInputs.push('muscular_circumference');
  if (input.strength.state === 'unavailable') unavailableInputs.push('strength');
  if (input.cadenceDays === null || freshnessUnresolved) unavailableInputs.push('cadence');

  const supportingFacts: BodyProgressSignal['supportingFacts'] = [];
  const contradictoryFacts: BodyProgressSignal['contradictoryFacts'] = [];
  if (input.weight.direction !== 'unavailable') {
    const code =
      input.weight.direction === 'up'
        ? 'WEIGHT_UP'
        : input.weight.direction === 'down'
          ? 'WEIGHT_DOWN'
          : 'WEIGHT_STABLE';
    supportingFacts.push(
      fact(
        code,
        `Product Trend Weight is ${input.weight.direction}.`,
        'trend_weight',
        input.asOfDate,
      ),
    );
  }
  const waistIsGainContradiction =
    input.goal.type === 'gain' &&
    input.weight.direction === 'up' &&
    waist?.analysis.direction === 'up';
  if (waist && waist.analysis.direction !== 'unavailable' && !waistIsGainContradiction) {
    supportingFacts.push(
      fact(
        directionCode(waist.analysis.direction),
        `Supported waist direction is ${waist.analysis.direction.replaceAll('_', ' ')}.`,
        'body_check_ins',
        waist.points.at(-1)?.date ?? null,
      ),
    );
  }
  const muscularUp = muscular.some((segment) => segment.analysis.direction === 'up');
  if (muscularUp)
    supportingFacts.push(
      fact(
        'MUSCULAR_SITE_UP',
        'At least one supported muscular-site direction is up.',
        'body_check_ins',
        input.asOfDate,
      ),
    );
  if (input.strength.state === 'improving')
    supportingFacts.push(
      fact(
        'STRENGTH_IMPROVING',
        'Server-owned workout progression evidence is improving.',
        'workout_progression',
        input.strength.sourceDates.at(-1) ?? null,
      ),
    );
  if (input.strength.state === 'stable')
    supportingFacts.push(
      fact(
        'STRENGTH_STABLE',
        'Server-owned workout progression evidence is stable.',
        'workout_progression',
        input.strength.sourceDates.at(-1) ?? null,
      ),
    );
  if (input.strength.state === 'declining')
    contradictoryFacts.push(
      fact(
        'STRENGTH_DECLINING',
        'Server-owned workout progression evidence is declining.',
        'workout_progression',
        input.strength.sourceDates.at(-1) ?? null,
      ),
    );

  let state: BodyProgressSignal['state'];
  const reasonCodes: BodyProgressReasonCode[] = [];
  if (input.weight.state === 'stale' || (staleSegment && !waist)) {
    state = 'stale';
    reasonCodes.push(
      input.weight.state === 'stale' ? 'WEIGHT_EVIDENCE_STALE' : 'MEASUREMENTS_STALE',
    );
  } else if (
    input.weight.state !== 'sufficient' ||
    input.weight.direction === 'unavailable' ||
    !waist ||
    freshnessUnresolved
  ) {
    state = 'insufficient_data';
    if (input.weight.state === 'developing') reasonCodes.push('WEIGHT_EVIDENCE_DEVELOPING');
    else if (input.weight.state !== 'sufficient') reasonCodes.push('WEIGHT_EVIDENCE_UNAVAILABLE');
    if (!waist) reasonCodes.push('WAIST_EVIDENCE_UNAVAILABLE');
    if (freshnessUnresolved) reasonCodes.push('MEASUREMENT_FRESHNESS_UNRESOLVED');
    for (const segment of input.segments) reasonCodes.push(...segment.analysis.reasonCodes);
  } else if (input.goal.type === 'gain') {
    if (input.weight.direction === 'up' && waist.analysis.direction === 'up') {
      state = 'possible_fat_gain_signal';
      contradictoryFacts.push(
        fact(
          'WAIST_UP',
          'Supported waist direction is up during a gain goal.',
          'body_check_ins',
          waist.points.at(-1)?.date ?? null,
        ),
      );
    } else if (
      input.weight.direction === 'up' &&
      waist.analysis.direction === 'stable_within_measurement_noise' &&
      (muscularUp || input.strength.state === 'improving')
    )
      state = 'favorable_gain_signal';
    else state = 'mixed_signal';
  } else if (input.goal.type === 'lose') {
    state =
      input.weight.direction === 'down' &&
      waist.analysis.direction === 'down' &&
      ['stable', 'improving', 'unavailable'].includes(input.strength.state)
        ? 'favorable_loss_signal'
        : 'mixed_signal';
  } else if (input.goal.type === 'maintain') {
    const allStable =
      supported.length > 0 &&
      supported.every(
        (segment) => segment.analysis.direction === 'stable_within_measurement_noise',
      );
    state =
      input.goal.maintenanceBandState === 'inside_maintenance_band' && allStable
        ? 'maintenance_signal'
        : 'mixed_signal';
    supportingFacts.push(
      fact(
        input.goal.maintenanceBandState === 'inside_maintenance_band'
          ? 'INSIDE_MAINTENANCE_CORRIDOR'
          : 'OUTSIDE_MAINTENANCE_CORRIDOR',
        input.goal.maintenanceBandState === 'inside_maintenance_band'
          ? 'Product Trend Weight is inside the existing maintenance corridor.'
          : 'Product Trend Weight is not confirmed inside the existing maintenance corridor.',
        'goal',
        input.asOfDate,
      ),
    );
    if (allStable)
      supportingFacts.push(
        fact(
          'CIRCUMFERENCES_STABLE',
          'Supported circumference directions are stable within measurement noise.',
          'body_check_ins',
          input.asOfDate,
        ),
      );
  } else {
    state =
      ['stable', 'down'].includes(input.weight.direction) &&
      ['stable_within_measurement_noise', 'down'].includes(waist.analysis.direction) &&
      (muscularUp || input.strength.state === 'improving')
        ? 'possible_recomp_signal'
        : 'mixed_signal';
    reasonCodes.push('GOAL_UNSET');
  }

  if (state === 'mixed_signal') {
    reasonCodes.push('CONTRADICTORY_EVIDENCE');
    if (muscular.length === 0 && input.strength.state === 'unavailable')
      reasonCodes.push('MUSCULAR_SUPPORT_UNAVAILABLE');
  }
  if (input.strength.state === 'unavailable') reasonCodes.push('STRENGTH_EVIDENCE_UNAVAILABLE');
  reasonCodes.push(...supportingFacts.map((item) => item.code));
  reasonCodes.push(...contradictoryFacts.map((item) => item.code));

  const confidence: BodyProgressSignal['confidence'] =
    state === 'insufficient_data'
      ? 'unavailable'
      : state === 'stale' || contradictoryFacts.length > 0
        ? 'low'
        : input.strength.confidence === 'unavailable' ||
            supported.some((segment) => segment.qualityStates.includes('single_reading'))
          ? 'medium'
          : 'high';
  const copy = signalCopy[state];
  return {
    state,
    confidence,
    reasonCodes: [...new Set(reasonCodes)],
    supportingFacts,
    contradictoryFacts,
    unavailableInputs: [...new Set(unavailableInputs)],
    ...copy,
    limitations: [
      'These signals summarize measurements and existing product evidence; they do not estimate body fat, fat mass, lean mass, or muscle gain.',
      'Product noise floors are interpretation rules, not clinical thresholds, and stable within noise does not mean exactly zero change.',
    ],
  };
}
