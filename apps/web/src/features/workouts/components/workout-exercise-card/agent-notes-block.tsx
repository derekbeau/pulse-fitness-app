import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

import { MarkdownNote } from '../markdown-note';

import type { WorkoutExerciseCardAgentNotesMeta } from './types';

type AgentNotesBlockProps = {
  compact?: boolean;
  notes: string | null | undefined;
  notesMeta?: WorkoutExerciseCardAgentNotesMeta | null;
  testId?: string;
};

const generatedAtFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
});

export function AgentNotesBlock({ compact = false, notes, notesMeta, testId }: AgentNotesBlockProps) {
  const trimmedNotes = notes?.trim() ?? '';
  if (!trimmedNotes) {
    return null;
  }

  const generatedAtLabel = formatGeneratedAt(notesMeta?.generatedAt);

  return (
    <div
      className={cn(
        compact
          ? 'space-y-1 rounded-lg border border-sky-500/20 bg-sky-500/8 px-2.5 py-2'
          : 'flex items-start gap-2 rounded-xl border-l-2 border-sky-500/35 bg-sky-500/10 px-3 py-2',
      )}
      data-testid={testId}
    >
      <Sparkles
        aria-hidden="true"
        className={cn('shrink-0 text-sky-700 dark:text-sky-300', compact ? 'size-3.5' : 'mt-0.5 size-3.5')}
      />
      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">For today</p>
        <MarkdownNote className="text-[13px] italic text-muted" content={trimmedNotes} />
        {generatedAtLabel || notesMeta?.stale ? (
          <p className="text-[10px] text-muted">
            {generatedAtLabel ? `generated ${generatedAtLabel}` : 'generated recently'}
            {notesMeta?.stale ? ' • possibly stale — rescheduled' : ''}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function formatGeneratedAt(generatedAt: string | undefined) {
  if (!generatedAt) {
    return null;
  }

  const parsed = new Date(generatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return generatedAtFormatter.format(parsed);
}
