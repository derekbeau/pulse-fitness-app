import {
  BODY_CHECK_IN_CONTRACT_VERSION,
  BODY_PROTOCOL_VERSION,
  bodyCheckInPreferenceSchema,
  bodyCheckInSchema,
  bodyDueStateSchema,
  bodyMeasurementProtocols,
  defaultBodyEnabledSites,
  type BodyDueState,
} from '@pulse/shared';

const now = Date.parse('2026-09-15T12:00:00Z');
const waistProtocol = bodyMeasurementProtocols.waist_iliac_crest_nhanes;
const chestProtocol = bodyMeasurementProtocols.chest_nipple_line_relaxed;

export const populatedBodyPreferenceFixture = bodyCheckInPreferenceSchema.parse({
  contractVersion: BODY_CHECK_IN_CONTRACT_VERSION,
  measurementCadenceDays: 14,
  lengthUnit: 'cm',
  enabledSites: defaultBodyEnabledSites,
  anchorDate: '2026-09-01',
  reminderLocalTime: '08:30',
  protocolVersion: BODY_PROTOCOL_VERSION,
  snoozedUntil: null,
  lastDismissedDueDate: null,
  createdAt: now - 1_000,
  updatedAt: now,
});

export const bodyDueFixture = (state: BodyDueState['state']) =>
  bodyDueStateSchema.parse({
    contractVersion: BODY_CHECK_IN_CONTRACT_VERSION,
    state,
    localDate: '2026-09-15',
    timeZone: 'America/Detroit',
    timeZoneSource: 'user_profile',
    occurrenceDueDate: state === 'not_configured' || state === 'upcoming' ? null : '2026-09-15',
    nextDueDate:
      state === 'satisfied' || state === 'skipped_current_occurrence'
        ? '2026-09-29'
        : state === 'snoozed'
          ? '2026-09-18'
          : '2026-09-15',
    snoozedUntil: state === 'snoozed' ? '2026-09-18' : null,
    satisfiedByCheckInId: state === 'satisfied' ? 'check-in-complete' : null,
  });

export const populatedBodyCheckInFixture = bodyCheckInSchema.parse({
  contractVersion: BODY_CHECK_IN_CONTRACT_VERSION,
  id: 'check-in-complete',
  version: 2,
  date: '2026-09-15',
  localTime: '07:42',
  status: 'completed',
  mealContext: 'pre_meal',
  workoutContext: 'pre_workout',
  pumpPresent: false,
  unusualBloating: false,
  notes: 'Same tape, before breakfast.',
  protocolVersion: BODY_PROTOCOL_VERSION,
  source: 'agent_token',
  sourceId: 'agent-fixture',
  countAsScheduledOccurrence: true,
  measurements: [
    {
      id: 'measurement-waist',
      site: 'waist_iliac_crest_nhanes',
      laterality: 'none',
      unitAtEntry: 'cm',
      reading1Mm: 842,
      reading2Mm: 848,
      reading3Mm: null,
      canonicalMm: 845,
      quality: 'replicated',
      selectedReadingPair: [1, 2],
      protocolId: 'waist_iliac_crest_nhanes',
      protocolVersion: BODY_PROTOCOL_VERSION,
      protocolName: waistProtocol.name,
      protocolInstructions: waistProtocol.instructions,
      protocolSourceUrls: [...waistProtocol.sourceUrls],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'measurement-chest',
      site: 'chest_nipple_line_relaxed',
      laterality: 'none',
      unitAtEntry: 'cm',
      reading1Mm: 1010,
      reading2Mm: 1040,
      reading3Mm: 1015,
      canonicalMm: 1013,
      quality: 'high_variance',
      selectedReadingPair: [1, 3],
      protocolId: 'chest_nipple_line_relaxed',
      protocolVersion: BODY_PROTOCOL_VERSION,
      protocolName: chestProtocol.name,
      protocolInstructions: chestProtocol.instructions,
      protocolSourceUrls: [...chestProtocol.sourceUrls],
      createdAt: now + 1,
      updatedAt: now + 1,
    },
  ],
  completedAt: now - 500,
  correctedAt: now,
  correctedBySource: 'user',
  correctedBySourceId: null,
  correctionReason: 'Corrected chest transcription.',
  createdAt: now - 500,
  updatedAt: now,
});
