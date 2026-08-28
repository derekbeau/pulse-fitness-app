import { z } from 'zod';

const nonnegativeGramsSchema = z.number().nonnegative().finite();

export const proteinFloorStateSchema = z.enum(['below_floor', 'floor_met', 'unavailable']);

export const proteinFloorProgressSchema = z
  .object({
    actualProteinGrams: nonnegativeGramsSchema.nullable(),
    proteinFloorGrams: nonnegativeGramsSchema.nullable(),
    remainingToFloorGrams: nonnegativeGramsSchema.nullable(),
    amountAboveFloorGrams: nonnegativeGramsSchema.nullable(),
    state: proteinFloorStateSchema,
    isFinal: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    const factsAvailable =
      value.actualProteinGrams !== null &&
      value.proteinFloorGrams !== null &&
      value.proteinFloorGrams > 0;

    if (value.state === 'unavailable') {
      if (value.remainingToFloorGrams !== null || value.amountAboveFloorGrams !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Unavailable protein progress requires null distances',
          path: ['state'],
        });
      }
      return;
    }

    if (!factsAvailable) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Available protein progress requires actual intake and a positive floor',
        path: ['state'],
      });
      return;
    }

    const actual = value.actualProteinGrams as number;
    const floor = value.proteinFloorGrams as number;
    const expectedRemaining = Math.max(floor - actual, 0);
    const expectedAbove = Math.max(actual - floor, 0);
    const expectedState = actual < floor ? 'below_floor' : 'floor_met';

    if (value.remainingToFloorGrams !== expectedRemaining) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Remaining protein must equal the nonnegative distance to the floor',
        path: ['remainingToFloorGrams'],
      });
    }
    if (value.amountAboveFloorGrams !== expectedAbove) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Protein above the floor must equal the nonnegative excess',
        path: ['amountAboveFloorGrams'],
      });
    }
    if (value.state !== expectedState) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Protein floor state must match actual intake and the accepted floor',
        path: ['state'],
      });
    }
  });

export type ProteinFloorProgress = z.infer<typeof proteinFloorProgressSchema>;
export type ProteinFloorState = z.infer<typeof proteinFloorStateSchema>;
