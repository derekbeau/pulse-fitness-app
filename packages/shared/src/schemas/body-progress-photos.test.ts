import { describe, expect, it } from 'vitest';

import {
  BODY_PROGRESS_PHOTO_CONSENT_VERSION,
  BODY_PROGRESS_PHOTO_MAX_FILES,
  BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES,
  bodyProgressPhotoCapabilitiesSchema,
  bodyProgressPhotoErrorCodeSchema,
  createBodyProgressPhotoSetSchema,
  patchBodyProgressPhotoPreferenceSchema,
} from './body-progress-photos.js';

describe('progress photo shared contracts', () => {
  it('publishes stable limits, HEIC rejection, auth, deletion, export, and errors', () => {
    const parsed = bodyProgressPhotoCapabilitiesSchema.parse({
      contractVersion: 'body-progress-photos-v1',
      consentVersion: BODY_PROGRESS_PHOTO_CONSENT_VERSION,
      guideVersion: 'body-progress-photo-guide-v1',
      processingVersion: 'sharp-jpeg-v1',
      formats: ['image/jpeg', 'image/png', 'image/webp'],
      heic: {
        behavior: 'reject_client_conversion_required',
        errorCode: 'BODY_PROGRESS_PHOTO_HEIC_CLIENT_CONVERSION_REQUIRED',
      },
      maxInputBytes: BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES,
      maxFilesPerRequest: BODY_PROGRESS_PHOTO_MAX_FILES,
      maxRequestBytes: BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES * 3 + 64 * 1024,
      maxPixels: 40_000_000,
      variants: ['thumbnail', 'comparison', 'full'],
      uploadAuth: 'jwt_only',
      contentAuth: 'jwt_only',
      metadataAuth: 'jwt_or_agent_token',
      export: { format: 'zip', reauthentication: 'current_password' },
      deletion: { liveStorage: 'immediate', backupAging: 'newest_30_archives' },
      errorCodes: bodyProgressPhotoErrorCodeSchema.options,
    });
    expect(parsed.heic.behavior).toBe('reject_client_conversion_required');
    expect(parsed.errorCodes).toContain('BODY_PROGRESS_PHOTO_INTEGRITY_FAILURE');
  });

  it('requires explicit versioned consent and explicit cadence restart semantics', () => {
    expect(
      patchBodyProgressPhotoPreferenceSchema.safeParse({ consentDecision: 'grant' }).success,
    ).toBe(false);
    expect(
      patchBodyProgressPhotoPreferenceSchema.safeParse({
        consentDecision: 'grant',
        consentVersion: BODY_PROGRESS_PHOTO_CONSENT_VERSION,
      }).success,
    ).toBe(true);
    expect(patchBodyProgressPhotoPreferenceSchema.safeParse({ cadenceDays: 56 }).success).toBe(
      false,
    );
    expect(
      patchBodyProgressPhotoPreferenceSchema.safeParse({
        cadenceDays: 56,
        cadenceChange: 'preserve_anchor',
      }).success,
    ).toBe(true);
    expect(
      patchBodyProgressPhotoPreferenceSchema.safeParse({
        cadenceDays: 21,
        cadenceChange: 'restart',
        restartAnchorDate: '2026-09-15',
      }).success,
    ).toBe(true);
  });

  it('keeps sets partial-capable and rejects untyped context or future UI fields', () => {
    expect(
      createBodyProgressPhotoSetSchema.safeParse({
        date: '2026-09-15',
        guideVersion: 'body-progress-photo-guide-v1',
        countAsScheduledOccurrence: false,
      }).success,
    ).toBe(true);
    expect(
      createBodyProgressPhotoSetSchema.safeParse({
        date: '2026-09-15',
        guideVersion: 'body-progress-photo-guide-v1',
        aiAnalysis: true,
      }).success,
    ).toBe(false);
    expect(
      createBodyProgressPhotoSetSchema.safeParse({
        date: '2026-09-15',
        guideVersion: 'body-progress-photo-guide-v1',
        context: { gps: 'hidden' },
      }).success,
    ).toBe(false);
  });
});
