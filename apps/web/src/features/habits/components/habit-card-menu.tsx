import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, MoreVertical, Pause, PencilLine, Play, Trash2 } from 'lucide-react';
import type { Habit } from '@pulse/shared';

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useDeleteHabit,
  useReorderHabits,
  useUpdateHabit,
} from '@/features/habits/api/habits';

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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const updateHabitMutation = useUpdateHabit();
  const deleteHabitMutation = useDeleteHabit();
  const reorderHabitsMutation = useReorderHabits();

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

  async function handleMove(direction: 'up' | 'down') {
    if (currentIndex === -1) {
      return;
    }

    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= habits.length) {
      return;
    }

    const reorderedHabits = moveHabit(habits, currentIndex, nextIndex);
    await reorderHabitsMutation.mutateAsync(
      reorderedHabits.map((item, index) => ({
        id: item.id,
        sortOrder: index,
      })),
    );
  }

  async function handleToggleActive() {
    await updateHabitMutation.mutateAsync({
      id: habit.id,
      values: {
        active: !habit.active,
      },
    });
  }

  async function handleDelete() {
    try {
      await deleteHabitMutation.mutateAsync({ id: habit.id });
      setIsDeleteDialogOpen(false);
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
          <DropdownMenuItem onClick={() => void handleToggleActive()}>
            {habit.active ? <Pause /> : <Play />}
            {habit.active ? 'Pause' : 'Unpause'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setIsDeleteDialogOpen(true);
            }}
            variant="destructive"
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog onOpenChange={setIsDeleteDialogOpen} open={isDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete habit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will pause tracking for <strong>{habit.name}</strong> and remove it from your
              daily habits list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteHabitMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteHabitMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {deleteHabitMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
