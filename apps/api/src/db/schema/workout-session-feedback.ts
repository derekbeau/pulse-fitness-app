import {
  classifyNativeFeedback,
  provenanceSafeFeedbackSchema,
  legacyWorkoutSessionFeedbackSchema,
  actionableFeedbackRating,
  type WorkoutSessionFeedback,
  type WorkoutSessionFeedbackInput,
} from '@pulse/shared';

export function serializeWorkoutSessionFeedback(
  value: WorkoutSessionFeedbackInput | null | undefined,
): string | null {
  return value == null ? null : JSON.stringify(value);
}

export function parseWorkoutSessionFeedback(
  value: string | null | undefined,
): WorkoutSessionFeedback | null {
  if (value == null) return null;
  try {
    const raw: unknown = JSON.parse(value);
    const canonical = provenanceSafeFeedbackSchema.safeParse(raw);
    if (canonical.success) {
      for (const construct of ['energy', 'recovery', 'technique'] as const) {
        if (
          canonical.data[construct] !== null &&
          actionableFeedbackRating(canonical.data, construct) === null
        ) {
          return classifyNativeFeedback(canonical.data, {
            legacy: true,
            classifiedAt: new Date().toISOString(),
          });
        }
      }
      return canonical.data;
    }
    const legacy = legacyWorkoutSessionFeedbackSchema.partial().strict().parse(raw);
    return classifyNativeFeedback(legacy, { legacy: true, classifiedAt: new Date().toISOString() });
  } catch {
    throw new TypeError('Expected valid source-linked or quarantined legacy workout feedback.');
  }
}
