import { z } from 'zod';

import {
  adaptiveGoalRevisionSchema,
  adaptiveGoalSchema,
  adaptiveTdeeAlgorithmVersionSchema,
} from './adaptive-nutrition.js';
import { dateSchema } from './common.js';

export const adaptiveGoalTrajectoryRangeSchema = z.enum(['1m', '3m', '6m', '1y', 'all']);
export const adaptiveGoalTrajectoryLookbackSchema = z.union([
  z.literal(14),
  z.literal(21),
  z.literal(28),
]);

export const adaptiveGoalTrajectoryQuerySchema = z
  .object({
    range: adaptiveGoalTrajectoryRangeSchema.default('3m'),
    lookbackDays: z.coerce.number().pipe(adaptiveGoalTrajectoryLookbackSchema).default(21),
    end: dateSchema.optional(),
  })
  .strict();

export const adaptiveGoalTrajectoryConfidenceSchema = z.enum([
  'insufficient',
  'limited',
  'supported',
  'stale',
]);

export const adaptiveGoalTrajectoryRateSchema = z
  .object({
    lookbackDays: adaptiveGoalTrajectoryLookbackSchema,
    kgPerWeek: z.number().finite().nullable(),
    pctPerWeek: z.number().finite().nullable(),
    startDate: dateSchema.nullable(),
    endDate: dateSchema.nullable(),
    trendPointCount: z.number().int().nonnegative(),
    observedWeightCount: z.number().int().nonnegative(),
    spanDays: z.number().int().nonnegative(),
    confidence: adaptiveGoalTrajectoryConfidenceSchema,
    status: z.enum(['available', 'unavailable']),
    unavailableReason: z
      .enum([
        'INSUFFICIENT_TREND',
        'INSUFFICIENT_OBSERVED_WEIGHT',
        'STALE_WEIGHT',
        'RATE_TOO_SMALL',
        'SUSPECT_WEIGHT_DATA',
      ])
      .nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const available = value.status === 'available';
    const hasValues =
      value.kgPerWeek !== null &&
      value.pctPerWeek !== null &&
      value.startDate !== null &&
      value.endDate !== null &&
      value.unavailableReason === null;
    if (available !== hasValues) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Actual rate status must agree with its values, dates, and reason',
      });
    }
    if (!available && (value.unavailableReason === null || value.confidence === 'supported')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unavailable actual rate requires a reason and cannot claim supported confidence',
      });
    }
    if (available && (value.confidence === 'insufficient' || value.confidence === 'stale')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Available actual rate requires limited or supported confidence',
      });
    }
  });

export const adaptiveGoalTrajectoryForecastPointSchema = z
  .object({
    date: dateSchema,
    expectedTrendWeightKg: z.number().positive().finite(),
    fasterTrendWeightKg: z.number().positive().finite(),
    slowerTrendWeightKg: z.number().positive().finite(),
  })
  .strict();

export const adaptiveGoalTrajectoryForecastSchema = z
  .object({
    status: z.enum(['available', 'unavailable', 'reached']),
    basis: z.enum(['actual_rate', 'none']),
    projectedStartDate: dateSchema.nullable(),
    projectedCenterDate: dateSchema.nullable(),
    projectedEndDate: dateSchema.nullable(),
    projectedWeeks: z.number().nonnegative().finite().nullable(),
    etaChangeFromGoalStartDays: z.number().int().nullable(),
    etaChangeFromLatestRevisionDays: z.number().int().nullable(),
    unavailableReason: z
      .enum([
        'INSUFFICIENT_TREND',
        'STALE_WEIGHT',
        'MOVING_AWAY',
        'RATE_TOO_SMALL',
        'SUSPECT_WEIGHT_DATA',
        'LIMITED_TREND_CONFIDENCE',
      ])
      .nullable(),
    explanationCode: z.enum([
      'ETA_EARLIER',
      'ETA_LATER',
      'ETA_UNCHANGED',
      'TARGET_REACHED',
      'NO_RELIABLE_ETA',
    ]),
    points: z.array(adaptiveGoalTrajectoryForecastPointSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const available = value.status === 'available';
    const reached = value.status === 'reached';
    const validAvailable =
      value.basis === 'actual_rate' &&
      value.projectedStartDate !== null &&
      value.projectedCenterDate !== null &&
      value.projectedEndDate !== null &&
      value.projectedWeeks !== null &&
      value.unavailableReason === null &&
      value.points.length >= 2;
    const validUnavailable =
      value.basis === 'none' &&
      value.projectedStartDate === null &&
      value.projectedCenterDate === null &&
      value.projectedEndDate === null &&
      value.projectedWeeks === null &&
      value.etaChangeFromGoalStartDays === null &&
      value.etaChangeFromLatestRevisionDays === null &&
      value.unavailableReason !== null &&
      value.explanationCode === 'NO_RELIABLE_ETA' &&
      value.points.length === 0;
    const validReached =
      value.basis === 'none' &&
      value.projectedStartDate === null &&
      value.projectedCenterDate === null &&
      value.projectedEndDate === null &&
      value.projectedWeeks === 0 &&
      value.etaChangeFromGoalStartDays === null &&
      value.etaChangeFromLatestRevisionDays === null &&
      value.unavailableReason === null &&
      value.explanationCode === 'TARGET_REACHED' &&
      value.points.length === 0;
    if (
      (available && !validAvailable) ||
      (!available && !reached && !validUnavailable) ||
      (reached && !validReached)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Forecast state must agree with its dates, precision, explanation, and points',
      });
    }
  });

const adaptiveGoalTrajectoryLatestScaleSchema = z
  .object({
    entryId: z.string().min(1),
    date: dateSchema,
    weightKg: z.number().positive().finite(),
  })
  .strict();

const adaptiveGoalTrajectoryBaseSummaryFields = {
  startTrendWeightKg: z.number().positive().finite(),
  currentTrendWeightKg: z.number().positive().finite().nullable(),
  currentTrendDate: dateSchema.nullable(),
  latestScale: adaptiveGoalTrajectoryLatestScaleSchema.nullable(),
} as const;

export const adaptiveGoalTrajectoryWeightChangeSummarySchema = z
  .object({
    kind: z.literal('weight_change'),
    ...adaptiveGoalTrajectoryBaseSummaryFields,
    type: z.enum(['lose', 'gain']),
    targetWeightKg: z.number().positive().finite(),
    originalPlannedChangeKg: z.number().nonnegative().finite(),
    revisionAdjustmentKg: z.number().finite(),
    totalPlannedChangeKg: z.number().nonnegative().finite(),
    completedChangeKg: z.number().nonnegative().finite().nullable(),
    remainingChangeKg: z.number().nonnegative().finite().nullable(),
    percentComplete: z.number().min(0).max(100).finite().nullable(),
    selectedRatePctPerWeek: z.number().finite(),
    selectedRateKgPerWeek: z.number().finite(),
    paceState: z.enum([
      'near_selected',
      'faster_than_selected',
      'slower_than_selected',
      'moving_away',
      'flat',
      'reached',
      'insufficient_data',
    ]),
  })
  .strict();

export const adaptiveGoalTrajectoryTimeInRangeSchema = z
  .object({
    intervalStartDate: dateSchema.nullable(),
    intervalEndDate: dateSchema.nullable(),
    modeledDays: z.number().int().nonnegative(),
    daysWithinRange: z.number().int().nonnegative(),
    timeInRangeFraction: z.number().min(0).max(1).finite().nullable(),
    evidenceStatus: z.enum(['supported', 'insufficient_evidence']),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.daysWithinRange > value.modeledDays) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Days within range cannot exceed modeled days',
      });
    }
    if (
      (value.evidenceStatus === 'supported' && value.timeInRangeFraction === null) ||
      (value.evidenceStatus === 'insufficient_evidence' && value.timeInRangeFraction !== null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Time-in-range fraction requires supported evidence',
      });
    }
    const hasInterval = value.intervalStartDate !== null && value.intervalEndDate !== null;
    if (
      hasInterval &&
      value.intervalStartDate !== null &&
      value.intervalEndDate !== null &&
      value.intervalStartDate > value.intervalEndDate
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Time-in-range interval cannot run backward',
      });
    }
    if (
      hasInterval !== value.modeledDays > 0 ||
      (!hasInterval &&
        (value.daysWithinRange !== 0 ||
          value.timeInRangeFraction !== null ||
          value.evidenceStatus !== 'insufficient_evidence'))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Empty time-in-range evidence must not expose a fabricated interval',
      });
    }
  });

export const adaptiveGoalTrajectoryMaintenanceSummarySchema = z
  .object({
    kind: z.literal('maintenance'),
    ...adaptiveGoalTrajectoryBaseSummaryFields,
    centerWeightKg: z.number().positive().finite(),
    rangeRadiusKg: z.number().positive().finite(),
    rangeLowerKg: z.number().positive().finite(),
    rangeUpperKg: z.number().positive().finite(),
    signedDistanceFromCenterKg: z.number().finite().nullable(),
    rangeStatus: z.enum(['within', 'near_edge', 'below', 'above', 'insufficient_data']),
    correctionPolicy: z.literal('review_only_no_automatic_change'),
    timeInRange: adaptiveGoalTrajectoryTimeInRangeSchema,
  })
  .strict();

export const adaptiveGoalTrajectorySummarySchema = z.discriminatedUnion('kind', [
  adaptiveGoalTrajectoryWeightChangeSummarySchema,
  adaptiveGoalTrajectoryMaintenanceSummarySchema,
]);

export const adaptiveGoalTrajectoryPointSchema = z
  .object({
    date: dateSchema,
    trendWeightKg: z.number().positive().finite(),
    modeledWeightKg: z.number().positive().finite(),
    sourceEntryId: z.string().nullable(),
    interpolated: z.boolean(),
    goalRevisionId: z.string().min(1),
    revisionSequence: z.number().int().positive(),
    targetWeightKg: z.number().positive().finite().nullable(),
    maintenanceCenterKg: z.number().positive().finite().nullable(),
    maintenanceLowerKg: z.number().positive().finite().nullable(),
    maintenanceUpperKg: z.number().positive().finite().nullable(),
    section: z.enum(['historical', 'current']),
  })
  .strict();

export const adaptiveGoalWeeklyContributionSchema = z
  .object({
    periodStartDate: dateSchema,
    periodEndDate: dateSchema,
    startTrendWeightKg: z.number().positive().finite().nullable(),
    endTrendWeightKg: z.number().positive().finite().nullable(),
    movementTowardTargetKg: z.number().finite().nullable(),
    direction: z.enum(['toward', 'away', 'neutral', 'insufficient_evidence']),
    observedWeightCount: z.number().int().nonnegative(),
    remainingDistanceKg: z.number().nonnegative().finite().nullable(),
    reasonCode: z.literal('INSUFFICIENT_WEEKLY_EVIDENCE').nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const insufficient = value.direction === 'insufficient_evidence';
    if (
      insufficient !==
      (value.movementTowardTargetKg === null &&
        value.remainingDistanceKg === null &&
        value.reasonCode === 'INSUFFICIENT_WEEKLY_EVIDENCE')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Insufficient weekly evidence must remain null rather than becoming zero',
      });
    }
    if (!insufficient && (value.movementTowardTargetKg === null || value.reasonCode !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Supported weekly contributions require a movement and no reason code',
      });
    }
  });

export const adaptiveGoalTrajectoryAnnotationSchema = z
  .object({
    id: z.string().min(1),
    date: dateSchema,
    kind: z.enum(['goal_started', 'goal_revised', 'accepted_check_in', 'goal_completed']),
    label: z.string().min(1),
    goalRevisionId: z.string().nullable(),
    revisionSequence: z.number().int().positive().nullable(),
    checkInId: z.string().nullable(),
  })
  .strict();

export const adaptiveGoalTrajectoryContextSchema = z
  .object({
    calorieTargetKcal: z.number().positive().finite().nullable(),
    calorieTargetEffectiveDate: dateSchema.nullable(),
    adaptiveExpenditureKcal: z.number().positive().finite().nullable(),
    expenditureSourceCheckInId: z.string().nullable(),
    expenditureSourceInputFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
  })
  .strict();

export const adaptiveGoalCompletionReviewSchema = z
  .object({
    toleranceKg: z.number().positive().finite(),
    trendTargetStatus: z.enum(['reached', 'not_reached', 'unavailable']),
    scaleTargetStatus: z.enum(['reached', 'not_reached', 'unavailable']),
    completionReviewRequired: z.boolean(),
    completionAllowed: z.boolean(),
    reasonCode: z.enum([
      'TREND_REACHED_REVIEW_REQUIRED',
      'SCALE_ONLY_REACHED',
      'TARGET_NOT_REACHED',
      'INSUFFICIENT_TREND',
      'GOAL_CLOSED',
      'MAINTENANCE_NOT_APPLICABLE',
    ]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.completionAllowed && !value.completionReviewRequired) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Completion cannot be allowed without an explicit review',
      });
    }
    const validReason =
      (value.reasonCode === 'TREND_REACHED_REVIEW_REQUIRED' &&
        value.trendTargetStatus === 'reached' &&
        value.completionReviewRequired) ||
      (value.reasonCode === 'SCALE_ONLY_REACHED' &&
        value.trendTargetStatus !== 'reached' &&
        value.scaleTargetStatus === 'reached' &&
        !value.completionReviewRequired &&
        !value.completionAllowed) ||
      (value.reasonCode === 'TARGET_NOT_REACHED' &&
        value.trendTargetStatus === 'not_reached' &&
        !value.completionReviewRequired &&
        !value.completionAllowed) ||
      (value.reasonCode === 'INSUFFICIENT_TREND' &&
        value.trendTargetStatus === 'unavailable' &&
        !value.completionReviewRequired &&
        !value.completionAllowed) ||
      (value.reasonCode === 'GOAL_CLOSED' &&
        !value.completionReviewRequired &&
        !value.completionAllowed) ||
      (value.reasonCode === 'MAINTENANCE_NOT_APPLICABLE' &&
        value.trendTargetStatus === 'unavailable' &&
        value.scaleTargetStatus === 'unavailable' &&
        !value.completionReviewRequired &&
        !value.completionAllowed);
    if (!validReason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Completion state must agree with its evidence and reason',
      });
    }
  });

export const adaptiveGoalTrajectorySchema = z
  .object({
    algorithmVersion: adaptiveTdeeAlgorithmVersionSchema,
    trendSource: z.literal('adaptive_model_trend'),
    timeZone: z.string().min(1),
    isHistorical: z.boolean(),
    goal: adaptiveGoalSchema,
    activeRevision: adaptiveGoalRevisionSchema,
    range: z
      .object({
        preset: adaptiveGoalTrajectoryRangeSchema,
        startDate: dateSchema,
        endDate: dateSchema,
      })
      .strict()
      .superRefine((value, context) => {
        if (value.startDate > value.endDate) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Trajectory range cannot run backward',
          });
        }
      }),
    strategyAsOfDate: dateSchema,
    evidenceThroughDate: dateSchema,
    currentTrendDate: dateSchema.nullable(),
    summary: adaptiveGoalTrajectorySummarySchema,
    actualRate: adaptiveGoalTrajectoryRateSchema,
    forecast: adaptiveGoalTrajectoryForecastSchema.nullable(),
    context: adaptiveGoalTrajectoryContextSchema,
    trendPoints: z.array(adaptiveGoalTrajectoryPointSchema),
    weeklyContributions: z.array(adaptiveGoalWeeklyContributionSchema),
    annotations: z.array(adaptiveGoalTrajectoryAnnotationSchema),
    completionReview: adaptiveGoalCompletionReviewSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.range.endDate !== value.strategyAsOfDate ||
      value.range.startDate < value.goal.startedLocalDate
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Trajectory range must remain inside the requested goal period',
      });
    }
    if (
      value.evidenceThroughDate > value.strategyAsOfDate ||
      (value.currentTrendDate !== null && value.currentTrendDate > value.strategyAsOfDate)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Trajectory evidence and current trend cannot come from the future',
      });
    }
    if (value.currentTrendDate !== value.summary.currentTrendDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Top-level and summary current trend dates must agree',
      });
    }
    if (value.activeRevision.goalId !== value.goal.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Active revision must belong to the requested goal',
      });
    }
    if (value.activeRevision.effectiveLocalDate > value.strategyAsOfDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Active revision must be effective by the requested strategy date',
      });
    }
    const outsideGoalPeriod = [...value.trendPoints, ...value.annotations].some(
      (item) => item.date < value.goal.startedLocalDate || item.date > value.strategyAsOfDate,
    );
    if (outsideGoalPeriod) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Trajectory evidence and annotations must stay inside the requested goal period',
      });
    }
    const currentSections = value.trendPoints.filter((point) => point.section === 'current');
    const currentIsInRange =
      value.currentTrendDate !== null && value.currentTrendDate >= value.range.startDate;
    if (
      currentSections.some((point) => point.date !== value.currentTrendDate) ||
      (currentIsInRange &&
        (currentSections.length !== 1 || currentSections[0]?.date !== value.currentTrendDate))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Current trajectory section must agree with the current trend date',
      });
    }
    if (
      value.summary.kind === 'maintenance' &&
      (value.forecast !== null || value.weeklyContributions.length > 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maintenance trajectories cannot expose weight-change forecast facts',
      });
    }
  });

export type AdaptiveGoalTrajectoryQuery = z.infer<typeof adaptiveGoalTrajectoryQuerySchema>;
export type AdaptiveGoalTrajectory = z.infer<typeof adaptiveGoalTrajectorySchema>;
export type AdaptiveGoalTrajectoryRate = z.infer<typeof adaptiveGoalTrajectoryRateSchema>;
export type AdaptiveGoalTrajectoryForecast = z.infer<typeof adaptiveGoalTrajectoryForecastSchema>;
export type AdaptiveGoalWeeklyContribution = z.infer<typeof adaptiveGoalWeeklyContributionSchema>;
