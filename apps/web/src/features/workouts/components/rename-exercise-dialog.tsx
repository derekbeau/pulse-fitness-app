import { useState } from 'react';

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

type RenameExerciseDialogProps = {
  isPending?: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (name: string) => void;
  open: boolean;
  sourceLabel: string;
  value: string;
};

export function RenameExerciseDialog({
  isPending = false,
  onOpenChange,
  onRename,
  open,
  sourceLabel,
  value,
}: RenameExerciseDialogProps) {
  const [name, setName] = useState(value);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && trimmedName !== value.trim() && !isPending;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename exercise</DialogTitle>
          <DialogDescription>{`This updates the exercise name globally from ${sourceLabel}.`}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) {
              return;
            }

            onRename(trimmedName);
          }}
        >
          <Input
            aria-label="Exercise name"
            autoFocus
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!canSubmit} type="submit">
              {isPending ? 'Renaming...' : 'Rename'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
