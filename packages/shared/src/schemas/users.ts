import { z } from 'zod';

export const weightUnitSchema = z.enum(['lbs', 'kg']);
export type WeightUnit = z.infer<typeof weightUnitSchema>;

export const userProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  weightUnit: weightUnitSchema.default('lbs'),
  createdAt: z.number(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const updateUserInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    weightUnit: weightUnitSchema.optional(),
  })
  .refine((data) => data.name !== undefined || data.weightUnit !== undefined, {
    message: 'At least one field must be provided',
  });

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
