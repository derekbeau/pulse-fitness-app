import { z } from 'zod';

import { dateSchema } from './common.js';

export const BODY_PROGRESS_PHOTO_CONTRACT_VERSION = 'body-progress-photos-v1' as const;
export const BODY_PROGRESS_PHOTO_CONSENT_VERSION = 'body-progress-photo-consent-v1' as const;
export const BODY_PROGRESS_PHOTO_GUIDE_VERSION = 'body-progress-photo-guide-v1' as const;
export const BODY_PROGRESS_PHOTO_PROCESSING_VERSION = 'sharp-jpeg-v1' as const;
export const BODY_PROGRESS_PHOTO_ENCRYPTION_VERSION = 'aes-256-gcm-v1' as const;
export const BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES = 12 * 1024 * 1024;
export const BODY_PROGRESS_PHOTO_MAX_FILES = 3;
export const BODY_PROGRESS_PHOTO_MAX_PIXELS = 40_000_000;
export const BODY_PROGRESS_PHOTO_MAX_REQUEST_BYTES =
  BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES * BODY_PROGRESS_PHOTO_MAX_FILES + 64 * 1024;

export const bodyProgressPhotoViewSchema = z.enum(['front', 'side_left', 'side_right', 'back']);
export const bodyProgressPhotoVariantSchema = z.enum([
  'original',
  'full',
  'comparison',
  'thumbnail',
]);
export const bodyProgressPhotoContentVariantSchema = bodyProgressPhotoVariantSchema.exclude([
  'original',
]);
export const bodyProgressPhotoSetStatusSchema = z.enum(['partial', 'complete']);
export const bodyProgressPhotoConsentStateSchema = z.enum([
  'not_decided',
  'declined',
  'granted',
  'revoked',
]);
export const bodyProgressPhotoErrorCodeSchema = z.enum([
  'BODY_PROGRESS_PHOTO_UNAUTHORIZED',
  'BODY_PROGRESS_PHOTO_FORBIDDEN',
  'BODY_PROGRESS_PHOTO_CONSENT_REQUIRED',
  'BODY_PROGRESS_PHOTO_CONSENT_REVOKED',
  'BODY_PROGRESS_PHOTO_INVALID',
  'BODY_PROGRESS_PHOTO_SIZE_LIMIT',
  'BODY_PROGRESS_PHOTO_FILE_COUNT_LIMIT',
  'BODY_PROGRESS_PHOTO_SIGNATURE_MISMATCH',
  'BODY_PROGRESS_PHOTO_DECODER_REJECTED',
  'BODY_PROGRESS_PHOTO_PIXEL_LIMIT',
  'BODY_PROGRESS_PHOTO_UNSUPPORTED_FORMAT',
  'BODY_PROGRESS_PHOTO_HEIC_CLIENT_CONVERSION_REQUIRED',
  'BODY_PROGRESS_PHOTO_DUPLICATE_VIEW',
  'BODY_PROGRESS_PHOTO_PROCESSING_FAILED',
  'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE',
  'BODY_PROGRESS_PHOTO_KEY_UNAVAILABLE',
  'BODY_PROGRESS_PHOTO_INTEGRITY_FAILURE',
  'BODY_PROGRESS_PHOTO_EXPORT_REAUTH_REQUIRED',
  'BODY_PROGRESS_PHOTO_NOT_FOUND',
]);

const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);
const contextSchema = z
  .object({
    meal: z.enum(['unspecified', 'pre_meal', 'post_meal']).default('unspecified'),
    workout: z.enum(['unspecified', 'pre_workout', 'post_workout']).default('unspecified'),
    pumpPresent: z.boolean().nullable().default(null),
    unusualBloating: z.boolean().nullable().default(null),
    clothingNotes: z.string().trim().max(500).nullable().default(null),
    lightingNotes: z.string().trim().max(500).nullable().default(null),
  })
  .strict();

export const bodyProgressPhotoConsentSchema = z
  .object({
    state: bodyProgressPhotoConsentStateSchema,
    contractVersion: z.literal(BODY_PROGRESS_PHOTO_CONSENT_VERSION),
    acceptedVersion: z.string().nullable(),
    consentedAt: z.number().int().nullable(),
    declinedAt: z.number().int().nullable(),
    revokedAt: z.number().int().nullable(),
    facts: z
      .object({
        encryptedLiveStorage: z.literal(true),
        jwtOnlyRawAccess: z.literal(true),
        retainedUntilExplicitDeletion: z.literal(true),
        encryptedBackupsRetainNewestArchives: z.literal(30),
        backupKeyStoredSeparately: z.literal(true),
        noAiAnalysis: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const bodyProgressPhotoDueStateSchema = z
  .object({
    localDate: dateSchema.nullable(),
    dueDate: dateSchema,
    nextDueDate: dateSchema,
    state: z.enum(['upcoming', 'due', 'overdue', 'snoozed', 'skipped']),
    snoozedUntil: dateSchema.nullable(),
    lastDismissedDueDate: dateSchema.nullable(),
  })
  .strict();

export const bodyProgressPhotoCapabilitiesSchema = z
  .object({
    contractVersion: z.literal(BODY_PROGRESS_PHOTO_CONTRACT_VERSION),
    consentVersion: z.literal(BODY_PROGRESS_PHOTO_CONSENT_VERSION),
    guideVersion: z.literal(BODY_PROGRESS_PHOTO_GUIDE_VERSION),
    processingVersion: z.literal(BODY_PROGRESS_PHOTO_PROCESSING_VERSION),
    formats: z.tuple([z.literal('image/jpeg'), z.literal('image/png'), z.literal('image/webp')]),
    heic: z
      .object({
        behavior: z.literal('reject_client_conversion_required'),
        errorCode: z.literal('BODY_PROGRESS_PHOTO_HEIC_CLIENT_CONVERSION_REQUIRED'),
      })
      .strict(),
    maxInputBytes: z.literal(BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES),
    maxFilesPerRequest: z.literal(BODY_PROGRESS_PHOTO_MAX_FILES),
    maxRequestBytes: z.literal(BODY_PROGRESS_PHOTO_MAX_REQUEST_BYTES),
    maxPixels: z.literal(BODY_PROGRESS_PHOTO_MAX_PIXELS),
    variants: z.tuple([z.literal('thumbnail'), z.literal('comparison'), z.literal('full')]),
    uploadAuth: z.literal('jwt_only'),
    contentAuth: z.literal('jwt_only'),
    metadataAuth: z.literal('jwt_or_agent_token'),
    export: z
      .object({ format: z.literal('zip'), reauthentication: z.literal('current_password') })
      .strict(),
    deletion: z
      .object({ liveStorage: z.literal('immediate'), backupAging: z.literal('newest_30_archives') })
      .strict(),
    errorCodes: z.array(bodyProgressPhotoErrorCodeSchema),
  })
  .strict();

export const bodyProgressPhotoPreferenceSchema = z
  .object({
    contractVersion: z.literal(BODY_PROGRESS_PHOTO_CONTRACT_VERSION),
    consent: bodyProgressPhotoConsentSchema,
    cadenceDays: z.number().int().min(14).max(180),
    anchorDate: dateSchema,
    sideView: z.enum(['side_left', 'side_right']),
    reminderLocalTime: localTimeSchema.nullable(),
    snoozedUntil: dateSchema.nullable(),
    lastDismissedDueDate: dateSchema.nullable(),
    lastScheduledOccurrenceDate: dateSchema.nullable(),
    due: bodyProgressPhotoDueStateSchema,
    capabilities: bodyProgressPhotoCapabilitiesSchema,
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict();

export const patchBodyProgressPhotoPreferenceSchema = z
  .object({
    consentDecision: z.enum(['grant', 'decline', 'revoke']).optional(),
    consentVersion: z.literal(BODY_PROGRESS_PHOTO_CONSENT_VERSION).optional(),
    cadenceDays: z.number().int().min(14).max(180).optional(),
    cadenceChange: z.enum(['preserve_anchor', 'restart']).optional(),
    restartAnchorDate: dateSchema.optional(),
    sideView: z.enum(['side_left', 'side_right']).optional(),
    reminderLocalTime: localTimeSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one preference field is required',
      });
    }
    if (value.consentDecision && !value.consentVersion) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['consentVersion'],
        message: 'Consent decision requires the current consent version',
      });
    }
    if (value.cadenceDays !== undefined && value.cadenceChange === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cadenceChange'],
        message: 'Cadence changes must explicitly preserve or restart the anchor',
      });
    }
    if (value.cadenceChange === 'restart' && !value.restartAnchorDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['restartAnchorDate'],
        message: 'Restarting cadence requires restartAnchorDate',
      });
    }
    if (value.cadenceChange !== 'restart' && value.restartAnchorDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['restartAnchorDate'],
        message: 'restartAnchorDate is only valid for restart',
      });
    }
  });

export const bodyProgressPhotoSetSchema = z
  .object({
    id: z.string().uuid(),
    bodyCheckInId: z.string().uuid().nullable(),
    date: dateSchema,
    localTime: localTimeSchema.nullable(),
    guideVersion: z.literal(BODY_PROGRESS_PHOTO_GUIDE_VERSION),
    context: contextSchema,
    notes: z.string().nullable(),
    status: bodyProgressPhotoSetStatusSchema,
    countAsScheduledOccurrence: z.boolean(),
    photos: z.array(z.lazy(() => bodyProgressPhotoSchema)),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict();

export const bodyProgressPhotoSchema: z.ZodType<{
  id: string;
  setId: string;
  view: z.infer<typeof bodyProgressPhotoViewSchema>;
  mediaType: 'image/jpeg';
  byteSize: number;
  width: number;
  height: number;
  checksum: string;
  processingVersion: typeof BODY_PROGRESS_PHOTO_PROCESSING_VERSION;
  processingState: 'ready';
  deletionStatus: 'live';
  encryptionVersion: typeof BODY_PROGRESS_PHOTO_ENCRYPTION_VERSION;
  variants: {
    variant: 'thumbnail' | 'comparison' | 'full';
    width: number;
    height: number;
    byteSize: number;
    contentPath: string;
  }[];
  createdAt: number;
  updatedAt: number;
}> = z
  .object({
    id: z.string().uuid(),
    setId: z.string().uuid(),
    view: bodyProgressPhotoViewSchema,
    mediaType: z.literal('image/jpeg'),
    byteSize: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/u),
    processingVersion: z.literal(BODY_PROGRESS_PHOTO_PROCESSING_VERSION),
    processingState: z.literal('ready'),
    deletionStatus: z.literal('live'),
    encryptionVersion: z.literal(BODY_PROGRESS_PHOTO_ENCRYPTION_VERSION),
    variants: z.array(
      z
        .object({
          variant: bodyProgressPhotoContentVariantSchema,
          width: z.number().int().positive(),
          height: z.number().int().positive(),
          byteSize: z.number().int().positive(),
          contentPath: z
            .string()
            .regex(
              /^\/api\/v1\/body-progress\/photos\/[0-9a-f-]+\/content\?variant=(thumbnail|comparison|full)$/u,
            ),
        })
        .strict(),
    ),
    createdAt: z.number().int(),
    updatedAt: z.number().int(),
  })
  .strict();

export const createBodyProgressPhotoSetSchema = z
  .object({
    bodyCheckInId: z.string().uuid().nullable().optional(),
    date: dateSchema,
    localTime: localTimeSchema.nullable().optional(),
    guideVersion: z.literal(BODY_PROGRESS_PHOTO_GUIDE_VERSION),
    context: contextSchema.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    countAsScheduledOccurrence: z.boolean().default(false),
  })
  .strict();

export const patchBodyProgressPhotoSetSchema = createBodyProgressPhotoSetSchema
  .partial()
  .omit({ guideVersion: true, countAsScheduledOccurrence: true })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one set field is required');
export const bodyProgressPhotoSetListQuerySchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const bodyProgressPhotoContentQuerySchema = z
  .object({ variant: bodyProgressPhotoContentVariantSchema })
  .strict();
export const bodyProgressPhotoSkipSchema = z.object({ occurrenceDate: dateSchema }).strict();
export const bodyProgressPhotoSnoozeSchema = z.object({ until: dateSchema }).strict();
export const bodyProgressPhotoExportInputSchema = z
  .object({ password: z.string().min(8).max(72) })
  .strict();
export const bodyProgressPhotoDeleteAllInputSchema = z
  .object({ confirm: z.literal('delete_all_live_progress_photos') })
  .strict();

export type BodyProgressPhotoPreference = z.infer<typeof bodyProgressPhotoPreferenceSchema>;
export type PatchBodyProgressPhotoPreference = z.infer<
  typeof patchBodyProgressPhotoPreferenceSchema
>;
export type BodyProgressPhotoSet = z.infer<typeof bodyProgressPhotoSetSchema>;
export type BodyProgressPhoto = z.infer<typeof bodyProgressPhotoSchema>;
export type CreateBodyProgressPhotoSet = z.infer<typeof createBodyProgressPhotoSetSchema>;
export type PatchBodyProgressPhotoSet = z.infer<typeof patchBodyProgressPhotoSetSchema>;
export type BodyProgressPhotoView = z.infer<typeof bodyProgressPhotoViewSchema>;
export type BodyProgressPhotoVariant = z.infer<typeof bodyProgressPhotoVariantSchema>;
