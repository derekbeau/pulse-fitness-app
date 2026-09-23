import { z } from 'zod';

export const journalReadLimitErrorResponseSchema = z.object({
  error: z.object({
    code: z.literal('JOURNAL_READ_LIMIT_EXCEEDED'),
    message: z.string(),
    details: z.object({
      scope: z.enum(['daily_context', 'journal_list_canonical', 'journal_list_legacy']),
      limit: z.number().int().positive(),
    }),
  }),
});

export type JournalReadLimitScope = z.infer<
  typeof journalReadLimitErrorResponseSchema
>['error']['details']['scope'];

export class JournalReadLimitError extends Error {
  readonly code = 'JOURNAL_READ_LIMIT_EXCEEDED';
  constructor(
    readonly scope: JournalReadLimitScope,
    readonly limit: number,
  ) {
    super('Journal read exceeds the supported result limit.');
  }
}
