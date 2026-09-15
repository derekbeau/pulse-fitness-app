import { z } from 'zod';

import { calculateCanonicalBodyReading } from '../utils/body-reading-quality.js';
import { dateSchema } from './common.js';
import { lengthUnitSchema } from './body-measurements.js';

export const BODY_CHECK_IN_CONTRACT_VERSION = 'body-check-ins-v1' as const;
export const BODY_PROTOCOL_VERSION = 'body-circumference-v1' as const;

export const bodyMeasurementSiteSchema = z.enum([
  'waist_iliac_crest_nhanes',
  'chest_nipple_line_relaxed',
  'hips_maximum',
  'upper_arm_midpoint_flexed',
  'thigh_midpoint',
]);
export const bodyMeasurementLateralitySchema = z.enum(['none', 'left', 'right']);

export const bodyMeasurementProtocols = {
  waist_iliac_crest_nhanes: {
    name: 'NHANES iliac-crest waist',
    instructions:
      'Stand with feet together, abdomen relaxed, and arms at sides. At the end of a normal expiration, keep the tape horizontal immediately above the right iliac crest and parallel to the floor. Do not use the narrowest waist, midpoint, or umbilicus.',
    sourceUrls: [
      'https://wwwn.cdc.gov/nchs/data/nhanes/public/2021/manuals/2021-Anthropometry-Procedures-Manual-508.pdf',
      'https://www.phenxtoolkit.org/protocols/view/21604',
    ],
  },
  chest_nipple_line_relaxed: {
    name: 'Relaxed nipple-line chest',
    instructions:
      'Stand relaxed with the tape horizontal at nipple line, arms relaxed after positioning, at normal expiration, without deliberate chest expansion.',
    sourceUrls: ['https://github.com/derekbeau/pulse-fitness-app/issues/121'],
  },
  hips_maximum: {
    name: 'Maximum hip circumference',
    instructions:
      'Stand with feet together and keep the tape horizontal at the maximum buttocks circumference.',
    sourceUrls: ['https://github.com/derekbeau/pulse-fitness-app/issues/121'],
  },
  upper_arm_midpoint_flexed: {
    name: 'Flexed midpoint upper arm',
    instructions:
      'Use the selected side at the midpoint between acromion and olecranon and flex consistently without changing the landmark.',
    sourceUrls: ['https://github.com/derekbeau/pulse-fitness-app/issues/121'],
  },
  thigh_midpoint: {
    name: 'Midpoint thigh',
    instructions:
      'Use the selected side at the fixed midpoint protocol, standing with weight distributed consistently.',
    sourceUrls: ['https://github.com/derekbeau/pulse-fitness-app/issues/121'],
  },
} as const;

const siteLateralitySchema = z
  .object({
    site: bodyMeasurementSiteSchema,
    laterality: bodyMeasurementLateralitySchema,
  })
  .strict()
  .superRefine(({ laterality, site }, context) => {
    const requiresSide = site === 'upper_arm_midpoint_flexed' || site === 'thigh_midpoint';
    if ((requiresSide && laterality === 'none') || (!requiresSide && laterality !== 'none')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: requiresSide
          ? 'Arm and thigh sites require left or right laterality'
          : 'Waist, chest, and hips require none laterality',
        path: ['laterality'],
      });
    }
  });

export const bodyEnabledSiteSchema = siteLateralitySchema;
export const defaultBodyEnabledSites: BodyEnabledSite[] = [
  { site: 'waist_iliac_crest_nhanes', laterality: 'none' },
  { site: 'chest_nipple_line_relaxed', laterality: 'none' },
  { site: 'hips_maximum', laterality: 'none' },
  { site: 'upper_arm_midpoint_flexed', laterality: 'right' },
  { site: 'thigh_midpoint', laterality: 'right' },
];

const enabledSitesSchema = z
  .array(bodyEnabledSiteSchema)
  .min(1)
  .max(7)
  .superRefine((sites, context) => {
    const keys = sites.map(({ site, laterality }) => `${site}:${laterality}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Enabled sites must be unique' });
    }
  });

const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a local time in HH:MM format');

export const bodyCheckInPreferenceSchema = z
  .object({
    contractVersion: z.literal(BODY_CHECK_IN_CONTRACT_VERSION),
    measurementCadenceDays: z.number().int().min(7).max(90),
    lengthUnit: lengthUnitSchema,
    enabledSites: enabledSitesSchema,
    anchorDate: dateSchema,
    reminderLocalTime: localTimeSchema.nullable(),
    protocolVersion: z.literal(BODY_PROTOCOL_VERSION),
    snoozedUntil: dateSchema.nullable(),
    lastDismissedDueDate: dateSchema.nullable(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict();

export const patchBodyCheckInPreferenceSchema = z
  .object({
    measurementCadenceDays: z.number().int().min(7).max(90).optional(),
    lengthUnit: lengthUnitSchema.optional(),
    enabledSites: enabledSitesSchema.optional(),
    anchorDate: dateSchema.optional(),
    reminderLocalTime: localTimeSchema.nullable().optional(),
    cadenceChange: z.enum(['preserve_anchor', 'restart']).optional(),
    restartAnchorDate: dateSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.measurementCadenceDays !== undefined && value.cadenceChange === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cadence changes must explicitly preserve or restart the anchor',
        path: ['cadenceChange'],
      });
    }
    if (value.cadenceChange === 'restart' && value.restartAnchorDate === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Restarting cadence requires restartAnchorDate',
        path: ['restartAnchorDate'],
      });
    }
    if (value.cadenceChange !== 'restart' && value.restartAnchorDate !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'restartAnchorDate is only valid when restarting cadence',
        path: ['restartAnchorDate'],
      });
    }
    if (value.cadenceChange === 'preserve_anchor' && value.anchorDate !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Preserving cadence cannot replace the existing anchor',
        path: ['anchorDate'],
      });
    }
  });

export const bodyReadingQualitySchema = z.enum([
  'single_reading',
  'replicated',
  'needs_third_reading',
  'replicated_with_tiebreaker',
  'high_variance',
]);

const circumferenceReadingSchema = z.number().finite().positive().max(300).multipleOf(0.1);
const measurementInputShape = {
  site: bodyMeasurementSiteSchema,
  laterality: bodyMeasurementLateralitySchema,
  unit: lengthUnitSchema,
  readings: z.array(circumferenceReadingSchema).min(1).max(3),
} as const;

const validateMeasurementLaterality = (
  { laterality, site }: { laterality: BodyMeasurementLaterality; site: BodyMeasurementSite },
  context: z.RefinementCtx,
) => {
  const requiresSide = site === 'upper_arm_midpoint_flexed' || site === 'thigh_midpoint';
  if ((requiresSide && laterality === 'none') || (!requiresSide && laterality !== 'none')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: requiresSide
        ? 'Arm and thigh sites require left or right laterality'
        : 'Waist, chest, and hips require none laterality',
      path: ['laterality'],
    });
  }
};

export const bodyCheckInMeasurementInputSchema = z
  .object(measurementInputShape)
  .strict()
  .superRefine((value, context) => {
    validateMeasurementLaterality(value, context);
    for (const [index, reading] of value.readings.entries()) {
      const millimetres = Math.round(reading * (value.unit === 'cm' ? 10 : 25.4));
      if (millimetres < 200 || millimetres > 3000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Reading must be between 20 and 300 cm after conversion',
          path: ['readings', index],
        });
      }
    }
    const [first, second] = value.readings;
    if (
      value.readings.length === 2 &&
      first !== undefined &&
      second !== undefined &&
      calculateCanonicalBodyReading([first, second], value.unit).quality === 'needs_third_reading'
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A third reading is required to complete this measurement',
        path: ['readings', 2],
      });
    }
  });

export const bodyCheckInMeasurementDraftInputSchema = z
  .object(measurementInputShape)
  .strict()
  .superRefine((value, context) => {
    validateMeasurementLaterality(value, context);
    for (const [index, reading] of value.readings.entries()) {
      const millimetres = Math.round(reading * (value.unit === 'cm' ? 10 : 25.4));
      if (millimetres < 200 || millimetres > 3000) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Reading must be between 20 and 300 cm after conversion',
          path: ['readings', index],
        });
      }
    }
  });

export const bodyCheckInMeasurementSchema = z
  .object({
    id: z.string(),
    site: bodyMeasurementSiteSchema,
    laterality: bodyMeasurementLateralitySchema,
    unitAtEntry: lengthUnitSchema,
    reading1Mm: z.number().int().min(200).max(3000),
    reading2Mm: z.number().int().min(200).max(3000).nullable(),
    reading3Mm: z.number().int().min(200).max(3000).nullable(),
    canonicalMm: z.number().int().min(200).max(3000),
    quality: bodyReadingQualitySchema,
    selectedReadingPair: z
      .tuple([z.number().int().min(1).max(3), z.number().int().min(1).max(3)])
      .nullable(),
    protocolId: bodyMeasurementSiteSchema,
    protocolVersion: z.literal(BODY_PROTOCOL_VERSION),
    protocolName: z.string(),
    protocolInstructions: z.string(),
    protocolSourceUrls: z.array(z.string().url()).min(1),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict();

export const bodyCheckInStatusSchema = z.enum(['draft', 'completed']);
export const bodyCheckInSourceSchema = z.enum(['user', 'agent_token']);
export const bodyMealContextSchema = z.enum(['unspecified', 'pre_meal', 'post_meal']);
export const bodyWorkoutContextSchema = z.enum(['unspecified', 'pre_workout', 'post_workout']);

const bodyCheckInMutableFields = {
  localTime: localTimeSchema.nullable().optional(),
  mealContext: bodyMealContextSchema.optional(),
  workoutContext: bodyWorkoutContextSchema.optional(),
  pumpPresent: z.boolean().nullable().optional(),
  unusualBloating: z.boolean().nullable().optional(),
  notes: z.string().trim().min(1).max(2000).nullable().optional(),
  countAsScheduledOccurrence: z.boolean().optional(),
} as const;

const uniqueMeasurements = (
  measurements: Array<{ site: BodyMeasurementSite; laterality: BodyMeasurementLaterality }>,
  context: z.RefinementCtx,
) => {
  const keys = measurements.map(({ laterality, site }) => `${site}:${laterality}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Measurements must be unique' });
  }
};

export const createBodyCheckInInputSchema = z
  .object({
    date: dateSchema,
    status: bodyCheckInStatusSchema,
    measurements: z.array(bodyCheckInMeasurementDraftInputSchema).max(7).default([]),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
    ...bodyCheckInMutableFields,
  })
  .strict()
  .superRefine((value, context) => {
    uniqueMeasurements(value.measurements, context);
    if (value.status === 'completed') {
      for (const [index, measurement] of value.measurements.entries()) {
        const result = bodyCheckInMeasurementInputSchema.safeParse(measurement);
        if (!result.success) {
          for (const issue of result.error.issues) {
            context.addIssue({ ...issue, path: ['measurements', index, ...issue.path] });
          }
        }
      }
    }
  });

export const patchBodyCheckInInputSchema = z
  .object({
    status: bodyCheckInStatusSchema.optional(),
    measurements: z.array(bodyCheckInMeasurementDraftInputSchema).max(7).optional(),
    correctionReason: z.string().trim().min(1).max(500).optional(),
    ...bodyCheckInMutableFields,
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one field is required' });
    }
    if (value.measurements) uniqueMeasurements(value.measurements, context);
    if (value.status === 'completed' && value.measurements) {
      for (const [index, measurement] of value.measurements.entries()) {
        const result = bodyCheckInMeasurementInputSchema.safeParse(measurement);
        if (!result.success) {
          for (const issue of result.error.issues) {
            context.addIssue({ ...issue, path: ['measurements', index, ...issue.path] });
          }
        }
      }
    }
  });

export const bodyCheckInSchema = z
  .object({
    contractVersion: z.literal(BODY_CHECK_IN_CONTRACT_VERSION),
    id: z.string(),
    date: dateSchema,
    localTime: localTimeSchema.nullable(),
    status: bodyCheckInStatusSchema,
    mealContext: bodyMealContextSchema,
    workoutContext: bodyWorkoutContextSchema,
    pumpPresent: z.boolean().nullable(),
    unusualBloating: z.boolean().nullable(),
    notes: z.string().nullable(),
    protocolVersion: z.literal(BODY_PROTOCOL_VERSION),
    source: bodyCheckInSourceSchema,
    sourceId: z.string().nullable(),
    countAsScheduledOccurrence: z.boolean(),
    measurements: z.array(bodyCheckInMeasurementSchema),
    completedAt: z.number().int().nullable(),
    correctedAt: z.number().int().nullable(),
    correctedBySource: bodyCheckInSourceSchema.nullable(),
    correctedBySourceId: z.string().nullable(),
    correctionReason: z.string().nullable(),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict();

export const bodyCheckInListQuerySchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'from must be on or before to',
  });

export const bodyDueStateNameSchema = z.enum([
  'not_configured',
  'upcoming',
  'due_today',
  'overdue',
  'snoozed',
  'skipped_current_occurrence',
  'satisfied',
  'error',
]);
export const bodyDueStateSchema = z
  .object({
    contractVersion: z.literal(BODY_CHECK_IN_CONTRACT_VERSION),
    state: bodyDueStateNameSchema,
    localDate: dateSchema.nullable(),
    timeZone: z.string().nullable(),
    timeZoneSource: z.enum(['adaptive_program', 'user_profile']).nullable(),
    occurrenceDueDate: dateSchema.nullable(),
    nextDueDate: dateSchema.nullable(),
    snoozedUntil: dateSchema.nullable(),
    satisfiedByCheckInId: z.string().nullable(),
  })
  .strict();

export const bodyDueQuerySchema = z.object({ date: dateSchema.optional() }).strict();
export const skipBodyDueInputSchema = z.object({}).strict();
export const snoozeBodyDueInputSchema = z.object({ snoozedUntil: dateSchema }).strict();

export const bodyContextLatestSchema = z
  .object({
    id: z.string(),
    date: dateSchema,
    correctedAt: z.number().int().nullable(),
    hasWaist: z.boolean(),
    measurements: z.array(
      z.object({
        site: bodyMeasurementSiteSchema,
        laterality: bodyMeasurementLateralitySchema,
        canonicalMm: z.number().int(),
        quality: bodyReadingQualitySchema,
      }),
    ),
  })
  .strict();

export const bodyContextFactsSchema = z
  .object({
    contractVersion: z.literal(BODY_CHECK_IN_CONTRACT_VERSION),
    configured: z.boolean(),
    enabledSites: z.array(bodyEnabledSiteSchema),
    latestCompleted: bodyContextLatestSchema.nullable(),
    due: bodyDueStateSchema,
  })
  .strict();

export const bodyCheckInExportSchema = z
  .object({
    contractVersion: z.literal(BODY_CHECK_IN_CONTRACT_VERSION),
    exportedAt: z.number().int(),
    preferences: bodyCheckInPreferenceSchema.nullable(),
    checkIns: z.array(bodyCheckInSchema),
  })
  .strict();

export type BodyEnabledSite = z.infer<typeof bodyEnabledSiteSchema>;
export type BodyMeasurementSite = z.infer<typeof bodyMeasurementSiteSchema>;
export type BodyMeasurementLaterality = z.infer<typeof bodyMeasurementLateralitySchema>;
export type BodyCheckInPreference = z.infer<typeof bodyCheckInPreferenceSchema>;
export type PatchBodyCheckInPreference = z.infer<typeof patchBodyCheckInPreferenceSchema>;
export type BodyCheckInMeasurementInput = z.infer<typeof bodyCheckInMeasurementDraftInputSchema>;
export type BodyCheckInMeasurement = z.infer<typeof bodyCheckInMeasurementSchema>;
export type CreateBodyCheckInInput = z.infer<typeof createBodyCheckInInputSchema>;
export type PatchBodyCheckInInput = z.infer<typeof patchBodyCheckInInputSchema>;
export type BodyCheckIn = z.infer<typeof bodyCheckInSchema>;
export type BodyDueState = z.infer<typeof bodyDueStateSchema>;
export type BodyCheckInSource = z.infer<typeof bodyCheckInSourceSchema>;
export type BodyMealContext = z.infer<typeof bodyMealContextSchema>;
export type BodyWorkoutContext = z.infer<typeof bodyWorkoutContextSchema>;
