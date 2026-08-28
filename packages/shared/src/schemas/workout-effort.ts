import { z } from 'zod';

export const nullableRpeSchema = z.number().int().min(1).max(10).nullable();
export const nullableRirSchema = z.number().int().min(0).max(5).nullable();

export const workoutEffortSourceSchema = z.enum(['native_rir', 'native_rpe', 'none']);

export const RIR_SUPPORTED_TRACKING_TYPES = [
  'weight_reps',
  'bodyweight_reps',
  'reps_only',
] as const;

export function supportsRirTrackingType(trackingType: string | null | undefined) {
  return RIR_SUPPORTED_TRACKING_TYPES.some((supportedType) => supportedType === trackingType);
}

export function validateMutuallyExclusiveWorkoutEffort(
  value: { rir?: number | null; rpe?: number | null },
  context: z.RefinementCtx,
) {
  if (
    value.rir !== null &&
    value.rir !== undefined &&
    value.rpe !== null &&
    value.rpe !== undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'RPE and RIR cannot both be logged for the same set',
      path: ['rir'],
    });
  }
}

export type WorkoutEffortSource = z.infer<typeof workoutEffortSourceSchema>;
