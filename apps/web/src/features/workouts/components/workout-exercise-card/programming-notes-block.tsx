import { ClipboardList } from 'lucide-react';

import { MarkdownNote } from '../markdown-note';

type ProgrammingNotesBlockProps = {
  notes: string | null | undefined;
  testId?: string;
};

export function ProgrammingNotesBlock({ notes, testId }: ProgrammingNotesBlockProps) {
  const trimmedNotes = notes?.trim() ?? '';
  if (!trimmedNotes) {
    return null;
  }

  return (
    <div
      className="flex items-start gap-2 rounded-xl border-l-2 border-primary/35 bg-secondary/35 px-3 py-2"
      data-testid={testId}
    >
      <ClipboardList aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted" />
      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">
          Programming notes
        </p>
        <MarkdownNote className="text-[13px] italic text-muted" content={trimmedNotes} />
      </div>
    </div>
  );
}
