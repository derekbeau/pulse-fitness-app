import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { LayoutGrid, List, MoreVertical } from 'lucide-react';
import type { Exercise, ExerciseSort } from '@pulse/shared';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS } from '@/components/ui/per-page-constants';
import { PerPageSelector } from '@/components/ui/per-page-selector';
import { SortSelector, type SortOption } from '@/components/ui/sort-selector';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { useExerciseFilters, useExercises, useRenameExercise } from '../api/workouts';
import { ExerciseDetailModal } from './exercise-detail-modal';
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
const exerciseSortValues: ExerciseSort[] = [
  'name-asc',
  'name-desc',
  'newest',
  'oldest',
  'recently-updated',
];
const exerciseSortOptions: SortOption[] = [
  { value: 'name-asc', label: 'Name (A-Z)', direction: 'asc' },
  { value: 'name-desc', label: 'Name (Z-A)', direction: 'desc' },
  { value: 'newest', label: 'Newest', direction: 'desc' },
  { value: 'oldest', label: 'Oldest', direction: 'asc' },
  { value: 'recently-updated', label: 'Recently Updated', direction: 'desc' },
];
const EXERCISE_LIBRARY_VIEW_STORAGE_KEY = 'exercise-library-view';

type ExerciseLibraryView = 'card' | 'table';

type ExerciseLibraryProps = {
  className?: string;
};

export function ExerciseLibrary({ className }: ExerciseLibraryProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') ?? '');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Exercise | null>(null);
  const [view, setView] = useState<ExerciseLibraryView>(() => loadExerciseLibraryViewPreference());
  const initialViewRef = useRef(view);

  const currentQuery = searchParams.get('q') ?? '';
  const muscleGroup = searchParams.get('muscleGroup') ?? 'all';
  const equipment = searchParams.get('equipment') ?? 'all';
  const category = searchParams.get('category') ?? 'all';
  const sort = parseExerciseSort(searchParams.get('sort'));
  const page = parsePage(searchParams.get('page'));
  const limit = parsePageSize(searchParams.get('limit'));

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

  useEffect(() => {
    if (view === initialViewRef.current) {
      return;
    }

    window.localStorage.setItem(EXERCISE_LIBRARY_VIEW_STORAGE_KEY, view);
  }, [view]);

  const exercisesQuery = useExercises({
    category: parseCategory(category),
    equipment: normalizeFilterParam(equipment),
    limit,
    muscleGroup: normalizeFilterParam(muscleGroup),
    page,
    q: currentQuery || undefined,
    sort,
  });

  const exerciseFiltersQuery = useExerciseFilters();
  const renameExerciseMutation = useRenameExercise();
  const filteredExercises: Exercise[] = exercisesQuery.data?.data ?? [];
  const totalResults = exercisesQuery.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalResults / limit));

  const muscleGroupOptions = useMemo(
    () => exerciseFiltersQuery.data?.data.muscleGroups ?? [],
    [exerciseFiltersQuery.data],
  );
  const equipmentOptions = useMemo(
    () => exerciseFiltersQuery.data?.data.equipment ?? [],
    [exerciseFiltersQuery.data],
  );

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
        <CardContent className="grid gap-4 py-5 md:grid-cols-2 xl:grid-cols-6">
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

          <FilterField label="Sort">
            <SortSelector
              ariaLabel="Sort exercises"
              onChange={(value) => {
                if (!isExerciseSort(value)) {
                  return;
                }

                updateSearchParams(searchParams, setSearchParams, {
                  sort: value,
                });
              }}
              options={exerciseSortOptions}
              value={sort}
            />
          </FilterField>

          <FilterField label="View">
            <div
              aria-label="Exercise library view"
              className="inline-flex min-h-[44px] w-fit items-center gap-1 rounded-full border border-border bg-card p-1"
              role="group"
            >
              <Button
                aria-label="Card view"
                aria-pressed={view === 'card'}
                className="h-8 w-8 rounded-full p-0"
                onClick={() => setView('card')}
                size="sm"
                type="button"
                variant={view === 'card' ? 'default' : 'ghost'}
              >
                <LayoutGrid aria-hidden="true" className="size-4" />
              </Button>
              <Button
                aria-label="Table view"
                aria-pressed={view === 'table'}
                className="h-8 w-8 rounded-full p-0"
                onClick={() => setView('table')}
                size="sm"
                type="button"
                variant={view === 'table' ? 'default' : 'ghost'}
              >
                <List aria-hidden="true" className="size-4" />
              </Button>
            </div>
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
          <PerPageSelector
            ariaLabel="Exercises per page"
            onChange={(value) =>
              updateSearchParams(searchParams, setSearchParams, { limit: String(value) })
            }
            value={limit}
          />
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
        <ExerciseLibrarySkeleton view={view} />
      ) : filteredExercises.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted">
              No exercises match the current search and filter combination.
            </p>
          </CardContent>
        </Card>
      ) : view === 'table' ? (
        <ExerciseTable exercises={filteredExercises} onSelectTrend={setSelectedExerciseId} />
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

      {selectedExerciseId ? (
        <ExerciseDetailModal
          context="library"
          exerciseId={selectedExerciseId}
          onAddToTemplate={() => {
            navigate('/workouts?view=templates');
          }}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedExerciseId(null);
            }
          }}
          open={selectedExerciseId != null}
        />
      ) : null}
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

function ExerciseTable({
  exercises,
  onSelectTrend,
}: {
  exercises: Exercise[];
  onSelectTrend: (exerciseId: string) => void;
}) {
  return (
    <Card className="gap-0 py-0">
      <div className="overflow-x-auto">
        <table aria-label="Exercise library table view" className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Muscle Group</th>
              <th className="px-4 py-3 font-medium">Equipment</th>
              <th className="px-4 py-3 font-medium">Tracking Type</th>
            </tr>
          </thead>
          <tbody>
            {exercises.map((exercise) => (
              <tr
                className="border-b border-border/70 transition-colors hover:bg-secondary/35 focus-within:bg-secondary/35"
                key={exercise.id}
              >
                <td className="px-4 py-3 font-medium text-foreground">
                  <button
                    className="cursor-pointer text-left underline-offset-4 transition hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelectTrend(exercise.id)}
                    type="button"
                  >
                    {exercise.name}
                  </button>
                </td>
                <td className="px-4 py-3 text-muted">{formatLabel(exercise.category)}</td>
                <td className="px-4 py-3 text-muted">
                  {exercise.muscleGroups.map((group) => formatLabel(group)).join(', ')}
                </td>
                <td className="px-4 py-3 text-muted">{formatLabel(exercise.equipment)}</td>
                <td className="px-4 py-3 text-muted">{formatLabel(exercise.trackingType)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ExerciseLibrarySkeleton({ view }: { view: ExerciseLibraryView }) {
  if (view === 'table') {
    return (
      <Card aria-label="Loading exercises table view" className="gap-0 py-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Muscle Group</th>
                <th className="px-4 py-3 font-medium">Equipment</th>
                <th className="px-4 py-3 font-medium">Tracking Type</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, index) => (
                <tr className="border-b border-border/70" key={index}>
                  <td className="px-4 py-3">
                    <div className="h-4 w-40 animate-pulse rounded-full bg-secondary" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-24 animate-pulse rounded-full bg-secondary" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-32 animate-pulse rounded-full bg-secondary" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-24 animate-pulse rounded-full bg-secondary" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-28 animate-pulse rounded-full bg-secondary" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

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

function parsePageSize(value: string | null) {
  const parsedValue = Number.parseInt(value ?? String(DEFAULT_PER_PAGE), 10);

  return PER_PAGE_OPTIONS.includes(parsedValue as (typeof PER_PAGE_OPTIONS)[number])
    ? parsedValue
    : DEFAULT_PER_PAGE;
}

function isExerciseSort(value: string): value is ExerciseSort {
  return exerciseSortValues.includes(value as ExerciseSort);
}

function parseExerciseSort(value: string | null): ExerciseSort {
  return value !== null && isExerciseSort(value) ? value : 'name-asc';
}

function loadExerciseLibraryViewPreference(): ExerciseLibraryView {
  const storedValue = window.localStorage.getItem(EXERCISE_LIBRARY_VIEW_STORAGE_KEY);

  if (storedValue === 'table') {
    return 'table';
  }

  return 'card';
}

function formatLabel(value: string) {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
