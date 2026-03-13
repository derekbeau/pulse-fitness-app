/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

type ConfirmationVariant = 'destructive' | 'default';

export interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  variant?: ConfirmationVariant;
  loading?: boolean;
}

export type ConfirmationRequest = Omit<
  ConfirmationDialogProps & { onCancel?: () => void },
  'loading' | 'onOpenChange' | 'open'
>;

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'destructive',
  loading = false,
}: ConfirmationDialogProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button autoFocus type="button" variant="outline">
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              aria-busy={loading || undefined}
              disabled={loading}
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
              type="button"
              variant={variant}
            >
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useConfirmation() {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState<ConfirmationRequest | null>(null);
  const confirmedRef = React.useRef(false);

  const close = React.useCallback(() => {
    setLoading(false);
    setOpen(false);
    setConfirmation(null);
  }, []);

  const confirm = React.useCallback((request: ConfirmationRequest) => {
    confirmedRef.current = false;
    setLoading(false);
    setConfirmation(request);
    setOpen(true);
  }, []);

  const handleConfirm = React.useCallback(async () => {
    if (!confirmation) {
      return;
    }

    try {
      setLoading(true);
      const result = confirmation.onConfirm();
      if (!isPromiseLike(result)) {
        confirmedRef.current = true;
        close();
        return;
      }
      await result;
      confirmedRef.current = true;
      close();
    } catch {
      setLoading(false);
    }
  }, [close, confirmation]);

  const dialog = confirmation ? (
    <ConfirmationDialog
      cancelLabel={confirmation.cancelLabel}
      confirmLabel={confirmation.confirmLabel}
      description={confirmation.description}
      loading={loading}
      onConfirm={() => {
        void handleConfirm();
      }}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          if (!confirmedRef.current) {
            confirmation.onCancel?.();
          }
          close();
          return;
        }

        setOpen(nextOpen);
      }}
      open={open}
      title={confirmation.title}
      variant={confirmation.variant}
    />
  ) : null;

  return { confirm, dialog } as const;
}
