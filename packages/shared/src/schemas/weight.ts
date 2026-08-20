import { z } from 'zod';

import { dateSchema } from './common.js';
import { weightUnitSchema } from './users.js';
import { TREND_WEIGHT_ALGORITHM, addTrendWeightCalendarDays } from '../utils/ewma.js';
import { convertWeightToKg, isCanonicalBodyWeight } from '../utils/weight-unit.js';

const MAX_BODY_WEIGHT = 1_500;

const weightNotesSchema = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value.length === 0 ? undefined : value));

const bodyWeightValueSchema = z.number().positive().finite().max(MAX_BODY_WEIGHT);

const validateExplicitWeightUnit = (
  value: { unit?: 'lbs' | 'kg'; weight?: number },
  context: z.RefinementCtx,
) => {
  if (value.weight === undefined || value.unit === undefined) {
    return;
  }

  if (!isCanonicalBodyWeight(convertWeightToKg(value.weight, value.unit))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Weight must be between 25 and 350 kg after conversion',
      path: ['weight'],
    });
  }
};

export const createWeightInputSchema = z
  .object({
    date: dateSchema,
    weight: bodyWeightValueSchema,
    unit: weightUnitSchema.optional(),
    notes: weightNotesSchema.optional(),
  })
  .superRefine(validateExplicitWeightUnit);

export const patchWeightInputSchema = z
  .object({
    weight: bodyWeightValueSchema.optional(),
    unit: weightUnitSchema.optional(),
    notes: weightNotesSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.weight === undefined && value.notes === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field must be provided',
      });
    }

    if (value.unit !== undefined && value.weight === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: '`unit` requires `weight`',
        path: ['unit'],
      });
    }

    validateExplicitWeightUnit(value, context);
  });

export const bodyWeightEntrySchema = z.object({
  id: z.string(),
  date: dateSchema,
  weight: bodyWeightValueSchema,
  unit: weightUnitSchema,
  notes: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const deleteWeightResultSchema = z.object({
  deleted: z.literal(true),
  id: z.string(),
});

export const weightQueryParamsSchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    days: z.coerce.number().int().positive().max(3650).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
  })
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  })
  .refine(({ from, days }) => from === undefined || days === undefined, {
    message: '`from` and `days` cannot be used together',
    path: ['from'],
  });

export const trendWeightRangeSchema = z.enum(['1m', '3m', '6m', '1y', 'all']);

const trendWeightTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
      return true;
    } catch {
      return false;
    }
  }, 'Expected a valid IANA time zone');

export const trendWeightQuerySchema = z
  .object({
    range: trendWeightRangeSchema.default('1m'),
    end: dateSchema.optional(),
    timeZone: trendWeightTimeZoneSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.end && !value.timeZone) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Live Trend Weight requests require an IANA time zone',
        path: ['timeZone'],
      });
    }
  });

export const trendWeightStateSchema = z.enum([
  'no_data',
  'scale_only',
  'developing',
  'sufficient',
  'stale',
]);

export const trendWeightAlgorithmSchema = z
  .object({
    version: z.literal('trend-weight-v1'),
    windowDays: z.literal(30),
    alpha: z.literal(0.1),
    interpolation: z.literal('none'),
    minimumObservations: z.literal(2),
  })
  .strict();

export const trendWeightEvidenceSchema = z
  .object({
    observationCount: z.number().int().nonnegative(),
    spanDays: z.number().int().nonnegative(),
    latestAgeDays: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const trendWeightDeltaSchema = z
  .object({
    requestedDays: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(90)]),
    status: z.enum(['supported', 'unavailable']),
    value: z.number().finite().nullable(),
    fromAsOfDate: dateSchema,
    fromTrendDate: dateSchema.nullable(),
    toTrendDate: dateSchema.nullable(),
    reasonCode: z.enum(['NO_CURRENT_TREND', 'NO_PRIOR_TREND', 'STALE_CURRENT_TREND']).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const supported = value.status === 'supported';
    if (
      supported !==
      (value.value !== null &&
        value.fromTrendDate !== null &&
        value.toTrendDate !== null &&
        value.reasonCode === null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Trend Weight delta status must agree with values, dates, and reason',
      });
    }
    if (!supported && (value.value !== null || value.reasonCode === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unavailable Trend Weight deltas require a null value and reason',
      });
    }
  });

export const trendWeightPointSchema = z
  .object({
    sourceEntryId: z.string(),
    date: dateSchema,
    scaleWeight: z.number().positive().finite(),
    trendWeight: z.number().positive().finite().nullable(),
    scaleTrendDifference: z.number().finite().nullable(),
    state: z.enum(['scale_only', 'developing', 'sufficient']),
    observationCount: z.number().int().nonnegative(),
    spanDays: z.number().int().nonnegative(),
    gapFromPreviousDays: z.number().int().positive().nullable(),
    startsNewTrendSegment: z.boolean(),
    corrected: z.boolean(),
    annotation: z.string().nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const isScaleOnly = value.state === 'scale_only';
    if (
      isScaleOnly !==
      (value.trendWeight === null &&
        value.scaleTrendDifference === null &&
        value.observationCount === 1 &&
        value.spanDays === 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Scale-only points cannot expose Trend Weight precision',
      });
    }
    if (
      !isScaleOnly &&
      (value.trendWeight === null ||
        value.scaleTrendDifference === null ||
        value.observationCount < 2)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Established points require a trend, difference, and supporting observations',
      });
    }
    const hasSufficientEvidence = value.observationCount >= 3 && value.spanDays >= 14;
    if ((value.state === 'sufficient') !== hasSufficientEvidence) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Point state must agree with the evidence count and span',
        path: ['state'],
      });
    }
  });

export const trendWeightMarkerSchema = z
  .object({
    id: z.string(),
    date: dateSchema,
    kind: z.enum(['goal_started', 'goal_revised', 'check_in', 'correction']),
    label: z.string().min(1),
  })
  .strict();

export const trendWeightGoalSchema = z
  .object({
    id: z.string(),
    type: z.enum(['lose', 'maintain', 'gain']),
    targetWeight: z.number().positive().finite().nullable(),
    maintenanceCenter: z.number().positive().finite().nullable(),
    maintenanceLower: z.number().positive().finite().nullable(),
    maintenanceUpper: z.number().positive().finite().nullable(),
    desiredRatePerWeek: z.number().finite().nullable(),
    actualRatePerWeek: z.number().finite().nullable(),
    paceState: z.enum(['inside_goal_band', 'outside_goal_band', 'unavailable']),
    maintenanceBandState: z.enum([
      'inside_maintenance_band',
      'outside_maintenance_band',
      'not_applicable',
      'unavailable',
    ]),
    explanation: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const isMaintenance = value.type === 'maintain';
    const hasMaintenanceFields =
      value.targetWeight === null &&
      value.maintenanceCenter !== null &&
      value.maintenanceLower !== null &&
      value.maintenanceUpper !== null;
    const hasTargetFields =
      value.targetWeight !== null &&
      value.maintenanceCenter === null &&
      value.maintenanceLower === null &&
      value.maintenanceUpper === null;
    if (isMaintenance ? !hasMaintenanceFields : !hasTargetFields) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Goal target and maintenance fields must agree with the goal type',
      });
    }
    if (
      isMaintenance &&
      value.maintenanceCenter !== null &&
      value.maintenanceLower !== null &&
      value.maintenanceUpper !== null &&
      !(
        value.maintenanceLower < value.maintenanceCenter &&
        value.maintenanceCenter < value.maintenanceUpper
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maintenance corridor bounds must contain the center in ascending order',
        path: ['maintenanceCenter'],
      });
    }
    if (
      (value.type === 'lose' &&
        value.desiredRatePerWeek !== null &&
        value.desiredRatePerWeek >= 0) ||
      (value.type === 'gain' &&
        value.desiredRatePerWeek !== null &&
        value.desiredRatePerWeek <= 0) ||
      (isMaintenance && value.desiredRatePerWeek !== 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Desired Trend Weight rate sign must agree with the goal type',
        path: ['desiredRatePerWeek'],
      });
    }
    if (
      isMaintenance
        ? value.maintenanceBandState === 'not_applicable'
        : value.maintenanceBandState !== 'not_applicable'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Maintenance band state must agree with the goal type',
        path: ['maintenanceBandState'],
      });
    }
  });

export const trendWeightAnalyticsSchema = z
  .object({
    range: z
      .object({
        preset: trendWeightRangeSchema,
        startDate: dateSchema,
        endDate: dateSchema,
      })
      .strict(),
    timeZone: z.string().min(1),
    isHistorical: z.boolean(),
    unit: weightUnitSchema,
    algorithm: trendWeightAlgorithmSchema,
    current: z
      .object({
        latestScale: bodyWeightEntrySchema.nullable(),
        trendWeight: z.number().positive().finite().nullable(),
        trendDate: dateSchema.nullable(),
        scaleTrendDifference: z.number().finite().nullable(),
        ratePerWeek: z.number().finite().nullable(),
        rateEffectiveDate: dateSchema.nullable(),
        state: trendWeightStateSchema,
        evidence: trendWeightEvidenceSchema,
      })
      .strict()
      .superRefine((value, context) => {
        const trendMustBeNull = value.state === 'no_data' || value.state === 'scale_only';
        if (
          trendMustBeNull &&
          (value.trendWeight !== null ||
            value.trendDate !== null ||
            value.scaleTrendDifference !== null ||
            value.ratePerWeek !== null ||
            value.rateEffectiveDate !== null)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Low-data Trend Weight states cannot expose derived precision',
            path: ['trendWeight'],
          });
        }
        if (
          (value.state === 'developing' || value.state === 'sufficient') &&
          (value.trendWeight === null ||
            value.trendDate === null ||
            value.scaleTrendDifference === null)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Established Trend Weight states require a trend value, date, and difference',
            path: ['trendWeight'],
          });
        }
        if ((value.ratePerWeek === null) !== (value.rateEffectiveDate === null)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Trend Weight rate and effective date must be present together',
            path: ['ratePerWeek'],
          });
        }
        if (value.state === 'stale' && value.ratePerWeek !== null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Stale Trend Weight cannot expose a recent pace',
            path: ['ratePerWeek'],
          });
        }
        if (
          value.state === 'no_data' &&
          (value.latestScale !== null ||
            value.evidence.observationCount !== 0 ||
            value.evidence.spanDays !== 0 ||
            value.evidence.latestAgeDays !== null)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'No-data Trend Weight cannot carry measurement evidence',
            path: ['evidence'],
          });
        }
        if (
          value.state === 'scale_only' &&
          (value.latestScale === null ||
            value.evidence.observationCount !== 1 ||
            value.evidence.latestAgeDays === null ||
            value.evidence.latestAgeDays > TREND_WEIGHT_ALGORITHM.staleAfterDays)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Scale-only Trend Weight requires exactly one recent observation',
            path: ['evidence'],
          });
        }
        const hasSufficientEvidence =
          value.evidence.observationCount >= 3 && value.evidence.spanDays >= 14;
        if (
          (value.state === 'sufficient') !==
          (hasSufficientEvidence && (value.evidence.latestAgeDays ?? Number.POSITIVE_INFINITY) <= 7)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Sufficient state must agree with observation count, span, and freshness',
            path: ['state'],
          });
        }
        if (
          value.state === 'developing' &&
          (value.evidence.observationCount < 2 ||
            hasSufficientEvidence ||
            value.evidence.latestAgeDays === null ||
            value.evidence.latestAgeDays > TREND_WEIGHT_ALGORITHM.staleAfterDays)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Developing state must carry limited but usable evidence',
            path: ['state'],
          });
        }
        if (
          value.state === 'stale' &&
          !(
            value.evidence.latestAgeDays !== null &&
            value.evidence.latestAgeDays > 7 &&
            ((value.trendWeight !== null &&
              value.trendDate !== null &&
              value.scaleTrendDifference !== null &&
              value.evidence.observationCount >= 2) ||
              (value.trendWeight === null &&
                value.trendDate === null &&
                value.scaleTrendDifference === null &&
                value.evidence.observationCount === 1 &&
                value.evidence.spanDays === 0 &&
                value.evidence.latestAgeDays < TREND_WEIGHT_ALGORITHM.windowDays) ||
              (value.trendWeight === null &&
                value.trendDate === null &&
                value.scaleTrendDifference === null &&
                value.evidence.observationCount === 0 &&
                value.evidence.spanDays === 0 &&
                value.evidence.latestAgeDays >= TREND_WEIGHT_ALGORITHM.windowDays))
          )
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Stale state requires supported old evidence or an expired evidence window',
            path: ['state'],
          });
        }
      }),
    deltas: z
      .array(trendWeightDeltaSchema)
      .length(4)
      .refine(
        (values) =>
          values
            .map((value) => value.requestedDays)
            .sort((left, right) => left - right)
            .join(',') === '7,14,30,90',
        'Trend Weight deltas must contain unique 7, 14, 30, and 90 day intervals',
      ),
    points: z.array(trendWeightPointSchema),
    markers: z.array(trendWeightMarkerSchema),
    goal: trendWeightGoalSchema.nullable(),
    explanation: z
      .object({
        headline: z.string().min(1),
        detail: z.string().min(1),
        lag: z.string().min(1),
        confidence: z.string().min(1),
        facts: z
          .object({
            confidenceReason: z.enum([
              'NO_MEASUREMENTS',
              'ONE_RECENT_MEASUREMENT',
              'LIMITED_EVIDENCE_SPAN',
              'STALE_MEASUREMENTS',
              'SUFFICIENT_EVIDENCE',
            ]),
            scaleTrendRelation: z.enum(['unavailable', 'above', 'below', 'aligned']),
            paceDirection: z.enum(['unavailable', 'losing', 'gaining', 'stable']),
            paceFreshness: z.enum(['unavailable', 'current', 'stale']),
            goalComparison: z.enum([
              'no_goal',
              'unavailable',
              'inside_goal_band',
              'outside_goal_band',
            ]),
          })
          .strict(),
      })
      .strict(),
    policy: z
      .object({
        productTrend: z.literal('trend-weight-v1'),
        trajectory: z.literal('product_trend_weight'),
        coaching: z.literal('product_trend_weight'),
        goalEta: z.literal('adaptive_model_trend'),
        goalCompletion: z.literal('adaptive_model_trend'),
        maintenanceRange: z.literal('adaptive_model_trend'),
        celebrations: z.literal('adaptive_model_trend'),
        adaptiveTdee: z.literal('adaptive_model_trend'),
        measurementHistory: z.literal('scale_weight'),
        explanation: z.string().min(1),
      })
      .strict(),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.current.state === 'no_data' && value.points.length !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No-data analytics cannot expose observation points',
        path: ['points'],
      });
    }
    const currentWindowStart = addTrendWeightCalendarDays(
      value.range.endDate,
      -(TREND_WEIGHT_ALGORITHM.windowDays - 1),
    );
    const currentWindowPoints = value.points.filter(
      (point) => point.date >= currentWindowStart && point.date <= value.range.endDate,
    );
    if (
      value.current.state === 'scale_only' &&
      (currentWindowPoints.length !== 1 || currentWindowPoints[0]?.state !== 'scale_only')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Scale-only analytics require exactly one recent scale-only point',
        path: ['points'],
      });
    }
  });

export type BodyWeightEntry = z.infer<typeof bodyWeightEntrySchema>;
export type CreateWeightInput = z.infer<typeof createWeightInputSchema>;
export type DeleteWeightResult = z.infer<typeof deleteWeightResultSchema>;
export type PatchWeightInput = z.infer<typeof patchWeightInputSchema>;
export type WeightQueryParams = z.infer<typeof weightQueryParamsSchema>;
export type TrendWeightAnalytics = z.infer<typeof trendWeightAnalyticsSchema>;
export type TrendWeightQuery = z.infer<typeof trendWeightQuerySchema>;
export type TrendWeightRange = z.infer<typeof trendWeightRangeSchema>;
