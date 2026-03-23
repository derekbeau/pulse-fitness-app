import { CheckCircle2Icon, SearchIcon, Trash2Icon, XIcon } from 'lucide-react';
import type { Food, FoodSort } from '@pulse/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { FoodCardSkeleton } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ColumnPicker } from '@/components/ui/column-picker';
import { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS } from '@/components/ui/per-page-constants';
import { DataTable, type Column } from '@/components/ui/data-table';
import { FilterBar } from '@/components/ui/filter-bar';
import { PaginationBar } from '@/components/ui/pagination-bar';
import { ViewToggle, type ViewToggleMode } from '@/components/ui/view-toggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { Input } from '@/components/ui/input';
import { SortSelector, type SortOption } from '@/components/ui/sort-selector';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeleteFood, useFoods, useUpdateFood } from '@/features/foods/api/foods';
import { accentCardStyles } from '@/lib/accent-card-styles';

type FoodListProps = {
  now?: Date;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PAGE = 1;
const DEFAULT_SORT_BY: FoodSort = 'recently-updated';
const FOOD_TAG_LIMIT = 20;
const FOOD_LIST_VIEW_STORAGE_KEY = 'food-list-view';
const FOOD_LIST_COLUMNS_STORAGE_KEY = 'food-list-columns';
const DEFAULT_VISIBLE_FOOD_COLUMN_KEYS = ['name', 'calories', 'protein', 'carbs', 'fat', 'tags'];

const FOOD_SORT_VALUES: FoodSort[] = [
  'name-asc',
  'name-desc',
  'newest',
  'oldest',
  'recently-updated',
  'most-used',
  'least-used',
];
const SORT_OPTIONS: SortOption[] = [
  { label: 'Name (A-Z)', value: 'name-asc', direction: 'asc' },
  { label: 'Name (Z-A)', value: 'name-desc', direction: 'desc' },
  { label: 'Newest', value: 'newest', direction: 'desc' },
  { label: 'Oldest', value: 'oldest', direction: 'asc' },
  { label: 'Recently Updated', value: 'recently-updated', direction: 'desc' },
  { label: 'Most Used', value: 'most-used', direction: 'desc' },
  { label: 'Least Used', value: 'least-used', direction: 'asc' },
];

function isFoodSort(value: string | null): value is FoodSort {
  return value !== null && FOOD_SORT_VALUES.includes(value as FoodSort);
}

function normalizeFoodTag(tag: string) {
  return tag.trim().toLowerCase();
}

function normalizeFoodTags(tags: string[]) {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const nextTag = normalizeFoodTag(tag);
    if (!nextTag || seen.has(nextTag)) {
      continue;
    }

    seen.add(nextTag);
    normalized.push(nextTag);
  }

  return normalized;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDaysAgo(lastUsedAt: number, now: Date) {
  const lastUsedDate = new Date(lastUsedAt);
  const diffMs = startOfDay(now).getTime() - startOfDay(lastUsedDate).getTime();

  return Math.max(0, Math.floor(diffMs / MS_PER_DAY));
}

function formatLastUsed(lastUsedAt: number | null, now: Date) {
  if (!lastUsedAt) {
    return 'Last used: Never';
  }

  const daysAgo = getDaysAgo(lastUsedAt, now);

  if (daysAgo === 0) return 'Last used: Today';
  if (daysAgo === 1) return 'Last used: Yesterday';

  return `Last used: ${daysAgo} days ago`;
}

function formatServing(food: Food) {
  if (food.servingSize && food.servingGrams !== null) {
    return `${food.servingSize} (${food.servingGrams} g)`;
  }

  if (food.servingSize) {
    return food.servingSize;
  }

  if (food.servingGrams !== null) {
    return `${food.servingGrams} g`;
  }

  return 'Not provided';
}

function formatLastUsedValue(lastUsedAt: number | null, now: Date) {
  if (!lastUsedAt) {
    return 'Never';
  }

  const daysAgo = getDaysAgo(lastUsedAt, now);

  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';

  return `${daysAgo} days ago`;
}

type TableSortDirection = 'asc' | 'desc';
type ClientFoodSortKey = 'calories' | 'protein';

type ClientFoodSort = {
  key: ClientFoodSortKey;
  direction: TableSortDirection;
};

export function FoodList({ now = new Date() }: FoodListProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { confirm, dialog } = useConfirmation();
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [view, setView] = useState<ViewToggleMode>('card');
  const [clientTableSort, setClientTableSort] = useState<ClientFoodSort | null>(null);
  const [visibleTableColumns, setVisibleTableColumns] = useState<string[]>(
    DEFAULT_VISIBLE_FOOD_COLUMN_KEYS,
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [draftFoodName, setDraftFoodName] = useState('');
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editCancelledRef = useRef(false);
  const sortBy = parseFoodSort(searchParams.get('sort'));
  const page = parsePage(searchParams.get('page'));
  const pageSize = parsePageSize(searchParams.get('limit'));

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  const foodsQuery = useFoods(
    {
      q: debouncedSearchQuery || undefined,
      tags: selectedTags.length > 0 ? normalizeFoodTags(selectedTags) : undefined,
      sort: sortBy,
      page,
      limit: pageSize,
    },
  );
  const updateFood = useUpdateFood();
  const deleteFood = useDeleteFood();

  const foods = useMemo(() => foodsQuery.data?.data ?? [], [foodsQuery.data?.data]);
  const sortedFoods = useMemo(() => {
    if (!clientTableSort) {
      return foods;
    }

    const sorted = [...foods];

    return sorted.sort((left, right) => {
      const leftValue = left[clientTableSort.key];
      const rightValue = right[clientTableSort.key];

      if (leftValue === rightValue) {
        return left.name.localeCompare(right.name);
      }

      if (clientTableSort.direction === 'asc') {
        return leftValue - rightValue;
      }

      return rightValue - leftValue;
    });
  }, [clientTableSort, foods]);
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    foods.forEach((food) => {
      normalizeFoodTags(food.tags).forEach((tag) => tagSet.add(tag));
    });

    return Array.from(tagSet).sort((left, right) => left.localeCompare(right));
  }, [foods]);
  const activeSelectedTags = useMemo(() => normalizeFoodTags(selectedTags), [selectedTags]);
  const filterTags = useMemo(() => {
    const tagSet = new Set([...availableTags, ...activeSelectedTags]);

    return Array.from(tagSet).sort((left, right) => left.localeCompare(right));
  }, [activeSelectedTags, availableTags]);
  const totalFoods = foodsQuery.data?.meta.total;
  const resolvedTotalFoods = totalFoods ?? foods.length;
  const totalPages = totalFoods === undefined ? undefined : Math.max(1, Math.ceil(totalFoods / pageSize));
  const updateErrorMessage =
    updateFood.isError && updateFood.error instanceof Error ? updateFood.error.message : null;
  const deleteErrorMessage =
    deleteFood.isError && deleteFood.error instanceof Error ? deleteFood.error.message : null;
  const isEditingFoodPending =
    isSavingEdit ||
    (editingFoodId !== null && updateFood.isPending && updateFood.variables?.id === editingFoodId);

  useEffect(() => {
    if (totalPages === undefined || page <= totalPages) {
      return;
    }

    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('page', String(totalPages));
        return next;
      },
      { replace: true },
    );
  }, [page, setSearchParams, totalPages]);

  const beginEditing = useCallback((food: Food) => {
    editCancelledRef.current = false;
    setEditingFoodId(food.id);
    setDraftFoodName(food.name);
  }, []);

  const cancelEditing = useCallback(() => {
    editCancelledRef.current = true;
    setEditingFoodId(null);
    setDraftFoodName('');
    setIsSavingEdit(false);
  }, []);

  const saveEditing = useCallback(async () => {
    if (!editingFoodId || isEditingFoodPending) {
      return;
    }

    const nextName = draftFoodName.trim();
    if (!nextName) {
      cancelEditing();
      return;
    }

    const currentFood = foods.find((food) => food.id === editingFoodId);
    if (!currentFood || currentFood.name === nextName) {
      cancelEditing();
      return;
    }

    try {
      setIsSavingEdit(true);
      await updateFood.mutateAsync({
        id: editingFoodId,
        updates: {
          name: nextName,
        },
      });
      cancelEditing();
    } catch {
      return;
    } finally {
      setIsSavingEdit(false);
    }
  }, [cancelEditing, draftFoodName, editingFoodId, foods, isEditingFoodPending, updateFood]);

  const foodColumns = useMemo<Column<Food>[]>(() => {
    return [
      {
        key: 'name',
        header: 'Name',
        sortable: true,
        className: 'min-w-52',
        accessor: (food) => {
          const isUpdatingFood = updateFood.isPending && updateFood.variables?.id === food.id;

          if (editingFoodId === food.id) {
            return (
              <form
                className="space-y-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveEditing();
                }}
              >
                <Input
                  aria-label={`Edit ${food.name} name`}
                  autoFocus
                  className="h-8"
                  aria-disabled={isUpdatingFood}
                  onBlur={() => {
                    if (!isUpdatingFood && !editCancelledRef.current) {
                      void saveEditing();
                    }
                  }}
                  onChange={(event) => setDraftFoodName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelEditing();
                    }
                  }}
                  readOnly={isUpdatingFood}
                  value={draftFoodName}
                />
                <p className="text-xs text-muted-foreground">
                  {isUpdatingFood ? 'Saving…' : 'Enter to save, Escape to cancel.'}
                </p>
              </form>
            );
          }

          return <span className="font-medium text-foreground">{food.name}</span>;
        },
      },
      {
        key: 'brand',
        header: 'Brand',
        accessor: (food) => food.brand ?? '—',
      },
      {
        key: 'serving',
        header: 'Serving',
        accessor: (food) => formatServing(food),
      },
      {
        key: 'calories',
        header: 'Calories',
        sortable: true,
        accessor: (food) => `${food.calories} cal`,
      },
      {
        key: 'protein',
        header: 'Protein',
        sortable: true,
        accessor: (food) => `${food.protein}g`,
      },
      {
        key: 'carbs',
        header: 'Carbs',
        accessor: (food) => `${food.carbs}g`,
      },
      {
        key: 'fat',
        header: 'Fat',
        accessor: (food) => `${food.fat}g`,
      },
      {
        key: 'tags',
        header: 'Tags',
        className: 'min-w-56',
        accessor: (food) =>
          food.tags.length === 0 ? (
            <span className="text-xs text-muted-foreground">No tags</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {normalizeFoodTags(food.tags).map((tag) => (
                <Badge className="h-6 rounded-full px-2 text-xs" key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          ),
      },
      {
        key: 'lastUsed',
        header: 'Last Used',
        sortable: true,
        accessor: (food) => formatLastUsedValue(food.lastUsedAt, now),
      },
      {
        key: 'usageCount',
        header: 'Usage Count',
        sortable: true,
        accessor: (food) => food.usageCount,
      },
    ];
  }, [
    cancelEditing,
    draftFoodName,
    editingFoodId,
    now,
    saveEditing,
    updateFood.isPending,
    updateFood.variables?.id,
  ]);

  const visibleFoodColumns = useMemo(
    () => foodColumns.filter((column) => visibleTableColumns.includes(column.key)),
    [foodColumns, visibleTableColumns],
  );

  const pickerColumns = useMemo(
    () =>
      foodColumns.map((column) => ({
        key: column.key,
        label: column.header,
      })),
    [foodColumns],
  );

  function setTagDraft(foodId: string, value: string) {
    setTagDrafts((current) => ({
      ...current,
      [foodId]: value,
    }));
  }

  async function saveFoodTags(food: Food, tags: string[]) {
    const normalized = normalizeFoodTags(tags).slice(0, FOOD_TAG_LIMIT);
    if (
      [...normalized].sort().join('|') === [...normalizeFoodTags(food.tags)].sort().join('|')
    ) {
      return;
    }

    await updateFood.mutateAsync({
      id: food.id,
      updates: { tags: normalized },
    });
  }

  async function commitDraftTag(food: Food) {
    const draftTag = tagDrafts[food.id];
    if (!draftTag) {
      return;
    }

    const nextTag = normalizeFoodTag(draftTag);
    if (!nextTag) {
      setTagDraft(food.id, '');
      return;
    }

    await saveFoodTags(food, [...food.tags, nextTag]);
    setTagDraft(food.id, '');
  }

  function handleDeleteFood(foodId: string, foodName: string) {
    confirm({
      title: 'Delete food?',
      description: `This will permanently remove "${foodName}" from your foods database.`,
      confirmLabel: 'Delete food',
      variant: 'destructive',
      onConfirm: async () => {
        if (editingFoodId === foodId) {
          cancelEditing();
        }

        try {
          await deleteFood.mutateAsync(foodId);
        } catch {
          return;
        }
      },
    });
  }

  function updateUrlSort(nextSort: FoodSort) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('sort', nextSort);
        next.set('page', String(DEFAULT_PAGE));
        return next;
      },
      { replace: true },
    );
  }

  function toggleClientSort(key: ClientFoodSortKey) {
    setClientTableSort((current) => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' };
      }

      return {
        key,
        direction: current.direction === 'asc' ? 'desc' : 'asc',
      };
    });
  }

  function handleFoodTableSort(columnKey: string) {
    if (columnKey === 'name') {
      setClientTableSort(null);
      updateUrlSort(sortBy === 'name-asc' ? 'name-desc' : 'name-asc');
      return;
    }

    if (columnKey === 'usageCount') {
      setClientTableSort(null);
      updateUrlSort(sortBy === 'most-used' ? 'least-used' : 'most-used');
      return;
    }

    if (columnKey === 'lastUsed') {
      setClientTableSort(null);
      updateUrlSort('recently-updated');
      return;
    }

    if (columnKey === 'calories' || columnKey === 'protein') {
      toggleClientSort(columnKey);
    }
  }

  const handleVisibleTableColumnsChange = useCallback((nextColumns: string[]) => {
    if (nextColumns.length === 0) {
      return;
    }

    setVisibleTableColumns(nextColumns);
  }, []);

  const isInitialLoading = foodsQuery.isLoading;
  const isRefreshing = foodsQuery.isFetching && !foodsQuery.isLoading;

  return (
    <div className="space-y-4">
      <Card className={`gap-4 py-5 ${accentCardStyles.cream}`}>
        <CardHeader className="gap-1 px-5 sm:px-6">
          <CardTitle className="text-xl">Search your foods database</CardTitle>
          <CardDescription className="text-sm opacity-70 dark:text-muted dark:opacity-100">
            Search by food name or brand, then sort by name, freshness, updates, or usage.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-5 sm:px-6">
          <FilterBar
            className="border-black/10 bg-white/55 dark:border-border dark:bg-card"
            searchControl={
              <label className="space-y-2">
                <span className="text-sm font-medium text-on-cream dark:text-foreground">
                  Search foods
                </span>
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500" />
                  <Input
                    aria-label="Search foods"
                    className="border-black/10 bg-white/80 pl-9 text-on-cream placeholder:text-gray-500 dark:border-border dark:bg-background dark:text-foreground dark:placeholder:text-muted"
                    onChange={(event) => {
                      setSearchInput(event.target.value);
                      setSearchParams(
                        (current) => {
                          const next = new URLSearchParams(current);
                          next.set('page', String(DEFAULT_PAGE));
                          return next;
                        },
                        { replace: true },
                      );
                    }}
                    placeholder="Chicken, Fairlife, oats..."
                    type="search"
                    value={searchInput}
                  />
                </div>
              </label>
            }
            sortControl={
              <label className="space-y-2">
                <span className="text-sm font-medium text-on-cream dark:text-foreground">Sort by</span>
                <SortSelector
                  ariaLabel="Sort foods"
                  onChange={(value) => {
                    if (!isFoodSort(value)) {
                      return;
                    }

                    setClientTableSort(null);
                    setSearchParams(
                      (current) => {
                        const next = new URLSearchParams(current);
                        next.set('sort', value);
                        next.set('page', String(DEFAULT_PAGE));
                        return next;
                      },
                      { replace: true },
                    );
                  }}
                  options={SORT_OPTIONS}
                  triggerClassName="border-black/10 bg-white/80 text-on-cream dark:border-border dark:bg-background dark:text-foreground"
                  value={sortBy}
                />
              </label>
            }
            perPageControl={
              view === 'table' ? (
                <ColumnPicker
                  columns={pickerColumns}
                  onChange={handleVisibleTableColumnsChange}
                  storageKey={FOOD_LIST_COLUMNS_STORAGE_KEY}
                  visibleColumns={visibleTableColumns}
                />
              ) : null
            }
            viewToggle={<ViewToggle onChange={setView} storageKey={FOOD_LIST_VIEW_STORAGE_KEY} view={view} />}
          >
            <div className="w-full space-y-2 sm:basis-full">
              <p className="text-sm font-medium text-on-cream dark:text-foreground">Filter by tags</p>
              {filterTags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tags yet</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {filterTags.map((tag) => {
                    const isSelected = activeSelectedTags.includes(tag);
                    return (
                      <Button
                        key={tag}
                        className="h-7 rounded-full px-3 text-xs"
                        onClick={() => {
                          setSelectedTags((current) =>
                            normalizeFoodTags(current).includes(tag)
                              ? normalizeFoodTags(current).filter((currentTag) => currentTag !== tag)
                              : [...normalizeFoodTags(current), tag],
                          );
                          setSearchParams(
                            (current) => {
                              const next = new URLSearchParams(current);
                              next.set('page', String(DEFAULT_PAGE));
                              return next;
                            },
                            { replace: true },
                          );
                        }}
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                      >
                        {tag}
                      </Button>
                    );
                  })}
                  {activeSelectedTags.length > 0 ? (
                    <Button
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => setSelectedTags([])}
                      type="button"
                      variant="ghost"
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </FilterBar>
        </CardContent>

        <CardContent className="px-5 pt-0 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <p>
              Showing {foods.length} of {resolvedTotalFoods} foods
            </p>
            {isRefreshing ? <p>Refreshing foods…</p> : null}
          </div>
          {updateErrorMessage ? (
            <p className="mt-2 text-sm text-destructive">{updateErrorMessage}</p>
          ) : null}
          {deleteErrorMessage ? (
            <p className="mt-2 text-sm text-destructive">{deleteErrorMessage}</p>
          ) : null}
        </CardContent>
      </Card>

      {foodsQuery.isError ? (
        <Card className="gap-3 border-dashed py-8 text-center shadow-none">
          <CardHeader className="gap-1 px-5 sm:px-6">
            <CardTitle className="text-lg">Unable to load foods</CardTitle>
            <CardDescription>
              {foodsQuery.error instanceof Error
                ? foodsQuery.error.message
                : 'The foods API request failed.'}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : isInitialLoading ? (
        <div aria-label="Loading foods" className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <FoodCardSkeleton key={index} />
          ))}
        </div>
      ) : foods.length === 0 ? (
        <Card className="gap-3 border-dashed py-8 text-center shadow-none">
          <CardHeader className="gap-1 px-5 sm:px-6">
            <CardTitle className="text-lg">No foods found</CardTitle>
            <CardDescription>
              {debouncedSearchQuery
                ? `No saved foods matched “${debouncedSearchQuery}”. Try another search term.`
                : activeSelectedTags.length > 0
                  ? 'No foods match the selected tags.'
                  : 'No foods have been saved yet.'}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {view === 'table' ? (
            <DataTable
              columns={visibleFoodColumns}
              data={sortedFoods}
              onRowClick={(food) => beginEditing(food)}
              onSort={handleFoodTableSort}
              tableAriaLabel="Foods table view"
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {foods.map((food) => {
                const isUpdatingFood = updateFood.isPending && updateFood.variables?.id === food.id;
                const isDeletingFood = deleteFood.isPending && deleteFood.variables === food.id;

                return (
                  <Card
                    key={food.id}
                    className="gap-4 border-border bg-card py-5 shadow-none"
                    role="article"
                  >
                    <CardHeader className="gap-3 px-5 sm:px-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          {editingFoodId === food.id ? (
                            <form
                              className="space-y-2"
                              onSubmit={(event) => {
                                event.preventDefault();
                                void saveEditing();
                              }}
                            >
                              <Input
                                aria-label={`Edit ${food.name} name`}
                                autoFocus
                                className="h-9"
                                aria-disabled={isUpdatingFood}
                                onBlur={() => {
                                  if (!isUpdatingFood && !editCancelledRef.current) {
                                    void saveEditing();
                                  }
                                }}
                                onChange={(event) => setDraftFoodName(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Escape') {
                                    event.preventDefault();
                                    cancelEditing();
                                  }
                                }}
                                readOnly={isUpdatingFood}
                                value={draftFoodName}
                              />
                              <p className="text-xs text-muted-foreground">
                                {isUpdatingFood
                                  ? 'Saving changes…'
                                  : 'Press Enter or click away to save, Escape to cancel.'}
                              </p>
                            </form>
                          ) : (
                            <CardTitle aria-level={3} className="text-lg" role="heading">
                              <button
                                className="cursor-pointer text-left transition-colors hover:text-primary"
                                onClick={() => beginEditing(food)}
                                type="button"
                              >
                                {food.name}
                              </button>
                            </CardTitle>
                          )}
                          {food.brand ? <CardDescription>{food.brand}</CardDescription> : null}
                        </div>

                        <div className="flex items-start gap-2">
                          {food.verified ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-400 dark:hover:bg-emerald-500/15">
                                    <CheckCircle2Icon className="size-3.5" />
                                    Verified
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  {food.source ? `Source: ${food.source}` : 'Verified nutrition data'}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : null}

                          <Button
                            aria-label={`Delete ${food.name}`}
                            className="text-muted-foreground hover:text-destructive"
                            disabled={isDeletingFood}
                            onClick={() => handleDeleteFood(food.id, food.name)}
                            size="icon-xs"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2Icon className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                        <span>Serving: {formatServing(food)}</span>
                        <span aria-hidden="true">•</span>
                        <span>{formatLastUsed(food.lastUsedAt, now)}</span>
                        {food.usageCount > 0 ? (
                          <>
                            <span aria-hidden="true">•</span>
                            <span>Used {food.usageCount} times</span>
                          </>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {food.tags.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No tags</span>
                          ) : (
                            normalizeFoodTags(food.tags).map((tag) => (
                              <Badge
                                key={tag}
                                className="h-6 rounded-full gap-1 px-2 text-xs"
                                variant="secondary"
                              >
                                {tag}
                                <button
                                  aria-label={`Remove ${tag} tag from ${food.name}`}
                                  className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                                  disabled={isUpdatingFood}
                                  onClick={() => {
                                    void saveFoodTags(
                                      food,
                                      food.tags.filter(
                                        (foodTag) => normalizeFoodTag(foodTag) !== tag,
                                      ),
                                    ).catch(() => {
                                      return;
                                    });
                                  }}
                                  type="button"
                                >
                                  <XIcon className="size-3" />
                                </button>
                              </Badge>
                            ))
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Input
                            aria-label={`Add tag for ${food.name}`}
                            className="h-8 text-xs"
                            onChange={(event) => setTagDraft(food.id, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ',') {
                                event.preventDefault();
                                void commitDraftTag(food).catch(() => {
                                  return;
                                });
                              }
                            }}
                            placeholder="Add tag"
                            readOnly={isUpdatingFood}
                            value={tagDrafts[food.id] ?? ''}
                          />
                          <Button
                            className="h-8 px-2 text-xs"
                            disabled={isUpdatingFood}
                            onClick={() => {
                              void commitDraftTag(food).catch(() => {
                                return;
                              });
                            }}
                            type="button"
                            variant="outline"
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="px-5 sm:px-6">
                      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
                          <dt className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                            Calories
                          </dt>
                          <dd className="mt-1 text-sm font-semibold text-foreground">
                            {food.calories} cal
                          </dd>
                        </div>

                        <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
                          <dt className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                            Protein
                          </dt>
                          <dd className="mt-1 text-sm font-semibold text-foreground">
                            {food.protein}g
                          </dd>
                        </div>

                        <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
                          <dt className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                            Carbs
                          </dt>
                          <dd className="mt-1 text-sm font-semibold text-foreground">
                            {food.carbs}g
                          </dd>
                        </div>

                        <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
                          <dt className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                            Fat
                          </dt>
                          <dd className="mt-1 text-sm font-semibold text-foreground">{food.fat}g</dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {totalFoods !== undefined && totalPages !== undefined && totalFoods > pageSize ? (
            <PaginationBar
              isLoading={foodsQuery.isFetching}
              onPageChange={(nextPage) =>
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set('page', String(nextPage));
                  return next;
                })
              }
              onPerPageChange={(value) =>
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set('limit', String(value));
                  next.set('page', String(DEFAULT_PAGE));
                  return next;
                })
              }
              page={page}
              perPage={pageSize}
              perPageAriaLabel="Foods per page"
              total={resolvedTotalFoods}
              totalPages={totalPages}
            />
          ) : null}
        </>
      )}
      {dialog}
    </div>
  );
}

function parseFoodSort(value: string | null): FoodSort {
  return isFoodSort(value) ? value : DEFAULT_SORT_BY;
}

function parsePage(value: string | null) {
  const parsedValue = Number.parseInt(value ?? String(DEFAULT_PAGE), 10);

  return Number.isNaN(parsedValue) || parsedValue < DEFAULT_PAGE ? DEFAULT_PAGE : parsedValue;
}

function parsePageSize(value: string | null) {
  const parsedValue = Number.parseInt(value ?? String(DEFAULT_PER_PAGE), 10);

  return PER_PAGE_OPTIONS.includes(parsedValue as (typeof PER_PAGE_OPTIONS)[number])
    ? parsedValue
    : DEFAULT_PER_PAGE;
}
