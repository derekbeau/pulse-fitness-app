import { zodResolver } from '@hookform/resolvers/zod';
import { nutritionDayNoteSchema } from '@pulse/shared';
import { NotebookPen } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { useUpdateNutritionNote } from '../api/nutrition';

const editorSchema = z.object({ notes: nutritionDayNoteSchema });
type EditorValues = z.infer<typeof editorSchema>;

type Props = {
  date: string;
  notes: string | null;
  disabled?: boolean;
  className?: string;
};

export function DailyNutritionNote({ date, notes, disabled = false, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState('');
  const actionRef = useRef<HTMLButtonElement>(null);
  const submissionRef = useRef(false);
  const id = useId();
  const mutation = useUpdateNutritionNote();
  const { confirm, dialog } = useConfirmation();
  const form = useForm<EditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues: { notes: notes ?? '' },
  });
  const draft = form.watch('notes');
  const pending = mutation.isPending || form.formState.isSubmitting;
  const displayedNote = mutation.isPending ? (mutation.variables?.notes ?? null) : notes;
  const error = form.formState.errors.notes?.message;

  function closeEditor() {
    setEditing(false);
    window.setTimeout(() => actionRef.current?.focus(), 0);
  }

  async function writeNote(value: string | null) {
    if (submissionRef.current || disabled) return;
    submissionRef.current = true;
    setStatus(value === null ? 'Clearing day note…' : 'Saving day note…');
    try {
      await mutation.mutateAsync({ date, notes: value });
      setStatus(value === null ? 'Day note cleared.' : 'Day note saved.');
      closeEditor();
    } catch {
      setStatus('Could not save the day note. Your text is still here; try again.');
    } finally {
      submissionRef.current = false;
    }
  }

  return (
    <section
      aria-label="Day note"
      className={cn(
        'min-w-0 space-y-3 rounded-2xl border border-border/70 bg-card p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <NotebookPen aria-hidden="true" className="size-4 text-primary" />
          Day note
        </h2>
        {!editing ? (
          <div className="flex flex-wrap gap-2">
            <Button
              ref={actionRef}
              disabled={disabled || pending}
              size="sm"
              variant="outline"
              onClick={() => {
                form.reset({ notes: notes ?? '' });
                mutation.reset();
                setStatus('');
                setEditing(true);
                window.setTimeout(() => form.setFocus('notes'), 0);
              }}
            >
              {notes ? 'Edit note' : 'Add day note'}
            </Button>
            {notes ? (
              <Button
                disabled={disabled || pending}
                size="sm"
                variant="ghost"
                onClick={() =>
                  confirm({
                    title: 'Clear day note?',
                    description:
                      'This clears the context for this day. You can add another note at any time.',
                    confirmLabel: 'Clear note',
                    variant: 'default',
                    onConfirm: () => writeNote(null),
                  })
                }
              >
                Clear note
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {editing ? (
        <form
          className="min-w-0 space-y-3"
          onSubmit={form.handleSubmit(({ notes: value }) => writeNote(value))}
        >
          <Label htmlFor={id}>Note for {date}</Label>
          <Textarea
            {...form.register('notes')}
            id={id}
            aria-invalid={Boolean(error)}
            aria-describedby={`${id}-limit${error ? ` ${id}-error` : ''}`}
            className="min-h-32 resize-y text-base [overflow-wrap:anywhere]"
            disabled={disabled || pending}
          />
          <p id={`${id}-limit`} className="text-xs text-muted">
            {draft.trim().length.toLocaleString()} / 2,000 characters after trimming
          </p>
          {error ? (
            <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={disabled || pending} type="submit">
              {pending ? 'Saving…' : 'Save note'}
            </Button>
            <Button
              disabled={pending}
              type="button"
              variant="outline"
              onClick={() => {
                setStatus('');
                closeEditor();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : displayedNote ? (
        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
          {displayedNote}
        </p>
      ) : (
        <p className="text-sm text-muted">
          Add context for the whole day, even before your first meal.
        </p>
      )}
      <p
        aria-live="polite"
        aria-atomic="true"
        className={cn('text-sm', mutation.isError ? 'text-destructive' : 'text-muted')}
        role="status"
      >
        {status}
      </p>
      {dialog}
    </section>
  );
}
