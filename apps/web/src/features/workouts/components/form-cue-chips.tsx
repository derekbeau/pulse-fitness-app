import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MarkdownNote } from './markdown-note';

type FormCueChipsProps = {
  exerciseCues: string[];
  exerciseCoachingNotes?: string | null;
  sessionCues?: string[];
  templateProgrammingNotes?: string | null;
  templateCues?: string[];
};

export function FormCueChips({
  exerciseCues,
  exerciseCoachingNotes = null,
  sessionCues = [],
  templateProgrammingNotes = null,
  templateCues = [],
}: FormCueChipsProps) {
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const allCues = [
    ...exerciseCues.map((cue) => ({
      cue,
      tone: 'border-border bg-secondary/60 text-muted-foreground',
    })),
    ...templateCues.map((cue) => ({ cue, tone: 'border-transparent bg-primary/12 text-primary' })),
    ...sessionCues.map((cue) => ({
      cue,
      tone: 'border-dashed border-primary/40 bg-background text-foreground',
    })),
  ];
  const hasAnyNotes =
    Boolean(exerciseCoachingNotes && exerciseCoachingNotes.trim().length > 0) ||
    Boolean(templateProgrammingNotes && templateProgrammingNotes.trim().length > 0);

  if (allCues.length === 0 && !hasAnyNotes) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">Form cues</p>

      {allCues.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {allCues.map(({ cue, tone }, index) => (
            <Badge
              className={cn('max-w-full whitespace-normal text-xs', tone)}
              key={`cue-${index}-${cue}`}
            >
              {cue}
            </Badge>
          ))}
        </div>
      ) : null}

      {hasAnyNotes ? (
        <div className="space-y-2">
          <Button
            aria-expanded={isNotesExpanded}
            className="h-7 px-2"
            onClick={() => setIsNotesExpanded((current) => !current)}
            size="xs"
            type="button"
            variant={isNotesExpanded ? 'secondary' : 'outline'}
          >
            {isNotesExpanded ? 'Hide notes' : 'Show notes'}
          </Button>
          {isNotesExpanded ? (
            <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
              {exerciseCoachingNotes ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">
                    Exercise coaching notes
                  </p>
                  <MarkdownNote className="text-sm text-muted" content={exerciseCoachingNotes} />
                </div>
              ) : null}
              {templateProgrammingNotes ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">
                    Template programming notes
                  </p>
                  <MarkdownNote className="text-sm text-muted" content={templateProgrammingNotes} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
