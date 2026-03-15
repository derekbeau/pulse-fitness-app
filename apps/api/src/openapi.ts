import { dateSchema } from '@pulse/shared';
import { z } from 'zod';

export const opaqueIdParamSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Invalid id');

export const authSecurity = [{ bearerAuth: [] }, { agentToken: [] }] as const;
export const jwtSecurity = [{ bearerAuth: [] }] as const;
export const agentTokenSecurity = [{ agentToken: [] }] as const;

export const idParamsSchema = z.object({
  id: opaqueIdParamSchema,
});

export const dateParamsSchema = z.object({
  date: dateSchema,
});

export const mealParamsSchema = dateParamsSchema.extend({
  mealId: opaqueIdParamSchema,
});

export const mealItemParamsSchema = mealParamsSchema.extend({
  itemId: opaqueIdParamSchema,
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

const zodIssueSchema = z
  .object({
    code: z.string(),
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  })
  .catchall(z.unknown());

export const zodValidationIssueSchema = z.object({
  keyword: z.string(),
  instancePath: z.string(),
  schemaPath: z.string(),
  message: z.string(),
  params: z
    .object({
      issue: zodIssueSchema,
    })
    .catchall(z.unknown()),
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
