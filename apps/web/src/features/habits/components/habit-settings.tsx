import { useState } from 'react';
import { ArrowDown, ArrowUp, PencilLine, Plus, Trash2 } from 'lucide-react';
import type { Habit } from '@pulse/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDeleteHabit, useHabits, useReorderHabits } from '@/features/habits/api/habits';
import { trackingSurfaceClasses, trackingTypeLabels } from '@/features/habits/lib/habit-constants';
import { cn } from '@/lib/utils';

import { HabitFormDialog } from './habit-form-dialog';

function describeHabit(habit: Habit) {
  if (habit.trackingType === 'boolean') {
    return 'Check off once per day';
  }

  if (habit.target == null || habit.unit == null) {
    return 'Track progress daily';
  }

  return `${habit.target} ${habit.unit} target`;
}

function moveHabit(list: Habit[], fromIndex: number, toIndex: number) {
  const nextList = [...list];
  const [habit] = nextList.splice(fromIndex, 1);

  nextList.splice(toIndex, 0, habit);

  return nextList;
}

export function HabitSettings() {
  const [errorMessage, setErrorMessage] = useState('');
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);

  const habitsQuery = useHabits();
  const deleteHabitMutation = useDeleteHabit();
  const reorderHabitsMutation = useReorderHabits();

  const habits = habitsQuery.data ?? [];
  const editingHabit = editingHabitId ? habits.find((habit) => habit.id === editingHabitId) : null;

  function handleFormDialogChange(open: boolean) {
    setIsFormDialogOpen(open);

    if (!open) {
      setEditingHabitId(null);
    }
  }

  async function handleDelete(habitId: string) {
    const habit = habits.find((item) => item.id === habitId);

    if (!habit) {
      return;
    }

    const confirmed = window.confirm(`Delete "${habit.name}" from your habits list?`);

    if (!confirmed) {
      return;
    }

    setErrorMessage('');

    try {
      await deleteHabitMutation.mutateAsync({ id: habitId });

      if (editingHabitId === habitId) {
        setEditingHabitId(null);
        setIsFormDialogOpen(false);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Habit changes could not be saved.');
    }
  }

  async function handleMove(habitId: string, direction: 'up' | 'down') {
    const currentIndex = habits.findIndex((habit) => habit.id === habitId);

    if (currentIndex === -1) {
      return;
    }

    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (nextIndex < 0 || nextIndex >= habits.length) {
      return;
    }

    setErrorMessage('');

    try {
      const reorderedHabits = moveHabit(habits, currentIndex, nextIndex);
      await reorderHabitsMutation.mutateAsync(
        reorderedHabits.map((habit, index) => ({
          id: habit.id,
          sortOrder: index,
        })),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Habit changes could not be saved.');
    }
  }

  return (
    <>
      <Card className="gap-5 border-border/70 shadow-sm">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold text-foreground">
                Habit configuration
              </CardTitle>
              <CardDescription>
                Create, reorder, and tune the habits that power the dashboard streak widgets.
              </CardDescription>
            </div>
            <Button
              className="self-start"
              onClick={() => {
                setEditingHabitId(null);
                setIsFormDialogOpen(true);
              }}
              type="button"
            >
              <Plus />
              Add habit
            </Button>
          </div>
          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </CardHeader>

        <CardContent>
          {habitsQuery.isPending ? (
            <div
              aria-busy="true"
              className="rounded-2xl border border-dashed border-border px-5 py-8 text-center"
            >
              <p className="text-base font-medium text-foreground">Loading habits...</p>
            </div>
          ) : habitsQuery.isError ? (
            <div className="rounded-2xl border border-dashed border-destructive/40 px-5 py-8 text-center">
              <p className="text-base font-medium text-foreground">Could not load habits.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Refresh the page or try again in a moment.
              </p>
            </div>
          ) : habits.length > 0 ? (
            <ul aria-label="Habit list" className="space-y-3">
              {habits.map((habit, index) => (
                <li key={habit.id}>
                  <article
                    className={cn(
                      'rounded-2xl border border-current/10 p-4 shadow-sm',
                      trackingSurfaceClasses[habit.trackingType],
                    )}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span aria-hidden="true" className="text-3xl leading-none">
                            {habit.emoji ?? '•'}
                          </span>
                          <div className="space-y-1">
                            <h3 className="text-lg font-semibold">{habit.name}</h3>
                            <p className="text-sm opacity-75">{describeHabit(habit)}</p>
                          </div>
                        </div>
                        <div className="inline-flex rounded-full bg-current/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                          {trackingTypeLabels[habit.trackingType]}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          aria-label={`Move ${habit.name} up`}
                          disabled={index === 0}
                          onClick={() => void handleMove(habit.id, 'up')}
                          size="icon-sm"
                          type="button"
                          variant="outline"
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          aria-label={`Move ${habit.name} down`}
                          disabled={index === habits.length - 1}
                          onClick={() => void handleMove(habit.id, 'down')}
                          size="icon-sm"
                          type="button"
                          variant="outline"
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          aria-label={`Edit ${habit.name}`}
                          onClick={() => {
                            setEditingHabitId(habit.id);
                            setIsFormDialogOpen(true);
                          }}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          <PencilLine />
                          Edit
                        </Button>
                        <Button
                          aria-label={`Delete ${habit.name}`}
                          onClick={() => void handleDelete(habit.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            <div className="space-y-4 rounded-2xl border border-dashed border-border px-5 py-8 text-center">
              <div>
                <p className="text-base font-medium text-foreground">No habits configured yet.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Add your first habit to start shaping the dashboard streak view.
                </p>
              </div>
              <Button
                onClick={() => {
                  setEditingHabitId(null);
                  setIsFormDialogOpen(true);
                }}
                type="button"
              >
                <Plus />
                Add habit
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <HabitFormDialog
        habit={editingHabit ?? undefined}
        onOpenChange={handleFormDialogChange}
        open={isFormDialogOpen}
      />
    </>
  );
}
