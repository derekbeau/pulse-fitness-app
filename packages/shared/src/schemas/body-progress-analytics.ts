import { z } from 'zod';

import {
  bodyEnabledSiteSchema,
  bodyMeasurementLateralitySchema,
  bodyMeasurementSiteSchema,
  bodyReadingQualitySchema,
} from './body-check-ins.js';
import { dateSchema } from './common.js';
import { lengthUnitSchema } from './body-measurements.js';
import { weightUnitSchema } from './users.js';

export const BODY_PROGRESS_ANALYTICS_VERSION = 'body-progress-analytics-v1' as const;
export const BODY_PROGRESS_ANALYTICS_CONSTANTS = Object.freeze({
  minimumCompatibleCheckIns: 3,
  minimumElapsedDays: 28,
  minimumSpacingDays: 10,
  freshnessGraceDays: 7,
  noiseFloorMm: Object.freeze({
    waist_iliac_crest_nhanes: 20,
    chest_nipple_line_relaxed: 10,
    hips_maximum: 10,
    upper_arm_midpoint_flexed: 10,
    thigh_midpoint: 10,
  }),
});

export const bodyProgressRangeSchema = z.enum(['1m', '3m', '6m', '1y', 'all']);
export const bodyProgressDirectionSchema = z.enum([
  'up',
  'down',
  'stable_within_measurement_noise',
  'unavailable',
]);
export const bodyProgressSignalStateSchema = z.enum([
  'insufficient_data',
  'favorable_gain_signal',
  'possible_recomp_signal',
  'possible_fat_gain_signal',
  'favorable_loss_signal',
  'maintenance_signal',
  'mixed_signal',
  'stale',
]);
export const bodyProgressConfidenceSchema = z.enum(['high', 'medium', 'low', 'unavailable']);
export const bodyProgressReasonCodeSchema = z.enum([
  'INSUFFICIENT_COMPATIBLE_CHECK_INS',
  'INSUFFICIENT_ELAPSED_DAYS',
  'CHECK_INS_TOO_CLOSE',
  'INCOMPATIBLE_PROTOCOL_SEGMENTS',
  'HIGH_VARIANCE_PRESENT',
  'MEASUREMENT_FRESHNESS_UNRESOLVED',
  'MEASUREMENTS_STALE',
  'WEIGHT_EVIDENCE_UNAVAILABLE',
  'WEIGHT_EVIDENCE_DEVELOPING',
  'WEIGHT_EVIDENCE_STALE',
  'WAIST_EVIDENCE_UNAVAILABLE',
  'MUSCULAR_SUPPORT_UNAVAILABLE',
  'STRENGTH_EVIDENCE_UNAVAILABLE',
  'GOAL_UNSET',
  'WEIGHT_UP',
  'WEIGHT_DOWN',
  'WEIGHT_STABLE',
  'WAIST_UP',
  'WAIST_DOWN',
  'WAIST_STABLE',
  'MUSCULAR_SITE_UP',
  'CIRCUMFERENCES_STABLE',
  'STRENGTH_IMPROVING',
  'STRENGTH_STABLE',
  'STRENGTH_DECLINING',
  'CONTRADICTORY_EVIDENCE',
  'INSIDE_MAINTENANCE_CORRIDOR',
  'OUTSIDE_MAINTENANCE_CORRIDOR',
]);

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const optionalIanaTimeZoneSchema = z
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
  }, 'Invalid IANA time zone');

export const bodyProgressAnalyticsQuerySchema = z
  .object({
    range: bodyProgressRangeSchema.default('3m'),
    end: dateSchema.optional(),
    timeZone: optionalIanaTimeZoneSchema.optional(),
  })
  .strict();

export const bodyProgressPointSchema = z
  .object({
    checkInId: z.string(),
    measurementId: z.string(),
    date: dateSchema,
    checkInVersion: z.number().int().positive(),
    site: bodyMeasurementSiteSchema,
    laterality: bodyMeasurementLateralitySchema,
    canonicalMm: z.number().int().min(200).max(3000),
    readingsMm: z.tuple([
      z.number().int().min(200).max(3000),
      z.number().int().min(200).max(3000).nullable(),
      z.number().int().min(200).max(3000).nullable(),
    ]),
    unitAtEntry: lengthUnitSchema,
    quality: bodyReadingQualitySchema,
    protocolId: bodyMeasurementSiteSchema,
    protocolVersion: z.string().trim().min(1),
    source: z.enum(['user', 'agent_token']),
    sourceId: z.string().nullable(),
    corrected: z.boolean(),
    correctedAt: z.number().int().nullable(),
    correctionReason: z.string().nullable(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict();

const segmentAnalysisStateSchema = z.enum([
  'supported',
  'insufficient',
  'high_variance',
  'stale',
  'freshness_unresolved',
]);

export const bodyProgressSegmentSchema = z
  .object({
    id: z.string(),
    site: bodyMeasurementSiteSchema,
    laterality: bodyMeasurementLateralitySchema,
    protocolVersion: z.string().trim().min(1),
    noiseFloorMm: z.number().positive(),
    points: z.array(bodyProgressPointSchema),
    rawDelta: z
      .object({
        fromCheckInId: z.string(),
        fromDate: dateSchema,
        fromCanonicalMm: z.number().int(),
        toCheckInId: z.string(),
        toDate: dateSchema,
        toCanonicalMm: z.number().int(),
        deltaMm: z.number().int(),
      })
      .strict()
      .nullable(),
    analysis: z
      .object({
        state: segmentAnalysisStateSchema,
        direction: bodyProgressDirectionSchema,
        compatiblePointCount: z.number().int().nonnegative(),
        independentlySpacedPointCount: z.number().int().nonnegative(),
        elapsedDays: z.number().int().nonnegative(),
        latestAgeDays: z.number().int().nonnegative(),
        freshnessLimitDays: z.number().int().positive().nullable(),
        slopeMmPerDay: z.number().finite().nullable(),
        fittedTotalChangeMm: z.number().finite().nullable(),
        reasonCodes: z.array(bodyProgressReasonCodeSchema),
      })
      .strict(),
    qualityStates: z.array(bodyReadingQualitySchema),
  })
  .strict();

const legacySiteSchema = z.enum([
  'waist',
  'hips',
  'chest',
  'neck',
  'left_arm',
  'right_arm',
  'left_thigh',
  'right_thigh',
]);

export const bodyProgressLegacyPointSchema = z
  .object({
    entryId: z.string(),
    date: dateSchema,
    site: legacySiteSchema,
    canonicalMm: z.number().int().min(200).max(3000),
    unitAtEntry: lengthUnitSchema.nullable(),
    provenance: z.literal('legacy_unknown'),
    compatibility: z.literal('unsupported'),
    limitation: z.string().min(1),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict();

export const bodyProgressStrengthEvidenceSchema = z
  .object({
    state: z.enum(['improving', 'stable', 'declining', 'mixed', 'unavailable', 'stale']),
    confidence: z.enum(['supported', 'limited', 'unavailable']),
    sourceContract: z.literal('workout-progression-v1'),
    sourceDates: z.array(dateSchema).max(100),
    recommendationIds: z.array(z.string()).max(100),
    sourceFingerprints: z.array(fingerprintSchema).max(100),
    reason: z.string().min(1),
  })
  .strict();

export const bodyProgressWeightSummarySchema = z
  .object({
    sourceContract: z.literal('trend-weight-v1'),
    sourceFingerprint: fingerprintSchema,
    state: z.enum(['no_data', 'scale_only', 'developing', 'sufficient', 'stale']),
    direction: z.enum(['up', 'down', 'stable', 'unavailable']),
    trendWeight: z.number().finite().positive().nullable(),
    trendDate: dateSchema.nullable(),
    recentPacePerWeek: z.number().finite().nullable(),
    recentPaceEffectiveDate: dateSchema.nullable(),
    paceFreshness: z.enum(['current', 'stale', 'unavailable']),
    unit: weightUnitSchema,
    observationCount: z.number().int().nonnegative(),
    spanDays: z.number().int().nonnegative(),
    latestAgeDays: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const bodyProgressGoalSchema = z
  .object({
    type: z.enum(['gain', 'lose', 'maintain', 'unset']),
    sourceContract: z.literal('trend-weight-v1'),
    goalId: z.string().nullable(),
    maintenanceBandState: z
      .enum([
        'inside_maintenance_band',
        'outside_maintenance_band',
        'unavailable',
        'not_applicable',
      ])
      .nullable(),
  })
  .strict();

export const bodyProgressFactSchema = z
  .object({
    code: bodyProgressReasonCodeSchema,
    label: z.string().trim().min(1).max(300),
    source: z.enum(['body_check_ins', 'trend_weight', 'workout_progression', 'goal']),
    date: dateSchema.nullable(),
  })
  .strict();

const honestCopySchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .superRefine((value, context) => {
    const prohibited = [
      /(?:gained|lost|added|burned)\s+\d+(?:\.\d+)?\s*(?:lb|lbs|kg|pounds?|kilograms?)?\s*(?:of\s+)?(?:muscle|fat)/i,
      /body[- ]fat(?: percentage)?\s*(?:is|=)\s*\d/i,
      /(?:diagnoses|diagnosed|diagnostic of)\b/i,
    ];
    if (prohibited.some((pattern) => pattern.test(value))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Body Progress copy cannot claim measured tissue change or diagnosis',
      });
    }
  });

export const bodyProgressSignalSchema = z
  .object({
    state: bodyProgressSignalStateSchema,
    confidence: bodyProgressConfidenceSchema,
    reasonCodes: z.array(bodyProgressReasonCodeSchema),
    supportingFacts: z.array(bodyProgressFactSchema),
    contradictoryFacts: z.array(bodyProgressFactSchema),
    unavailableInputs: z.array(
      z.enum(['goal', 'trend_weight', 'waist', 'muscular_circumference', 'strength', 'cadence']),
    ),
    headline: honestCopySchema,
    detail: honestCopySchema,
    limitations: z.array(honestCopySchema).min(1),
    nextAction: honestCopySchema,
  })
  .strict();

export const bodyProgressMarkerSchema = z
  .object({
    id: z.string(),
    date: dateSchema,
    kind: z.enum(['check_in', 'correction', 'protocol_change', 'goal_started', 'goal_revised']),
    label: z.string().min(1),
    sourceId: z.string(),
  })
  .strict();

export const bodyProgressAnalyticsSchema = z
  .object({
    range: z
      .object({
        preset: bodyProgressRangeSchema,
        startDate: dateSchema,
        endDate: dateSchema,
        asOfDate: dateSchema,
      })
      .strict(),
    timeZone: optionalIanaTimeZoneSchema,
    isHistorical: z.boolean(),
    algorithm: z
      .object({
        version: z.literal(BODY_PROGRESS_ANALYTICS_VERSION),
        minimumCompatibleCheckIns: z.literal(3),
        minimumElapsedDays: z.literal(28),
        minimumSpacingDays: z.literal(10),
        freshnessGraceDays: z.literal(7),
        noiseFloorMm: z
          .object({
            waist_iliac_crest_nhanes: z.literal(20),
            chest_nipple_line_relaxed: z.literal(10),
            hips_maximum: z.literal(10),
            upper_arm_midpoint_flexed: z.literal(10),
            thigh_midpoint: z.literal(10),
          })
          .strict(),
        regression: z.literal('dated_ordinary_least_squares'),
        interpolation: z.literal('none'),
        highVariancePolicy: z.literal('blocks_direction_preserves_history'),
      })
      .strict(),
    goal: bodyProgressGoalSchema,
    weight: bodyProgressWeightSummarySchema,
    readiness: z
      .object({
        state: z.enum(['ready', 'insufficient', 'stale', 'unresolved']),
        completedCheckInCount: z.number().int().nonnegative(),
        compatibleSegmentCount: z.number().int().nonnegative(),
        supportedSegmentCount: z.number().int().nonnegative(),
        latestCompletedDate: dateSchema.nullable(),
        cadenceDays: z.number().int().min(7).max(90).nullable(),
        enabledSites: z.array(bodyEnabledSiteSchema),
        reasonCodes: z.array(bodyProgressReasonCodeSchema),
      })
      .strict(),
    segments: z.array(bodyProgressSegmentSchema),
    legacyPoints: z.array(bodyProgressLegacyPointSchema),
    strengthEvidence: bodyProgressStrengthEvidenceSchema,
    signal: bodyProgressSignalSchema,
    markers: z.array(bodyProgressMarkerSchema),
    sourceFingerprint: fingerprintSchema,
  })
  .strict();

export const bodyProgressContextSummarySchema = z
  .object({
    contractVersion: z.literal(BODY_PROGRESS_ANALYTICS_VERSION),
    asOfDate: dateSchema,
    signal: bodyProgressSignalStateSchema,
    confidence: bodyProgressConfidenceSchema,
    supportingFacts: z.array(bodyProgressFactSchema).max(6),
    contradictoryFacts: z.array(bodyProgressFactSchema).max(6),
    unavailableInputs: z.array(z.string()).max(6),
    sourceDates: z.array(dateSchema).max(12),
    sourceFingerprint: fingerprintSchema.nullable(),
  })
  .strict();

export type BodyProgressAnalytics = z.infer<typeof bodyProgressAnalyticsSchema>;
export type BodyProgressRange = z.infer<typeof bodyProgressRangeSchema>;
export type BodyProgressAnalyticsQuery = z.infer<typeof bodyProgressAnalyticsQuerySchema>;
export type BodyProgressPoint = z.infer<typeof bodyProgressPointSchema>;
export type BodyProgressSegment = z.infer<typeof bodyProgressSegmentSchema>;
export type BodyProgressLegacyPoint = z.infer<typeof bodyProgressLegacyPointSchema>;
export type BodyProgressStrengthEvidence = z.infer<typeof bodyProgressStrengthEvidenceSchema>;
export type BodyProgressSignal = z.infer<typeof bodyProgressSignalSchema>;
export type BodyProgressContextSummary = z.infer<typeof bodyProgressContextSummarySchema>;
export type BodyProgressReasonCode = z.infer<typeof bodyProgressReasonCodeSchema>;
