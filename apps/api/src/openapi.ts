import { dateSchema } from '@pulse/shared';
import { z } from 'zod';

const nonEmptyParamSchema = z.string().trim().min(1);

export const authSecurity = [{ bearerAuth: [] }, { agentToken: [] }] as const;
export const jwtSecurity = [{ bearerAuth: [] }] as const;

export const idParamsSchema = z.object({
  id: nonEmptyParamSchema,
});

export const dateParamsSchema = z.object({
  date: dateSchema,
});

export const mealParamsSchema = dateParamsSchema.extend({
  mealId: nonEmptyParamSchema,
});

export const mealItemParamsSchema = mealParamsSchema.extend({
  itemId: nonEmptyParamSchema,
});

export const successFlagSchema = z.object({
  success: z.literal(true),
});

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const apiErrorResponseSchema = z.object({
  error: apiErrorSchema,
});

export const zodValidationIssueSchema = z.object({
  keyword: z.string(),
  instancePath: z.string(),
  schemaPath: z.string(),
  message: z.string(),
  params: z.record(z.unknown()),
});

export const validationErrorResponseSchema = z.object({
  error: apiErrorSchema.extend({
    code: z.literal('VALIDATION_ERROR'),
    details: z.object({
      issues: z.array(zodValidationIssueSchema),
      method: z.string(),
      url: z.string(),
    }),
  }),
});

export const badRequestResponseSchema = z.union([
  validationErrorResponseSchema,
  apiErrorResponseSchema,
]);

export const isoDateTimeQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Invalid datetime')
    .transform((value) => new Date(value)),
});
