import { type FormEvent, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toDateKey } from '@/lib/date-utils';
import { cn } from '@/lib/utils';

import { activityTypeOptions, getActivityTypeIcon, getActivityTypeLabel } from '../lib/mock-data';
import { formatDuration } from '../lib/format';
import type { Activity, ActivityType } from '../types';

type ActivityFormProps = {
  className?: string;
  onSubmit: (activity: Activity) => void;
};

type ActivityFormState = {
  date: string;
  durationMinutes: string;
  name: string;
  notes: string;
  type: ActivityType;
};

const activityNameSuggestions: Record<ActivityType, string> = {
  walking: 'Morning Walk',
  running: 'Zone 2 Run',
  stretching: 'Recovery Stretch',
  yoga: 'Evening Yoga Flow',
  cycling: 'Neighborhood Ride',
  swimming: 'Recovery Swim',
  hiking: 'Local Trail Hike',
  other: 'Movement Session',
};

function createDefaultFormState(): ActivityFormState {
  return {
    date: toDateKey(new Date()),
    durationMinutes: '',
    name: activityNameSuggestions.walking,
    notes: '',
    type: 'walking',
  };
}

export function ActivityForm({ className, onSubmit }: ActivityFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formState, setFormState] = useState<ActivityFormState>(createDefaultFormState);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const parsedDuration = Number(formState.durationMinutes);
  const hasValidDuration =
    formState.durationMinutes.trim().length > 0 &&
    Number.isFinite(parsedDuration) &&
    parsedDuration > 0;
  const isSubmitDisabled =
    formState.name.trim().length === 0 || formState.date.trim().length === 0 || !hasValidDuration;

  const resetForm = () => {
    setFormState(createDefaultFormState());
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);

    if (!open) {
      resetForm();
    }
  };

  const handleTypeChange = (nextType: ActivityType) => {
    setFormState((current) => {
      const previousSuggestion = activityNameSuggestions[current.type];
      const nextSuggestion = activityNameSuggestions[nextType];
      const shouldReplaceName =
        current.name.trim().length === 0 || current.name === previousSuggestion;

      return {
        ...current,
        name: shouldReplaceName ? nextSuggestion : current.name,
        type: nextType,
      };
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitDisabled) {
      return;
    }

    const activityName = formState.name.trim();
    const notes = formState.notes.trim();

    onSubmit({
      date: formState.date,
      durationMinutes: parsedDuration,
      id: `activity-local-${crypto.randomUUID()}`,
      linkedJournalEntries: [],
      name: activityName,
      notes: notes.length > 0 ? notes : undefined,
      type: formState.type,
    });

    setSuccessMessage(`Logged "${activityName}" to the local activity list.`);
    handleOpenChange(false);
  };

  const selectedTypeLabel = getActivityTypeLabel(formState.type);
  const durationPreview = hasValidDuration ? formatDuration(parsedDuration) : null;

  return (
    <div className={cn('space-y-3', className)}>
      <Button onClick={() => setIsOpen(true)} type="button">
        <Plus aria-hidden="true" className="size-4" />
        Add Activity
      </Button>

      {successMessage ? (
        <div
          aria-live="polite"
          className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950 dark:text-emerald-300"
        >
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p>{successMessage}</p>
        </div>
      ) : null}

      <Dialog onOpenChange={handleOpenChange} open={isOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Log a new activity</DialogTitle>
            <DialogDescription>
              Add a movement session to the local prototype list. This does not persist yet.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-3">
              <Label>Type</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {activityTypeOptions.map((type) => {
                  const ActivityTypeIcon = getActivityTypeIcon(type);
                  const isSelected = formState.type === type;

                  return (
                    <Button
                      key={type}
                      aria-pressed={isSelected}
                      className={cn(
                        'h-auto justify-start rounded-2xl px-3 py-3 text-left',
                        isSelected &&
                          'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
                      )}
                      onClick={() => handleTypeChange(type)}
                      type="button"
                      variant={isSelected ? 'default' : 'outline'}
                    >
                      <ActivityTypeIcon aria-hidden="true" className="size-4" />
                      {getActivityTypeLabel(type)}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="activity-name">Name</Label>
                <Input
                  id="activity-name"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder={activityNameSuggestions[formState.type]}
                  value={formState.name}
                />
                <p className="text-xs text-muted">
                  Suggested for {selectedTypeLabel.toLowerCase()}. You can edit this before saving.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="activity-duration">Duration</Label>
                <Input
                  id="activity-duration"
                  inputMode="numeric"
                  min="1"
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      durationMinutes: event.target.value,
                    }))
                  }
                  placeholder="30"
                  type="number"
                  value={formState.durationMinutes}
                />
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Clock3 aria-hidden="true" className="size-3.5" />
                  {durationPreview
                    ? `Preview: ${durationPreview}`
                    : 'Enter minutes to preview the formatted duration.'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="activity-date">Date</Label>
                <Input
                  id="activity-date"
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, date: event.target.value }))
                  }
                  type="date"
                  value={formState.date}
                />
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <CalendarDays aria-hidden="true" className="size-3.5" />
                  Defaults to today for quick logging.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="activity-notes">Notes</Label>
              <Textarea
                id="activity-notes"
                onChange={(event) =>
                  setFormState((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Optional context about pace, recovery, terrain, or how it felt."
                value={formState.notes}
              />
            </div>

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={isSubmitDisabled} type="submit">
                Log Activity
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
