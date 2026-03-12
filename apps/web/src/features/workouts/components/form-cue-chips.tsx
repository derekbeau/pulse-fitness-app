import { useState } from 'react';
import { Plus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type FormCueChipsProps = {
  exerciseCues: string[];
  onAddSessionCue?: (cue: string) => void;
  sessionCues?: string[];
  templateCues?: string[];
};

export function FormCueChips({
  exerciseCues,
  onAddSessionCue,
  sessionCues = [],
  templateCues = [],
}: FormCueChipsProps) {
  const [draftCue, setDraftCue] = useState('');
  const [isAddingCue, setIsAddingCue] = useState(false);
  const hasAnyCues = exerciseCues.length > 0 || templateCues.length > 0 || sessionCues.length > 0;

  if (!hasAnyCues && !onAddSessionCue) {
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
        {cues.map((cue) => (
          <Badge className={cn('max-w-full whitespace-normal text-xs', tone)} key={`${label}-${cue}`}>
            {cue}
          </Badge>
        ))}
      </div>
    </div>
  );
}
