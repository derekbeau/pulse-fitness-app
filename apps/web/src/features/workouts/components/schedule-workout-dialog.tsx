import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
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
  disallowDateKey?: string;
  disallowDateMessage?: string;
  initialDate: string;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove?: () => Promise<unknown>;
  onSubmitDate: (dateKey: string) => Promise<unknown>;
  open: boolean;
  removeLabel?: string;
  submitLabel: string;
  title: string;
};

export function ScheduleWorkoutDialog({
  description,
  disallowDateKey,
  disallowDateMessage = 'Pick a different date.',
  initialDate,
  isPending,
  onOpenChange,
  onRemove,
  onSubmitDate,
  open,
  removeLabel = 'Remove from schedule',
  submitLabel,
  title,
}: ScheduleWorkoutDialogProps) {
  const [pendingSelectedDate, setPendingSelectedDate] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmation();
  const selectedDate = pendingSelectedDate ?? parseDateKey(initialDate);
  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setPendingSelectedDate(null);
      setErrorMessage(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit() {
    setErrorMessage(null);

    if (disallowDateKey != null && selectedDateKey === disallowDateKey) {
      setErrorMessage(disallowDateMessage);
      return;
    }

    try {
      await onSubmitDate(selectedDateKey);
      handleOpenChange(false);
    } catch {
      setErrorMessage('Unable to save right now. Try again.');
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="gap-2 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 flex justify-center">
          <Calendar
            className="p-0"
            mode="single"
            onSelect={(date) => {
              if (date) {
                setPendingSelectedDate(date);
              }
            }}
            selected={selectedDate}
          />
        </div>
        {onRemove ? (
          <div className="flex justify-center py-1">
            <button
              className="cursor-pointer text-sm text-destructive underline-offset-4 hover:underline disabled:opacity-50"
              disabled={isRemoving || isPending}
              onClick={() =>
                confirm({
                  title: 'Remove from schedule?',
                  description:
                    'This scheduled workout will be permanently deleted and cannot be recovered. Your template and exercises are not affected.',
                  confirmLabel: 'Remove',
                  variant: 'destructive',
                  onConfirm: async () => {
                    setIsRemoving(true);
                    try {
                      await onRemove();
                      handleOpenChange(false);
                    } finally {
                      setIsRemoving(false);
                    }
                  },
                })
              }
              type="button"
            >
              {removeLabel}
            </button>
          </div>
        ) : null}
        {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={isPending || isRemoving} onClick={handleSubmit} type="button">
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
      {confirmDialog}
    </Dialog>
  );
}
