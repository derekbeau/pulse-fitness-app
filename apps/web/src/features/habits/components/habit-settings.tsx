import { useState } from 'react';
import { ArrowDown, ArrowUp, PencilLine, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  defaultHabitConfigs,
  trackingSurfaceClasses,
  trackingTypeLabels,
} from '@/features/habits/lib/habit-constants';
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

function createHabitId(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${slug || 'habit'}-${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${slug || 'habit'}-${Math.random().toString(36).slice(2, 10)}`;
}

function describeHabit(habit: HabitConfig) {
  if (habit.trackingType === 'boolean') {
    return 'Check off once per day';
  }

  return `${habit.target} ${habit.unit} target`;
}

function moveHabit(list: HabitConfig[], fromIndex: number, toIndex: number) {
  const nextList = [...list];
  const [habit] = nextList.splice(fromIndex, 1);

  nextList.splice(toIndex, 0, habit);

  return nextList;
}

export function HabitSettings() {
  const [habits, setHabits] = useState<HabitConfig[]>(defaultHabitConfigs);
  const [editorState, setEditorState] = useState<HabitEditorState>(null);

  const editingHabit =
    editorState?.mode === 'edit'
      ? (habits.find((habit) => habit.id === editorState.habitId) ?? null)
      : null;

  function handleSave(values: HabitConfigDraft) {
    if (editorState?.mode === 'edit') {
      setHabits((currentHabits) =>
        currentHabits.map((habit) =>
          habit.id === editorState.habitId ? { ...habit, ...values } : habit,
        ),
      );
    } else {
      setHabits((currentHabits) => [
        ...currentHabits,
        { id: createHabitId(values.name), ...values },
      ]);
    }

    setEditorState(null);
  }

  function handleDelete(habitId: string) {
    const habit = habits.find((item) => item.id === habitId);

    if (!habit) {
      return;
    }

    const confirmed = window.confirm(`Delete "${habit.name}" from your habits list?`);

    if (!confirmed) {
      return;
    }

    setHabits((currentHabits) => currentHabits.filter((item) => item.id !== habitId));
    setEditorState((currentState) =>
      currentState?.mode === 'edit' && currentState.habitId === habitId ? null : currentState,
    );
  }

  function handleMove(habitId: string, direction: 'up' | 'down') {
    setHabits((currentHabits) => {
      const currentIndex = currentHabits.findIndex((habit) => habit.id === habitId);

      if (currentIndex === -1) {
        return currentHabits;
      }

      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

      if (nextIndex < 0 || nextIndex >= currentHabits.length) {
        return currentHabits;
      }

      return moveHabit(currentHabits, currentIndex, nextIndex);
    });
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
              Add habit
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {habits.length > 0 ? (
            <ul aria-label="Habit list" className="space-y-3">
              {habits.map((habit, index) => (
                <li key={habit.id}>
                  <article
                    className={cn(
                      'rounded-2xl border border-slate-950/10 p-4 text-slate-950 shadow-sm',
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
                            <h3 className="text-lg font-semibold text-slate-950">{habit.name}</h3>
                            <p className="text-sm text-slate-700">{describeHabit(habit)}</p>
                          </div>
                        </div>
                        <div className="inline-flex rounded-full bg-slate-950/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-800">
                          {trackingTypeLabels[habit.trackingType]}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          aria-label={`Move ${habit.name} up`}
                          disabled={index === 0}
                          onClick={() => handleMove(habit.id, 'up')}
                          size="icon-sm"
                          type="button"
                          variant="outline"
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          aria-label={`Move ${habit.name} down`}
                          disabled={index === habits.length - 1}
                          onClick={() => handleMove(habit.id, 'down')}
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
                          onClick={() => handleDelete(habit.id)}
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
          onSave={handleSave}
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
              Add habit
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
