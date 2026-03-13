import { useState } from 'react';
import { Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type FormCueChipsProps = {
  exerciseCues: string[];
  exerciseCoachingNotes?: string | null;
  onAddSessionCue?: (cue: string) => void;
  sessionCues?: string[];
  templateProgrammingNotes?: string | null;
  templateCues?: string[];
};

export function FormCueChips({
  exerciseCues,
  exerciseCoachingNotes = null,
  onAddSessionCue,
  sessionCues = [],
  templateProgrammingNotes = null,
  templateCues = [],
}: FormCueChipsProps) {
  const [draftCue, setDraftCue] = useState('');
  const [isAddingCue, setIsAddingCue] = useState(false);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const hasAnyCues = exerciseCues.length > 0 || templateCues.length > 0 || sessionCues.length > 0;
  const hasAnyNotes =
    Boolean(exerciseCoachingNotes && exerciseCoachingNotes.trim().length > 0) ||
    Boolean(templateProgrammingNotes && templateProgrammingNotes.trim().length > 0);

  if (!hasAnyCues && !hasAnyNotes && !onAddSessionCue) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-[0.18em] text-muted uppercase">Form cues</p>
        {onAddSessionCue ? (
          <Button
            aria-label="Add session cue"
            className="h-7 gap-1 px-2"
            onClick={() => setIsAddingCue((current) => !current)}
            size="xs"
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" className="size-3.5" />
            Cue
          </Button>
        ) : null}
      </div>

      {onAddSessionCue && isAddingCue ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            const cue = draftCue.trim();

            if (!cue) {
              return;
            }

            onAddSessionCue(cue);
            setDraftCue('');
            setIsAddingCue(false);
          }}
        >
          <Input
            aria-label="Session cue input"
            className="h-8"
            onChange={(event) => setDraftCue(event.target.value)}
            placeholder="e.g. Keep elbows soft at lockout"
            value={draftCue}
          />
          <div className="flex gap-2">
            <Button className="h-8 px-3" size="xs" type="submit" variant="secondary">
              Add
            </Button>
            <Button
              className="h-8 px-3"
              onClick={() => {
                setDraftCue('');
                setIsAddingCue(false);
              }}
              size="xs"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {exerciseCues.length > 0 ? (
        <CueGroup
          cues={exerciseCues}
          label="Exercise cues"
          tone="border-border bg-secondary/60 text-muted-foreground"
        />
      ) : null}

      {templateCues.length > 0 ? (
        <CueGroup
          cues={templateCues}
          label="Template cues"
          tone="border-transparent bg-primary/12 text-primary"
        />
      ) : null}

      {sessionCues.length > 0 ? (
        <CueGroup
          cues={sessionCues}
          label="Session cues"
          tone="border-dashed border-primary/40 bg-background text-foreground"
        />
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
                  <p className="text-sm text-muted">{exerciseCoachingNotes}</p>
                </div>
              ) : null}
              {templateProgrammingNotes ? (
                <div className="space-y-1">
                  <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">
                    Template programming notes
                  </p>
                  <p className="text-sm text-muted">{templateProgrammingNotes}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CueGroup({
  cues,
  label,
  tone,
}: {
  cues: string[];
  label: string;
  tone: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {cues.map((cue, index) => (
          <Badge
            className={cn('max-w-full whitespace-normal text-xs', tone)}
            key={`${label}-${index}-${cue}`}
          >
            {cue}
          </Badge>
        ))}
      </div>
    </div>
  );
}
