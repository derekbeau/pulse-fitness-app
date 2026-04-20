import { useState } from 'react';

import { Button } from '@/components/ui/button';

import { FormCueChips } from '../form-cue-chips';
import { MarkdownNote } from '../markdown-note';

type FormCuesBlockProps = {
  coachingNotes?: string | null;
  exerciseCues?: string[];
  instructions?: string | null;
  sessionCues?: string[];
  templateCues?: string[];
};

export function FormCuesBlock({
  coachingNotes = null,
  exerciseCues = [],
  instructions = null,
  sessionCues = [],
  templateCues = [],
}: FormCuesBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasCues = exerciseCues.length > 0 || templateCues.length > 0 || sessionCues.length > 0;
  const hasNotes = Boolean(coachingNotes && coachingNotes.trim().length > 0);
  const hasInstructions = Boolean(instructions && instructions.trim().length > 0);

  if (!hasCues && !hasNotes && !hasInstructions) {
    return <p className="text-xs text-muted">No form cues provided.</p>;
  }

  return (
    <div className="space-y-2 rounded-xl border border-border/80 bg-secondary/20 px-3 py-2">
      <Button
        aria-expanded={isExpanded}
        className="h-7 px-2"
        onClick={() => setIsExpanded((current) => !current)}
        size="xs"
        type="button"
        variant={isExpanded ? 'secondary' : 'outline'}
      >
        {isExpanded ? 'Hide form cues' : 'Show form cues'}
      </Button>

      {isExpanded ? (
        <div className="space-y-2">
          <FormCueChips
            exerciseCoachingNotes={coachingNotes}
            exerciseCues={exerciseCues}
            sessionCues={sessionCues}
            templateCues={templateCues}
          />

          {hasInstructions ? (
            <div className="space-y-1 rounded-lg border border-border bg-card px-3 py-2">
              <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">
                Instructions
              </p>
              <MarkdownNote className="text-sm text-muted" content={instructions ?? ''} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
