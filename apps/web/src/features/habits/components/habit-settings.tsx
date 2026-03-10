import { useState } from 'react';
import { ArrowDown, ArrowUp, PencilLine, Plus, Trash2 } from 'lucide-react';
import type { CreateHabitInput, Habit, UpdateHabitInput } from '@pulse/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useCreateHabit,
  useDeleteHabit,
  useHabits,
  useReorderHabits,
  useUpdateHabit,
} from '@/features/habits/api/habits';
import { trackingSurfaceClasses, trackingTypeLabels } from '@/features/habits/lib/habit-constants';
import { formatFrequencyLabel, mapHabitFrequency } from '@/features/habits/lib/habit-scheduling';
import type { HabitConfig, HabitConfigDraft } from '@/features/habits/types';
import { cn } from '@/lib/utils';

import { HabitForm } from './habit-form';

type HabitEditorState =
  | {
      mode: 'create';
    }
  | {
      habitId: string;
      mode: 'edit';
    }
  | null;

function describeHabit(habit: HabitConfig) {
  if (habit.trackingType === 'boolean') {
    return formatFrequencyLabel(habit.frequency, habit.frequencyTarget, habit.scheduledDays);
  }

  return `${habit.target} ${habit.unit} target • ${formatFrequencyLabel(
    habit.frequency,
    habit.frequencyTarget,
    habit.scheduledDays,
  )}`;
}

function moveHabit(list: HabitConfig[], fromIndex: number, toIndex: number) {
  const nextList = [...list];
  const [habit] = nextList.splice(fromIndex, 1);

  nextList.splice(toIndex, 0, habit);

  return nextList;
}

function toHabitConfig(habit: Habit): HabitConfig {
  return {
    id: habit.id,
    name: habit.name,
    emoji: habit.emoji ?? '•',
    trackingType: habit.trackingType,
    target: habit.target,
    unit: habit.unit,
    ...mapHabitFrequency(habit),
  };
}

function toCreateHabitInput(values: HabitConfigDraft): CreateHabitInput {
  return {
    emoji: values.emoji,
    name: values.name,
    target: values.target,
    trackingType: values.trackingType,
    unit: values.unit,
    frequency: values.frequency,
    frequencyTarget: values.frequencyTarget,
    pausedUntil: values.pausedUntil,
    scheduledDays: values.scheduledDays,
  };
}

function toUpdateHabitInput(values: HabitConfigDraft): UpdateHabitInput {
  return {
    emoji: values.emoji,
    name: values.name,
    target: values.target,
    trackingType: values.trackingType,
    unit: values.unit,
    frequency: values.frequency,
    frequencyTarget: values.frequencyTarget,
    pausedUntil: values.pausedUntil,
    scheduledDays: values.scheduledDays,
  };
}

export function HabitSettings() {
  const [editorState, setEditorState] = useState<HabitEditorState>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const habitsQuery = useHabits();
  const createHabitMutation = useCreateHabit();
  const updateHabitMutation = useUpdateHabit();
  const deleteHabitMutation = useDeleteHabit();
  const reorderHabitsMutation = useReorderHabits();

  const habits = (habitsQuery.data ?? []).map(toHabitConfig);
  const editingHabit =
    editorState?.mode === 'edit'
      ? (habits.find((habit) => habit.id === editorState.habitId) ?? null)
      : null;

  async function handleSave(values: HabitConfigDraft) {
    setErrorMessage('');

    try {
      if (editorState?.mode === 'edit') {
        await updateHabitMutation.mutateAsync({
          id: editorState.habitId,
          values: toUpdateHabitInput(values),
        });
      } else {
        await createHabitMutation.mutateAsync(toCreateHabitInput(values));
      }

      setEditorState(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Habit changes could not be saved.');
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
      setEditorState((currentState) =>
        currentState?.mode === 'edit' && currentState.habitId === habitId ? null : currentState,
      );
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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
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
              onClick={() => setEditorState({ mode: 'create' })}
              type="button"
            >
              <Plus />
              Add Habit
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
                            {habit.emoji}
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
                          onClick={() => setEditorState({ habitId: habit.id, mode: 'edit' })}
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
            <div className="rounded-2xl border border-dashed border-border px-5 py-8 text-center">
              <p className="text-base font-medium text-foreground">No habits configured yet.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Add your first habit to start shaping the dashboard streak view.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {editorState ? (
        <HabitForm
          key={editorState.mode === 'edit' ? editorState.habitId : 'create'}
          initialHabit={editingHabit}
          onCancel={() => setEditorState(null)}
          onSave={(values) => void handleSave(values)}
        />
      ) : (
        <Card className="gap-4 border-dashed border-border/80 shadow-sm">
          <CardHeader className="gap-2">
            <CardTitle className="text-xl font-semibold text-foreground">Editor</CardTitle>
            <CardDescription>
              Choose a habit to edit or start a new one. Target and unit fields appear only for
              numeric and time-based habits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="font-medium text-foreground">Configuration tips</p>
              <p className="mt-2">
                Use boolean habits for yes/no routines like supplements, and numeric or time habits
                for measurable goals like water, reading, or sleep.
              </p>
            </div>
            <Button onClick={() => setEditorState({ mode: 'create' })} type="button">
              <Plus />
              Add Habit
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
