import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { parseDateKey, toDateKey } from '@/lib/date-utils';

type ScheduleWorkoutDialogProps = {
  description: string;
  initialDate: string;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitDate: (dateKey: string) => Promise<unknown>;
  open: boolean;
  submitLabel: string;
  title: string;
};

export function ScheduleWorkoutDialog({
  description,
  initialDate,
  isPending,
  onOpenChange,
  onSubmitDate,
  open,
  submitLabel,
  title,
}: ScheduleWorkoutDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(() => parseDateKey(initialDate));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setSelectedDate(parseDateKey(initialDate));
      setErrorMessage(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit() {
    setErrorMessage(null);
    try {
      await onSubmitDate(selectedDateKey);
      handleOpenChange(false);
    } catch {
      setErrorMessage('Unable to save right now. Try again.');
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center">
          <Calendar
            mode="single"
            onSelect={(date) => {
              if (date) {
                setSelectedDate(date);
              }
            }}
            selected={selectedDate}
          />
        </div>
        {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={isPending} onClick={handleSubmit} type="button">
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
