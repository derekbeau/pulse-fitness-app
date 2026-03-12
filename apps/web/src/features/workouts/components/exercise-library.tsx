import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { MoreVertical } from 'lucide-react';
import type { Exercise } from '@pulse/shared';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { useExerciseFilters, useExercises, useRenameExercise } from '../api/workouts';
import { workoutExerciseHistory } from '../lib/mock-data';
import { ExerciseTrendChart } from './exercise-trend-chart';
import { RenameExerciseDialog } from './rename-exercise-dialog';
import { TagChips } from './tag-chips';

const categoryBadgeStyles = {
  compound:
    'border-transparent bg-[var(--color-accent-pink)] text-on-pink dark:bg-pink-500/20 dark:text-pink-400',
  isolation:
    'border-transparent bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
  cardio:
    'border-transparent bg-[var(--color-accent-mint)] text-on-mint dark:bg-emerald-500/20 dark:text-emerald-400',
  mobility:
    'border-transparent bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
} as const;

const categoryOptions = ['compound', 'isolation', 'cardio', 'mobility'] as const;
const PAGE_SIZE = 8;

type ExerciseLibraryProps = {
  className?: string;
};

export function ExerciseLibrary({ className }: ExerciseLibraryProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') ?? '');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Exercise | null>(null);

  const currentQuery = searchParams.get('q') ?? '';
  const muscleGroup = searchParams.get('muscleGroup') ?? 'all';
  const equipment = searchParams.get('equipment') ?? 'all';
  const category = searchParams.get('category') ?? 'all';
  const page = parsePage(searchParams.get('page'));

  useEffect(() => {
    setSearchTerm(currentQuery);
  }, [currentQuery]);

  useEffect(() => {
    const normalizedSearchTerm = searchTerm.trim();

    if (normalizedSearchTerm === currentQuery) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);

        setSearchParam(next, 'q', normalizedSearchTerm || null);
        next.set('page', '1');

        return next;
      });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [currentQuery, searchTerm, setSearchParams]);

  const exercisesQuery = useExercises({
    category: parseCategory(category),
    equipment: normalizeFilterParam(equipment),
    limit: PAGE_SIZE,
    muscleGroup: normalizeFilterParam(muscleGroup),
    page,
    q: currentQuery || undefined,
  });

  const exerciseFiltersQuery = useExerciseFilters();
  const renameExerciseMutation = useRenameExercise();
  const filteredExercises: Exercise[] = exercisesQuery.data?.data ?? [];
  const totalResults = exercisesQuery.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));

  const muscleGroupOptions = useMemo(
    () => exerciseFiltersQuery.data?.data.muscleGroups ?? [],
    [exerciseFiltersQuery.data],
  );
  const equipmentOptions = useMemo(
    () => exerciseFiltersQuery.data?.data.equipment ?? [],
    [exerciseFiltersQuery.data],
  );

  const selectedExercise =
    filteredExercises.find((exercise) => exercise.id === selectedExerciseId) ?? null;

  return (
    <section className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">Exercise Library</h2>
        <p className="max-w-2xl text-sm text-muted">
          Search the shared exercise catalog and filter by muscle group, equipment, or movement
          category.
        </p>
      </div>

      <Card className="gap-4 py-0">
        <CardContent className="grid gap-4 py-5 md:grid-cols-2 xl:grid-cols-4">
          <FilterField label="Search by name">
            <Input
              aria-label="Search exercises"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="e.g. row, squat, stretch"
              value={searchTerm}
            />
          </FilterField>

          <FilterField label="Muscle group">
            <select
              aria-label="Filter by muscle group"
              className="min-h-[44px] w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onChange={(event) =>
                updateSearchParams(searchParams, setSearchParams, {
                  muscleGroup: event.target.value,
                })
              }
              value={muscleGroup}
            >
              <option value="all">All muscle groups</option>
              {muscleGroupOptions.map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Equipment">
            <select
              aria-label="Filter by equipment"
              className="min-h-[44px] w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onChange={(event) =>
                updateSearchParams(searchParams, setSearchParams, {
                  equipment: event.target.value,
                })
              }
              value={equipment}
            >
              <option value="all">All equipment</option>
              {equipmentOptions.map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Category">
            <select
              aria-label="Filter by category"
              className="min-h-[44px] w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onChange={(event) =>
                updateSearchParams(searchParams, setSearchParams, {
                  category: event.target.value,
                })
              }
              value={category}
            >
              <option value="all">All categories</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </FilterField>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          {exercisesQuery.isFetching && !exercisesQuery.isPending
            ? 'Updating results...'
            : `${totalResults} exercise${totalResults === 1 ? '' : 's'} shown`}
        </p>

        <div className="flex items-center gap-2">
          <Button
            disabled={page <= 1 || exercisesQuery.isFetching}
            onClick={() =>
              updateSearchParams(searchParams, setSearchParams, { page: String(page - 1) }, false)
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Previous
          </Button>
          <span className="text-sm text-muted">{`Page ${page} of ${totalPages}`}</span>
          <Button
            disabled={page >= totalPages || exercisesQuery.isFetching}
            onClick={() =>
              updateSearchParams(searchParams, setSearchParams, { page: String(page + 1) }, false)
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Next
          </Button>
        </div>
      </div>

      {exercisesQuery.isPending ? (
        <ExerciseLibrarySkeleton />
      ) : filteredExercises.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted">
              No exercises match the current search and filter combination.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredExercises.map((exercise) => (
            <ExerciseCard
              exercise={exercise}
              key={exercise.id}
              onRename={() => setRenameTarget(exercise)}
              onSelectTrend={() => setSelectedExerciseId(exercise.id)}
            />
          ))}
        </div>
      )}

      <RenameExerciseDialog
        key={renameTarget ? `${renameTarget.id}-open` : 'rename-library-closed'}
        isPending={renameExerciseMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
        onRename={(name) => {
          if (!renameTarget) {
            return;
          }

          renameExerciseMutation.mutate(
            {
              id: renameTarget.id,
              name,
            },
            {
              onError: (error) => {
                const message =
                  error instanceof ApiError
                    ? error.message
                    : 'Unable to rename exercise. Try again.';
                toast.error(message);
              },
              onSuccess: () => {
                setRenameTarget(null);
              },
            },
          );
        }}
        open={renameTarget != null}
        sourceLabel="the exercise library"
        value={renameTarget?.name ?? ''}
      />

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setSelectedExerciseId(null);
          }
        }}
        open={selectedExercise != null}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-t-3xl border-border p-0 sm:max-w-4xl sm:rounded-3xl">
          {selectedExercise ? (
            <div className="space-y-0">
              <DialogHeader className="px-6 pt-6">
                <DialogTitle>{`${selectedExercise.name} trends`}</DialogTitle>
                <DialogDescription>
                  Review weight and rep progression across completed sessions.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
                {selectedExercise.instructions ? (
                  <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">Instructions</p>
                    <p className="mt-1 text-sm text-muted">{selectedExercise.instructions}</p>
                  </div>
                ) : null}
                <ExerciseTrendChart
                  exerciseName={selectedExercise.name}
                  // TODO: Replace mock history with a real session-history query when workout history APIs land.
                  history={workoutExerciseHistory[selectedExercise.id] ?? []}
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ExerciseCard({
  exercise,
  onRename,
  onSelectTrend,
}: {
  exercise: Exercise;
  onRename: () => void;
  onSelectTrend: () => void;
}) {
  return (
    <Card className="gap-4 py-0">
      <CardHeader className="gap-3 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="space-y-1">
              <h3>
                <button
                  className="cursor-pointer text-left text-xl font-semibold text-foreground underline-offset-4 transition hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={onSelectTrend}
                  type="button"
                >
                  {exercise.name}
                </button>
              </h3>
              <TagChips tags={exercise.tags} />
            </div>

            <div className="flex flex-wrap gap-2">
              {exercise.muscleGroups.map((group) => (
                <Badge className="border-border bg-secondary/65" key={group} variant="outline">
                  {formatLabel(group)}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`Exercise actions for ${exercise.name}`}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <MoreVertical aria-hidden="true" className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Badge className="border-border bg-card" variant="outline">
              {formatLabel(exercise.equipment)}
            </Badge>
            <Badge
              className={cn(categoryBadgeStyles[exercise.category], 'capitalize')}
              variant="outline"
            >
              {exercise.category}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-5">
        <p className="text-sm text-muted">
          Targets {exercise.muscleGroups.map((group) => formatLabel(group)).join(', ')}.
        </p>
        {exercise.instructions ? (
          <p className="text-sm text-muted">{exercise.instructions}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ExerciseLibrarySkeleton() {
  return (
    <div aria-label="Loading exercises" className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-4 py-6">
            <div className="h-6 w-1/2 animate-pulse rounded-full bg-secondary" />
            <div className="h-4 w-1/3 animate-pulse rounded-full bg-secondary" />
            <div className="flex gap-2">
              <div className="h-8 w-24 animate-pulse rounded-full bg-secondary/80" />
              <div className="h-8 w-28 animate-pulse rounded-full bg-secondary/80" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FilterField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="space-y-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function updateSearchParams(
  currentSearchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  values: Record<string, string>,
  resetPage = true,
) {
  const next = new URLSearchParams(currentSearchParams);

  Object.entries(values).forEach(([key, value]) => {
    setSearchParam(next, key, value === 'all' ? null : value);
  });

  if (resetPage) {
    next.set('page', '1');
  }

  setSearchParams(next);
}

function setSearchParam(searchParams: URLSearchParams, key: string, value: string | null) {
  if (!value) {
    searchParams.delete(key);
    return;
  }

  searchParams.set(key, value);
}

function normalizeFilterParam(value: string) {
  return value === 'all' ? undefined : value;
}

function parseCategory(value: string) {
  return categoryOptions.includes(value as (typeof categoryOptions)[number])
    ? (value as (typeof categoryOptions)[number])
    : undefined;
}

function parsePage(value: string | null) {
  const page = Number.parseInt(value ?? '1', 10);

  return Number.isNaN(page) || page < 1 ? 1 : page;
}

function formatLabel(value: string) {
  return value
    .split(/[- ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
