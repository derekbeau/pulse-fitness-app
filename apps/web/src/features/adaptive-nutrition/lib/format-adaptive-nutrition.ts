import {
  convertWeightFromKg,
  type AdaptiveCheckInStatus,
  type AdaptiveConfidenceLabel,
  type AdaptiveNutritionReadState,
  type AdaptiveReasonCode,
  type WeightUnit,
} from '@pulse/shared';

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});
const percentFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
  style: 'percent',
});
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

export const adaptiveStateCopy: Record<
  AdaptiveNutritionReadState,
  { description: string; eyebrow: string; title: string }
> = {
  setup_required: {
    eyebrow: 'Set your starting point',
    title: 'Build your nutrition coaching plan',
    description: 'Create a transparent starting estimate, then let complete logs personalize it.',
  },
  baseline: {
    eyebrow: 'Starting estimate',
    title: 'Your baseline is active',
    description: 'Keep logging complete days and body weight while Pulse learns your expenditure.',
  },
  learning: {
    eyebrow: 'Learning from your data',
    title: 'A stronger estimate is taking shape',
    description: 'Pulse will hold your starting estimate until the minimum data coverage is met.',
  },
  updating: {
    eyebrow: 'Personalized expenditure',
    title: 'Your Adaptive TDEE is active',
    description: 'Complete nutrition and trend weight now support personalized check-ins.',
  },
  holding: {
    eyebrow: 'Current estimate held',
    title: 'Pulse needs better data before changing targets',
    description: 'Your existing targets stay in place while the issue below is resolved.',
  },
  pending_recommendation: {
    eyebrow: 'Your review',
    title: 'A recommendation is ready',
    description: 'Compare the evidence and choose whether to use the proposed targets.',
  },
};

export const adaptiveReasonCopy: Record<AdaptiveReasonCode, { action: string; label: string }> = {
  INSUFFICIENT_NUTRITION: {
    label: 'Not enough complete nutrition days',
    action: 'Confirm more days only after every calorie-containing item has been logged.',
  },
  INSUFFICIENT_WEIGHT: {
    label: 'Not enough weigh-ins',
    action: 'Add at least three scale weights in the analysis window.',
  },
  INSUFFICIENT_WEIGHT_SPAN: {
    label: 'Weight history is too short',
    action: 'Keep weighing in until entries span at least 14 days.',
  },
  STALE_WEIGHT: {
    label: 'Recent weight is missing',
    action: 'Log a current weight before requesting another check-in.',
  },
  INSUFFICIENT_TREND_POINTS: {
    label: 'Weight trend is not established',
    action: 'Keep logging weight so Pulse can build a daily trend.',
  },
  NO_OVERLAPPING_DATA: {
    label: 'Nutrition and weight dates do not overlap',
    action: 'Log both nutrition and weight during the same recent weeks.',
  },
  SUSPECT_WEIGHT_DATA: {
    label: 'A weight entry may be an outlier',
    action: 'Review the highlighted weigh-ins and correct any entry mistakes.',
  },
  IMPLAUSIBLE_EXPENDITURE: {
    label: 'Observed expenditure is outside the safe range',
    action: 'Review nutrition completeness and weight entries before checking in again.',
  },
  NO_CURRENT_WEIGHT: {
    label: 'Current weight is required',
    action: 'Enter a weight now or save a weigh-in no more than seven days old.',
  },
  PROGRAM_PAUSED: {
    label: 'Coaching is paused',
    action: 'Resume the program before requesting a recommendation.',
  },
  LOW_CONFIDENCE: {
    label: 'Confidence is still developing',
    action: 'More complete nutrition days and frequent weigh-ins will strengthen the estimate.',
  },
  CALORIE_FLOOR_APPLIED: {
    label: 'Calorie floor applied',
    action: 'The selected loss rate is limited by your configured calorie floor.',
  },
  DEFICIT_LIMIT_APPLIED: {
    label: 'Deficit guardrail applied',
    action: 'The recommendation will not exceed a 25% estimated deficit.',
  },
  TDEE_CHANGE_LIMIT_APPLIED: {
    label: 'Expenditure change limited',
    action: 'Pulse limited this check-in to a 150 kcal TDEE adjustment.',
  },
  GOAL_REACHED: {
    label: 'Goal range reached',
    action:
      'Accept this target recommendation, then review goal completion before moving to maintenance.',
  },
  TODAY_INCLUDED: {
    label: 'Today included',
    action: 'Today was included because it was explicitly marked complete.',
  },
  EXCLUDED_INCOMPLETE_DAYS: {
    label: 'Incomplete days excluded',
    action: 'Unknown and partial days did not affect the calculation.',
  },
  SAME_DATE_TARGET_EXISTS: {
    label: 'A target already exists for this date',
    action: 'Acceptance requires confirmation before replacing that dated target.',
  },
};

export const checkInStatusLabel: Record<AdaptiveCheckInStatus, string> = {
  accepted: 'Accepted',
  declined: 'Kept current',
  held: 'Held',
  pending: 'Awaiting review',
  superseded: 'Superseded',
};

export function formatAdaptiveCalories(value: number | null | undefined) {
  return value == null ? '—' : `${numberFormatter.format(Math.round(value))} kcal`;
}

export function formatAdaptiveGrams(value: number | null | undefined) {
  return value == null ? '—' : `${numberFormatter.format(Math.round(value))} g`;
}

export function formatAdaptiveDifference(
  proposed: number | null | undefined,
  current: number | null | undefined,
  unit: 'g' | 'kcal',
) {
  if (proposed == null || current == null) {
    return 'New';
  }

  const difference = Math.round(proposed - current);
  if (difference === 0) {
    return `No change`;
  }

  return `${difference > 0 ? '+' : '−'}${numberFormatter.format(Math.abs(difference))} ${unit}`;
}

export function formatAdaptiveDate(date: string | null | undefined) {
  if (!date) {
    return '—';
  }

  return dateFormatter.format(new Date(`${date}T00:00:00.000Z`));
}

export function formatAdaptivePercent(value: number | null | undefined) {
  return value == null ? '—' : percentFormatter.format(value);
}

export function formatAdaptiveWeight(weightKg: number | null | undefined, unit: WeightUnit) {
  if (weightKg == null) {
    return '—';
  }

  return `${decimalFormatter.format(convertWeightFromKg(weightKg, unit))} ${unit}`;
}

export function formatAdaptiveWeightChange(weightKg: number | null | undefined, unit: WeightUnit) {
  if (weightKg == null) {
    return '—';
  }

  const converted = convertWeightFromKg(Math.abs(weightKg), unit);
  const sign = weightKg > 0 ? '+' : weightKg < 0 ? '−' : '';
  return `${sign}${decimalFormatter.format(converted)} ${unit}/week`;
}

export function getConfidenceTone(label: AdaptiveConfidenceLabel | null | undefined) {
  if (label === 'High') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (label === 'Moderate') return 'border-primary/30 bg-primary/10 text-primary';
  return 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200';
}
