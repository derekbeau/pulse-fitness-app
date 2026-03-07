import { z } from 'zod';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const journalEntryTypeSchema = z.enum([
  'post-workout',
  'milestone',
  'observation',
  'weekly-summary',
  'injury-update',
]);
export const journalEntryCreatedBySchema = z.enum(['agent', 'user']);

export const journalEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  date: dateSchema,
  title: z.string().trim().min(1),
  type: journalEntryTypeSchema,
  content: z.string().min(1),
  createdBy: journalEntryCreatedBySchema,
  createdAt: z.number().int(),
});

export type JournalEntryType = z.infer<typeof journalEntryTypeSchema>;
export type JournalEntryCreatedBy = z.infer<typeof journalEntryCreatedBySchema>;
export type JournalEntry = z.infer<typeof journalEntrySchema>;
