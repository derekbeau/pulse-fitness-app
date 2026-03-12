import { useMemo, useState } from 'react';

import type { TrashItem, TrashType } from '@pulse/shared';
import { ChevronDownIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePurgeItem, useRestoreItem, useTrashItems } from '@/features/settings/api/trash';

const TRASH_GROUPS: Array<{ label: string; type: TrashType }> = [
  { label: 'Habits', type: 'habits' },
  { label: 'Templates', type: 'workout-templates' },
  { label: 'Exercises', type: 'exercises' },
  { label: 'Foods', type: 'foods' },
  { label: 'Workouts', type: 'workout-sessions' },
];

function formatDeletedAt(value: string): string {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedDate);
}

export function TrashManager() {
  const { data, isPending } = useTrashItems();
  const restoreItemMutation = useRestoreItem();
  const purgeItemMutation = usePurgeItem();
  const [restoreTargetId, setRestoreTargetId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);

  const itemGroups = useMemo(() => {
    if (!data) {
      return [];
    }

    return TRASH_GROUPS.map((group) => ({
      ...group,
      items: data[group.type],
    })).filter((group) => group.items.length > 0);
  }, [data]);

  const totalItems = useMemo(
    () => itemGroups.reduce((count, group) => count + group.items.length, 0),
    [itemGroups],
  );

  const isPurgePending = purgeItemMutation.isPending;

  async function handleRestoreItem(item: TrashItem) {
    setRestoreTargetId(item.id);

    try {
      await restoreItemMutation.mutateAsync({
        id: item.id,
        type: item.type,
      });
    } finally {
      setRestoreTargetId(null);
    }
  }

  async function handlePurgeItem() {
    if (!purgeTarget) {
      return;
    }

    try {
      await purgeItemMutation.mutateAsync({
        id: purgeTarget.id,
        type: purgeTarget.type,
      });
      setPurgeTarget(null);
    } catch {
      // Keep dialog open to allow user retry if request fails.
    }
  }

  return (
    <Card className="gap-4 border-border/70 shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle>
          <h2 className="text-xl font-semibold text-foreground">Trash</h2>
        </CardTitle>
        <CardDescription>
          Restore recently deleted items or permanently remove them from your account.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading trash...</p>
        ) : totalItems === 0 ? (
          <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Trash is empty
          </p>
        ) : (
          <div className="space-y-3">
            {itemGroups.map((group) => (
              <details
                key={group.type}
                className="group rounded-xl border border-border/70 bg-muted/10"
                open
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground">
                  <span>
                    {group.label} ({group.items.length})
                  </span>
                  <ChevronDownIcon className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                </summary>

                <ul className="space-y-2 border-t border-border/60 p-3">
                  {group.items.map((item) => {
                    const isRestoring =
                      restoreItemMutation.isPending && restoreTargetId !== null && restoreTargetId === item.id;

                    return (
                      <li
                        key={item.id}
                        className="flex flex-col gap-3 rounded-lg border border-border/60 bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Deleted {formatDeletedAt(item.deletedAt)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <Button
                            className="min-w-24"
                            disabled={isRestoring || isPurgePending}
                            onClick={() => {
                              void handleRestoreItem(item);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <RotateCcwIcon className="size-3.5" />
                            {isRestoring ? 'Restoring...' : 'Restore'}
                          </Button>
                          <Button
                            className="min-w-36"
                            disabled={isRestoring || isPurgePending}
                            onClick={() => {
                              setPurgeTarget(item);
                            }}
                            size="sm"
                            type="button"
                            variant="destructive"
                          >
                            <Trash2Icon className="size-3.5" />
                            Delete permanently
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
        )}
      </CardContent>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPurgeTarget(null);
          }
        }}
        open={purgeTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{purgeTarget?.name}" permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This item will be removed forever and cannot be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPurgePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={isPurgePending}
              onClick={() => {
                void handlePurgeItem();
              }}
            >
              {isPurgePending ? 'Deleting...' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
