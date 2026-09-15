import {
  BODY_PROGRESS_PHOTO_CONSENT_VERSION,
  BODY_PROGRESS_PHOTO_CONTRACT_VERSION,
  BODY_PROGRESS_PHOTO_ENCRYPTION_VERSION,
  BODY_PROGRESS_PHOTO_GUIDE_VERSION,
  BODY_PROGRESS_PHOTO_MAX_FILES,
  BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES,
  BODY_PROGRESS_PHOTO_MAX_PIXELS,
  BODY_PROGRESS_PHOTO_MAX_REQUEST_BYTES,
  BODY_PROGRESS_PHOTO_PROCESSING_VERSION,
  bodyProgressPhotoPreferenceSchema,
  bodyProgressPhotoSetSchema,
  type BodyProgressPhotoSet,
  type BodyProgressPhotoView,
} from '@pulse/shared';

const photo = (id: string, setId: string, view: BodyProgressPhotoView) => ({
  id,
  setId,
  view,
  mediaType: 'image/jpeg' as const,
  byteSize: 18_240,
  width: 720,
  height: 960,
  checksum: 'a'.repeat(64),
  processingVersion: BODY_PROGRESS_PHOTO_PROCESSING_VERSION,
  processingState: 'ready' as const,
  deletionStatus: 'live' as const,
  encryptionVersion: BODY_PROGRESS_PHOTO_ENCRYPTION_VERSION,
  variants: (['thumbnail', 'comparison', 'full'] as const).map((variant) => ({
    variant,
    width: variant === 'thumbnail' ? 240 : variant === 'comparison' ? 720 : 1440,
    height: variant === 'thumbnail' ? 320 : variant === 'comparison' ? 960 : 1920,
    byteSize: 8_192,
    contentPath: `/api/v1/body-progress/photos/${id}/content?variant=${variant}`,
  })),
  createdAt: 1_789_400_000_000,
  updatedAt: 1_789_400_000_000,
});

const makeSet = (id: string, date: string, photoId: string): BodyProgressPhotoSet =>
  bodyProgressPhotoSetSchema.parse({
    id,
    bodyCheckInId: null,
    date,
    localTime: '08:15',
    guideVersion: BODY_PROGRESS_PHOTO_GUIDE_VERSION,
    context: {
      meal: 'pre_meal',
      workout: 'pre_workout',
      pumpPresent: false,
      unusualBloating: false,
      clothingNotes: 'Synthetic fixture clothing context.',
      lightingNotes: 'Synthetic fixture lighting context.',
    },
    notes: 'Synthetic fixture set; contains generated color blocks only.',
    status: 'partial',
    countAsScheduledOccurrence: true,
    photos: [photo(photoId, id, 'front')],
    createdAt: 1_789_400_000_000,
    updatedAt: 1_789_400_000_000,
  });

export const photoSetFixtureA = makeSet(
  '11111111-1111-4111-8111-111111111111',
  '2026-08-15',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
);
export const photoSetFixtureB = makeSet(
  '22222222-2222-4222-8222-222222222222',
  '2026-09-15',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
);

export const grantedPhotoPreferenceFixture = bodyProgressPhotoPreferenceSchema.parse({
  contractVersion: BODY_PROGRESS_PHOTO_CONTRACT_VERSION,
  consent: {
    state: 'granted',
    contractVersion: BODY_PROGRESS_PHOTO_CONSENT_VERSION,
    acceptedVersion: BODY_PROGRESS_PHOTO_CONSENT_VERSION,
    consentedAt: 1_789_400_000_000,
    declinedAt: null,
    revokedAt: null,
    facts: {
      encryptedLiveStorage: true,
      jwtOnlyRawAccess: true,
      retainedUntilExplicitDeletion: true,
      encryptedBackupsRetainNewestArchives: 30,
      backupKeyStoredSeparately: true,
      noAiAnalysis: true,
    },
  },
  cadenceDays: 30,
  anchorDate: '2026-08-15',
  sideView: 'side_right',
  reminderLocalTime: '08:30',
  snoozedUntil: null,
  lastDismissedDueDate: null,
  lastScheduledOccurrenceDate: '2026-08-15',
  due: {
    localDate: '2026-09-15',
    dueDate: '2026-09-14',
    nextDueDate: '2026-10-14',
    state: 'overdue',
    snoozedUntil: null,
    lastDismissedDueDate: null,
  },
  capabilities: {
    contractVersion: BODY_PROGRESS_PHOTO_CONTRACT_VERSION,
    consentVersion: BODY_PROGRESS_PHOTO_CONSENT_VERSION,
    guideVersion: BODY_PROGRESS_PHOTO_GUIDE_VERSION,
    processingVersion: BODY_PROGRESS_PHOTO_PROCESSING_VERSION,
    formats: ['image/jpeg', 'image/png', 'image/webp'],
    heic: {
      behavior: 'reject_client_conversion_required',
      errorCode: 'BODY_PROGRESS_PHOTO_HEIC_CLIENT_CONVERSION_REQUIRED',
    },
    maxInputBytes: BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES,
    maxFilesPerRequest: BODY_PROGRESS_PHOTO_MAX_FILES,
    maxRequestBytes: BODY_PROGRESS_PHOTO_MAX_REQUEST_BYTES,
    maxPixels: BODY_PROGRESS_PHOTO_MAX_PIXELS,
    variants: ['thumbnail', 'comparison', 'full'],
    uploadAuth: 'jwt_only',
    contentAuth: 'jwt_only',
    metadataAuth: 'jwt_or_agent_token',
    export: { format: 'zip', reauthentication: 'current_password' },
    deletion: { liveStorage: 'immediate', backupAging: 'newest_30_archives' },
    errorCodes: ['BODY_PROGRESS_PHOTO_NOT_FOUND'],
  },
  createdAt: 1_789_400_000_000,
  updatedAt: 1_789_400_000_000,
});

export const undecidedPhotoPreferenceFixture = bodyProgressPhotoPreferenceSchema.parse({
  ...grantedPhotoPreferenceFixture,
  consent: {
    ...grantedPhotoPreferenceFixture.consent,
    state: 'not_decided',
    acceptedVersion: null,
    consentedAt: null,
  },
});
