import { CheckCircle2Icon, SearchIcon, Trash2Icon } from 'lucide-react';
import type { Food, FoodSort } from '@pulse/shared';
import { useEffect, useRef, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeleteFood, useFoods, useUpdateFood } from '@/features/foods/api/foods';
import { accentCardStyles } from '@/lib/accent-card-styles';

type FoodListProps = {
  now?: Date;
  pageSize?: number;
};

type PendingDeleteFood = Pick<Food, 'id' | 'name'>;

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 12;

const SORT_OPTIONS: Array<{ label: string; value: FoodSort }> = [
  { label: 'Alphabetical', value: 'name' },
  { label: 'Most Recent', value: 'recent' },
  { label: 'Highest Protein', value: 'protein' },
];

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
  const dayLabel = daysAgo === 1 ? 'day' : 'days';

  return `Last used: ${daysAgo} ${dayLabel} ago`;
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

function FoodCardSkeleton() {
  return (
    <Card className="gap-4 border-border bg-card py-5 shadow-none">
      <CardHeader className="gap-3 px-5 sm:px-6">
        <div className="space-y-3">
          <div className="h-5 w-40 animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-28 animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted/60" />
        </div>
      </CardHeader>
      <CardContent className="px-5 sm:px-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-16 animate-pulse rounded-lg border border-border/70 bg-background/70"
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function FoodList({ now = new Date(), pageSize = DEFAULT_PAGE_SIZE }: FoodListProps) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<FoodSort>('recent');
  const [page, setPage] = useState(1);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [draftFoodName, setDraftFoodName] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [foodPendingDelete, setFoodPendingDelete] = useState<PendingDeleteFood | null>(null);
  const editCancelledRef = useRef(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  const foodsQuery = useFoods({
    q: debouncedSearchQuery || undefined,
    sort: sortBy,
    page,
    limit: pageSize,
  });
  const updateFood = useUpdateFood();
  const deleteFood = useDeleteFood();

  const foods = foodsQuery.data?.data ?? [];
  const totalFoods = foodsQuery.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalFoods / pageSize));
  const updateErrorMessage =
    updateFood.isError && updateFood.error instanceof Error ? updateFood.error.message : null;
  const deleteErrorMessage =
    deleteFood.isError && deleteFood.error instanceof Error ? deleteFood.error.message : null;
  const isEditingFoodPending =
    isSavingEdit ||
    (editingFoodId !== null && updateFood.isPending && updateFood.variables?.id === editingFoodId);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function beginEditing(food: Food) {
    editCancelledRef.current = false;
    setEditingFoodId(food.id);
    setDraftFoodName(food.name);
  }

  function cancelEditing() {
    editCancelledRef.current = true;
    setEditingFoodId(null);
    setDraftFoodName('');
    setIsSavingEdit(false);
  }

  async function saveEditing() {
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
  }

  async function confirmDelete(foodId: string) {
    if (editingFoodId === foodId) {
      cancelEditing();
    }

    setFoodPendingDelete(null);

    try {
      await deleteFood.mutateAsync(foodId);
    } catch {
      return;
    }
  }

  const isInitialLoading = foodsQuery.isPending;
  const isRefreshing = foodsQuery.isFetching && !foodsQuery.isPending;

  return (
    <div className="space-y-4">
      <Card className={`gap-4 py-5 ${accentCardStyles.cream}`}>
        <CardHeader className="gap-1 px-5 sm:px-6">
          <CardTitle className="text-xl">Search your foods database</CardTitle>
          <CardDescription className="text-sm opacity-70 dark:text-muted dark:opacity-100">
            Search by food name or brand, then switch between alphabetical, recency, and
            protein-focused views.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-3 px-5 sm:grid-cols-[minmax(0,1fr)_13rem] sm:px-6">
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
                  setPage(1);
                }}
                placeholder="Chicken, Fairlife, oats..."
                type="search"
                value={searchInput}
              />
            </div>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-on-cream dark:text-foreground">Sort by</span>
            <Select
              onValueChange={(value) => {
                setSortBy(value as FoodSort);
                setPage(1);
              }}
              value={sortBy}
            >
              <SelectTrigger
                aria-label="Sort foods"
                className="border-black/10 bg-white/80 text-on-cream dark:border-border dark:bg-background dark:text-foreground"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </CardContent>

        <CardContent className="px-5 pt-0 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <p>
              Showing {foods.length} of {totalFoods} foods
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
        <div className="grid gap-4 lg:grid-cols-2">
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
                : 'No foods have been saved yet.'}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
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
                          onClick={() =>
                            setFoodPendingDelete({
                              id: food.id,
                              name: food.name,
                            })
                          }
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

          {totalFoods > pageSize ? (
            <div className="flex items-center justify-between gap-3">
              <Button
                disabled={page === 1 || foodsQuery.isFetching}
                onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                type="button"
                variant="outline"
              >
                Previous
              </Button>
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <Button
                disabled={page >= totalPages || foodsQuery.isFetching}
                onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                type="button"
                variant="outline"
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setFoodPendingDelete(null);
          }
        }}
        open={foodPendingDelete !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove food?</AlertDialogTitle>
            <AlertDialogDescription>
              {foodPendingDelete
                ? `Are you sure you want to remove ${foodPendingDelete.name}?`
                : 'Are you sure you want to remove this food?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (foodPendingDelete) {
                  void confirmDelete(foodPendingDelete.id);
                }
              }}
              type="button"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
