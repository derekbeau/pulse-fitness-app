import { z } from 'zod';

export const userTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
      return true;
    } catch {
      return false;
    }
  }, 'Must be a valid IANA time zone');
export type UserTimeZone = z.infer<typeof userTimeZoneSchema>;

export const weightUnitSchema = z.enum(['lbs', 'kg']);
export type WeightUnit = z.infer<typeof weightUnitSchema>;

export const userProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  weightUnit: weightUnitSchema.default('lbs'),
  timeZone: userTimeZoneSchema.nullable(),
  createdAt: z.number(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const updateUserInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    weightUnit: weightUnitSchema.optional(),
    timeZone: userTimeZoneSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.weightUnit !== undefined || value.timeZone !== undefined,
    {
      message: 'At least one field must be provided',
    },
  );

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
