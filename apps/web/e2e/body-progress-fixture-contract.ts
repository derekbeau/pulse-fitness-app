import {
  createBodyCheckInInputSchema,
  patchBodyCheckInPreferenceSchema,
} from '../../../packages/shared/src/index';

export const bodyProgressFixtureContract = {
  fixtureVersion: 'body-progress-ui-v1',
  serverTimeZone: 'America/Detroit',
  preference: patchBodyCheckInPreferenceSchema.parse({
    measurementCadenceDays: 14,
    lengthUnit: 'cm',
    enabledSites: [
      { site: 'waist_iliac_crest_nhanes', laterality: 'none' },
      { site: 'chest_nipple_line_relaxed', laterality: 'none' },
      { site: 'hips_maximum', laterality: 'none' },
      { site: 'upper_arm_midpoint_flexed', laterality: 'right' },
      { site: 'thigh_midpoint', laterality: 'right' },
    ],
    reminderLocalTime: '08:30',
    cadenceChange: 'restart',
    restartAnchorDate: '2026-09-01',
  }),
  completed: createBodyCheckInInputSchema.parse({
    date: '2026-09-14',
    localTime: '07:42',
    status: 'completed',
    measurements: [
      {
        site: 'waist_iliac_crest_nhanes',
        laterality: 'none',
        unit: 'cm',
        readings: [84.2, 84.8],
      },
      {
        site: 'chest_nipple_line_relaxed',
        laterality: 'none',
        unit: 'cm',
        readings: [101, 104, 101.5],
      },
      {
        site: 'hips_maximum',
        laterality: 'none',
        unit: 'cm',
        readings: [99.2],
      },
    ],
    mealContext: 'pre_meal',
    workoutContext: 'pre_workout',
    pumpPresent: false,
    unusualBloating: false,
    notes: 'Source-bound browser fixture: same tape before breakfast.',
    countAsScheduledOccurrence: false,
    idempotencyKey: 'body-progress-e2e-complete-v1',
  }),
  draft: createBodyCheckInInputSchema.parse({
    date: '2026-09-15',
    localTime: '07:45',
    status: 'draft',
    measurements: [
      {
        site: 'waist_iliac_crest_nhanes',
        laterality: 'none',
        unit: 'cm',
        readings: [84.1, 85.3],
      },
    ],
    mealContext: 'pre_meal',
    workoutContext: 'pre_workout',
    pumpPresent: false,
    unusualBloating: false,
    notes: 'Paused for a third waist reading.',
    countAsScheduledOccurrence: true,
    idempotencyKey: 'body-progress-e2e-draft-v1',
  }),
} as const;
