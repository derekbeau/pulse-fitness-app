import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { MoreVertical } from 'lucide-react';
import type { Exercise, ExerciseSort } from '@pulse/shared';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ColumnPicker } from '@/components/ui/column-picker';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FilterBar } from '@/components/ui/filter-bar';
import { Input } from '@/components/ui/input';
import { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS } from '@/components/ui/per-page-constants';
import { PaginationBar } from '@/components/ui/pagination-bar';
import { SortSelector, type SortOption } from '@/components/ui/sort-selector';
import { ViewToggle, type ViewToggleMode } from '@/components/ui/view-toggle';
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
const EXERCISE_LIST_COLUMNS_STORAGE_KEY = 'exercise-list-columns';

const DEFAULT_VISIBLE_EXERCISE_COLUMNS = [
  'name',
  'category',
  'equipment',
  'muscleGroups',
  'trackingType',
  'custom',
];

type ExerciseLibraryProps = {
  className?: string;
};

export function ExerciseLibrary({ className }: ExerciseLibraryProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') ?? '');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Exercise | null>(null);
  const [view, setView] = useState<ViewToggleMode>('card');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_VISIBLE_EXERCISE_COLUMNS);

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
  const tableColumns = useMemo<Column<Exercise>[]>(() => {
    return [
      {
        key: 'name',
        header: 'Name',
        sortable: true,
        className: 'min-w-56 font-medium text-foreground',
        accessor: (exercise) => exercise.name,
      },
      {
        key: 'category',
        header: 'Category',
        accessor: (exercise) => formatLabel(exercise.category),
      },
      {
        key: 'equipment',
        header: 'Equipment',
        accessor: (exercise) => formatLabel(exercise.equipment),
      },
      {
        key: 'muscleGroups',
        header: 'Muscle Groups',
        className: 'min-w-56',
        accessor: (exercise) => exercise.muscleGroups.map((group) => formatLabel(group)).join(', '),
      },
      {
        key: 'trackingType',
        header: 'Tracking Type',
        accessor: (exercise) => formatLabel(exercise.trackingType),
      },
      {
        key: 'custom',
        header: 'Custom',
        accessor: (exercise) =>
          exercise.userId ? (
            <Badge className="border-border bg-secondary/65" variant="outline">
              Custom
            </Badge>
          ) : (
            <Badge className="border-border bg-card" variant="outline">
              System
            </Badge>
          ),
      },
    ];
  }, []);
  const visibleTableColumns = useMemo(
    () => tableColumns.filter((column) => visibleColumns.includes(column.key)),
    [tableColumns, visibleColumns],
  );
  const pickerColumns = useMemo(
    () =>
      tableColumns.map((column) => ({
        key: column.key,
        label: column.header,
      })),
    [tableColumns],
  );

  const handleVisibleColumnsChange = useCallback((nextColumns: string[]) => {
    if (nextColumns.length === 0) {
      return;
    }

    setVisibleColumns(nextColumns);
  }, []);

  function handleTableSort(columnKey: string) {
    if (columnKey !== 'name') {
      return;
    }

    updateSearchParams(searchParams, setSearchParams, {
      sort: sort === 'name-asc' ? 'name-desc' : 'name-asc',
    });
  }

  return (
    <section className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">Exercise Library</h2>
        <p className="max-w-2xl text-sm text-muted">
          Search the shared exercise catalog and filter by muscle group, equipment, or movement
          category.
        </p>
      </div>

      <FilterBar
        perPageControl={
          view === 'table' ? (
            <ColumnPicker
              columns={pickerColumns}
              onChange={handleVisibleColumnsChange}
              storageKey={EXERCISE_LIST_COLUMNS_STORAGE_KEY}
              visibleColumns={visibleColumns}
            />
          ) : null
        }
        searchControl={
          <FilterField label="Search by name">
            <Input
              aria-label="Search exercises"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="e.g. row, squat, stretch"
              value={searchTerm}
            />
          </FilterField>
        }
        sortControl={
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
        }
        viewToggle={
          <ViewToggle onChange={setView} storageKey={EXERCISE_LIBRARY_VIEW_STORAGE_KEY} view={view} />
        }
      >
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
      </FilterBar>

      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          {exercisesQuery.isFetching && !exercisesQuery.isPending
            ? 'Updating results...'
            : `${totalResults} exercise${totalResults === 1 ? '' : 's'} shown`}
        </p>
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
        <DataTable
          columns={visibleTableColumns}
          data={filteredExercises}
          onRowClick={(exercise) => setSelectedExerciseId(exercise.id)}
          onSort={handleTableSort}
          tableAriaLabel="Exercise library table view"
        />
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

      {!exercisesQuery.isPending && totalResults > limit ? (
        <PaginationBar
          isLoading={exercisesQuery.isFetching}
          onPageChange={(nextPage) =>
            updateSearchParams(searchParams, setSearchParams, { page: String(nextPage) }, false)
          }
          onPerPageChange={(value) =>
            updateSearchParams(searchParams, setSearchParams, { limit: String(value) })
          }
          page={page}
          perPage={limit}
          perPageAriaLabel="Exercises per page"
          total={totalResults}
          totalPages={totalPages}
        />
      ) : null}

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

function ExerciseLibrarySkeleton({ view }: { view: ViewToggleMode }) {
  if (view === 'table') {
    return (
      <div aria-label="Loading exercises table view">
        <DataTable
          columns={[
            { key: 'name', header: 'Name', accessor: () => null },
            { key: 'category', header: 'Category', accessor: () => null },
            { key: 'equipment', header: 'Equipment', accessor: () => null },
            { key: 'muscleGroups', header: 'Muscle Groups', accessor: () => null },
            { key: 'trackingType', header: 'Tracking Type', accessor: () => null },
            { key: 'custom', header: 'Custom', accessor: () => null },
          ]}
          data={[]}
          isLoading
          tableAriaLabel="Exercise library table view"
        />
      </div>
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

function formatLabel(value: string) {
  return value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
