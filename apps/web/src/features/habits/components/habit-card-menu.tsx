import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarCheck,
  CalendarX,
  LayoutDashboard,
  MoreVertical,
  Pause,
  PencilLine,
  Play,
  Trash2,
} from 'lucide-react';
import type { Habit } from '@pulse/shared';

import { Button } from '@/components/ui/button';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDeleteHabit, useReorderHabits, useUpdateHabit } from '@/features/habits/api/habits';
import { INDEFINITE_PAUSE_DATE } from '@/features/habits/lib/habit-constants';
import { useDashboardConfig, useSaveDashboardConfig } from '@/hooks/use-dashboard-config';
import { addDays, getToday, toDateKey } from '@/lib/date';

type HabitCardMenuProps = {
  habit: Habit;
  habits: Habit[];
  onEdit: (habit: Habit) => void;
};

function moveHabit(list: Habit[], fromIndex: number, toIndex: number) {
  const nextList = [...list];
  const [habit] = nextList.splice(fromIndex, 1);

  nextList.splice(toIndex, 0, habit);

  return nextList;
}

export function HabitCardMenu({ habit, habits, onEdit }: HabitCardMenuProps) {
  const today = getToday();
  const todayKey = toDateKey(today);
  const defaultPauseUntil = toDateKey(addDays(today, 7));
  const { confirm, dialog } = useConfirmation();
  const [isPauseDialogOpen, setIsPauseDialogOpen] = useState(false);
  const [pauseUntil, setPauseUntil] = useState(defaultPauseUntil);

  const updateHabitMutation = useUpdateHabit();
  const deleteHabitMutation = useDeleteHabit();
  const reorderHabitsMutation = useReorderHabits();
  const dashboardConfigQuery = useDashboardConfig();
  const saveDashboardConfig = useSaveDashboardConfig();

  const isOnDashboard = dashboardConfigQuery.data?.habitChainIds.includes(habit.id) ?? false;
  const dailyStatusWidgetId = `habit-daily:${habit.id}`;
  const isDailyStatusOnDashboard =
    dashboardConfigQuery.data?.visibleWidgets.includes(dailyStatusWidgetId) ?? false;

  const currentIndex = habits.findIndex((item) => item.id === habit.id);
  const canMoveUp = currentIndex > 0;
  const canMoveDown = currentIndex >= 0 && currentIndex < habits.length - 1;
  const isPending = useMemo(
    () =>
      updateHabitMutation.isPending ||
      deleteHabitMutation.isPending ||
      reorderHabitsMutation.isPending,
    [deleteHabitMutation.isPending, reorderHabitsMutation.isPending, updateHabitMutation.isPending],
  );

  function handleToggleDashboard() {
    const config = dashboardConfigQuery.data;
    if (!config) return;

    const nextIds = isOnDashboard
      ? config.habitChainIds.filter((id) => id !== habit.id)
      : Array.from(new Set([...config.habitChainIds, habit.id]));

    saveDashboardConfig.mutate({ ...config, habitChainIds: nextIds });
  }

  function handleToggleDailyStatusDashboard() {
    const config = dashboardConfigQuery.data;
    if (!config) return;

    const nextVisibleWidgets = isDailyStatusOnDashboard
      ? config.visibleWidgets.filter((widgetId) => widgetId !== dailyStatusWidgetId)
      : Array.from(new Set([...config.visibleWidgets, dailyStatusWidgetId]));

    saveDashboardConfig.mutate({ ...config, visibleWidgets: nextVisibleWidgets });
  }

  async function handleMove(direction: 'up' | 'down') {
    if (currentIndex === -1) {
      return;
    }

    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= habits.length) {
      return;
    }

    const reorderedHabits = moveHabit(habits, currentIndex, nextIndex);
    try {
      await reorderHabitsMutation.mutateAsync(
        reorderedHabits.map((item, index) => ({
          id: item.id,
          sortOrder: index,
        })),
      );
    } catch {
      // Mutation hook handles toasts and query recovery.
    }
  }

  async function handleToggleActive() {
    try {
      await updateHabitMutation.mutateAsync({
        id: habit.id,
        values: {
          active: !habit.active,
        },
      });
    } catch {
      // Mutation hook handles toasts and query recovery.
    }
  }

  async function handleDelete() {
    try {
      await deleteHabitMutation.mutateAsync({ id: habit.id });
    } catch {
      // Mutation hook handles toasts and query recovery.
    }
  }

  async function handlePauseScheduling(nextPausedUntil: string) {
    try {
      await updateHabitMutation.mutateAsync({
        id: habit.id,
        values: {
          pausedUntil: nextPausedUntil,
        },
      });
      setIsPauseDialogOpen(false);
    } catch {
      // Mutation hook handles toasts and query recovery.
    }
  }

  async function handleResumeScheduling() {
    try {
      await updateHabitMutation.mutateAsync({
        id: habit.id,
        values: {
          pausedUntil: null,
        },
      });
    } catch {
      // Mutation hook handles toasts and query recovery.
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Open habit actions for ${habit.name}`}
            className="-mr-1 size-11 min-h-11 min-w-11"
            disabled={isPending}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!canMoveUp} onClick={() => void handleMove('up')}>
            <ArrowUp />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveDown} onClick={() => void handleMove('down')}>
            <ArrowDown />
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onEdit(habit)}>
            <PencilLine />
            Edit
          </DropdownMenuItem>
          {dashboardConfigQuery.data ? (
            <DropdownMenuItem onClick={handleToggleDashboard}>
              <LayoutDashboard />
              {isOnDashboard ? 'Remove from dashboard' : 'Show on dashboard'}
            </DropdownMenuItem>
          ) : null}
          {dashboardConfigQuery.data ? (
            <DropdownMenuItem onClick={handleToggleDailyStatusDashboard}>
              <BarChart3 />
              {isDailyStatusOnDashboard
                ? 'Remove daily status from dashboard'
                : 'Show daily status on dashboard'}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => void handleToggleActive()}>
            {habit.active ? <Pause /> : <Play />}
            {habit.active ? 'Deactivate' : 'Activate'}
          </DropdownMenuItem>
          {habit.pausedUntil === null ? (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setPauseUntil(defaultPauseUntil);
                setIsPauseDialogOpen(true);
              }}
            >
              <CalendarX />
              Pause scheduling
            </DropdownMenuItem>
          ) : null}
          {habit.pausedUntil !== null ? (
            <DropdownMenuItem onClick={() => void handleResumeScheduling()}>
              <CalendarCheck />
              Resume scheduling
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              confirm({
                title: 'Delete habit?',
                description: `This will permanently remove "${habit.name}" from your daily habits.`,
                confirmLabel: 'Delete habit',
                variant: 'destructive',
                onConfirm: handleDelete,
              });
            }}
            variant="destructive"
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={setIsPauseDialogOpen} open={isPauseDialogOpen}>
        <DialogContent className="gap-4 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pause scheduling</DialogTitle>
            <DialogDescription>
              Keep this habit visible, but remove it from expected scheduling until the selected
              date.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5">
            <div className="space-y-2">
              <Label htmlFor={`pause-until-${habit.id}`}>Pause until</Label>
              <Input
                id={`pause-until-${habit.id}`}
                min={todayKey}
                onChange={(event) => setPauseUntil(event.currentTarget.value)}
                type="date"
                value={pauseUntil}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-1">
            <Button
              disabled={isPending}
              onClick={() => setIsPauseDialogOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isPending}
              onClick={() => void handlePauseScheduling(INDEFINITE_PAUSE_DATE)}
              type="button"
              variant="secondary"
            >
              Pause indefinitely
            </Button>
            <Button
              disabled={isPending || pauseUntil.trim().length === 0 || pauseUntil < todayKey}
              onClick={() => void handlePauseScheduling(pauseUntil)}
              type="button"
            >
              Save pause
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
