import { z } from 'zod';

import {
  activityJournalActorSchema,
  journalObservationSchema,
  provenanceSchema,
} from './activity-journal-contracts.js';
import { dailyCheckInSourceKindSchema } from './daily-check-in-runtime.js';
import { dateSchema } from './common.js';

const id = z.string().trim().min(1).max(255);
const text = z.string().trim().min(1).max(10_000);
const shortText = z.string().trim().min(1).max(255);
const key = z.string().trim().min(8).max(255);
const sourceReference = z
  .object({
    kind: dailyCheckInSourceKindSchema.exclude(['activity_recurrence_revision']),
    id,
    revisionId: id,
    subjectUserId: id.optional(),
  })
  .strict();
const category = z.enum(['health', 'nutrition', 'movement', 'injury']);

export const createJournalObservationApiInputSchema = z
  .object({
    localDate: dateSchema,
    title: shortText,
    content: text,
    category,
    sourceReferences: z.array(sourceReference).min(1).max(100),
    source: provenanceSchema.omit({ capturedAt: true, capturedBy: true }),
    idempotencyKey: key,
  })
  .strict();

export const correctJournalObservationApiInputSchema = z
  .object({
    expectedRevisionId: id,
    correctedFields: z
      .object({
        localDate: dateSchema.optional(),
        title: shortText.optional(),
        content: text.optional(),
        category: category.optional(),
        sourceReferences: z.array(sourceReference).min(1).max(100).optional(),
        source: provenanceSchema.omit({ capturedAt: true, capturedBy: true }).optional(),
      })
      .strict()
      .refine(
        (fields) => Object.keys(fields).length > 0,
        'A correction must change at least one field.',
      ),
    reason: text,
    idempotencyKey: key,
  })
  .strict();

export const journalListQuerySchema = z
  .object({ from: dateSchema.optional(), to: dateSchema.optional() })
  .strict();
export const journalWeeklyQuerySchema = z.object({ start: dateSchema, end: dateSchema }).strict();
export const journalLegacyEntrySchema = z
  .object({
    kind: z.literal('legacy_date_only'),
    id,
    localDate: dateSchema,
    title: z.string(),
    type: z.string(),
    content: z.string(),
    limitation: z.literal('Source links, timezone, actor, and revisions were never recorded.'),
  })
  .strict();
export const journalListItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('canonical'), observation: journalObservationSchema }).strict(),
  journalLegacyEntrySchema,
]);
export const journalListSchema = z
  .object({ items: z.array(journalListItemSchema).max(1000) })
  .strict();
export const journalRevisionSchema = z
  .object({
    id,
    revision: z.number().int().positive(),
    priorRevisionId: id.nullable(),
    recordedAt: z.string().datetime({ offset: true }),
    recordedBy: activityJournalActorSchema,
    reason: text.nullable(),
    observation: journalObservationSchema,
  })
  .strict();
export const journalDetailSchema = z
  .object({
    observation: journalObservationSchema,
    history: z.array(journalRevisionSchema).min(1),
  })
  .strict();

export type CreateJournalObservationApiInput = z.infer<
  typeof createJournalObservationApiInputSchema
>;
export type CorrectJournalObservationApiInput = z.infer<
  typeof correctJournalObservationApiInputSchema
>;
export type JournalDetail = z.infer<typeof journalDetailSchema>;
