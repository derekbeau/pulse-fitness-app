import { ArrowUpDownIcon, CheckCircle2Icon, SearchIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { mockFoods, type Food } from '@/lib/mock-data/foods';

type FoodListProps = {
  foods?: Food[];
  now?: Date;
};

type FoodSortOption = 'alphabetical' | 'highest-protein' | 'most-recent';
type FoodSortDirection = 'ascending' | 'descending';

const SORT_OPTIONS: Array<{ label: string; value: FoodSortOption }> = [
  { label: 'Alphabetical', value: 'alphabetical' },
  { label: 'Most Recent', value: 'most-recent' },
  { label: 'Highest Protein', value: 'highest-protein' },
];

function getDefaultSortDirection(sortBy: FoodSortOption): FoodSortDirection {
  return sortBy === 'alphabetical' ? 'ascending' : 'descending';
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDaysAgo(lastUsedAt: string, now: Date) {
  const lastUsedDate = new Date(lastUsedAt);
  const diffMs = startOfDay(now).getTime() - startOfDay(lastUsedDate).getTime();

  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function formatLastUsed(lastUsedAt: string | null, now: Date) {
  if (!lastUsedAt) {
    return 'Last used: Never';
  }

  const daysAgo = getDaysAgo(lastUsedAt, now);
  const dayLabel = daysAgo === 1 ? 'day' : 'days';

  return `Last used: ${daysAgo} ${dayLabel} ago`;
}

function formatServing(food: Food) {
  return `${food.servingSize} ${food.servingUnit}`;
}

function sortFoods(foods: Food[], sortBy: FoodSortOption, sortDirection: FoodSortDirection) {
  const sortedFoods = [...foods];

  if (sortBy === 'most-recent') {
    return sortedFoods.sort((a, b) => {
      if (!a.lastUsedAt && !b.lastUsedAt) {
        return a.name.localeCompare(b.name);
      }

      if (!a.lastUsedAt) {
        return 1;
      }

      if (!b.lastUsedAt) {
        return -1;
      }

      const dateDiff = new Date(a.lastUsedAt).getTime() - new Date(b.lastUsedAt).getTime();

      if (dateDiff !== 0) {
        return sortDirection === 'ascending' ? dateDiff : -dateDiff;
      }

      return a.name.localeCompare(b.name);
    });
  }

  if (sortBy === 'highest-protein') {
    return sortedFoods.sort((a, b) => {
      const proteinDiff = a.protein - b.protein;

      if (proteinDiff !== 0) {
        return sortDirection === 'ascending' ? proteinDiff : -proteinDiff;
      }

      return a.name.localeCompare(b.name);
    });
  }

  return sortedFoods.sort((a, b) =>
    sortDirection === 'ascending' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
  );
}

export function FoodList({ foods = mockFoods, now = new Date() }: FoodListProps) {
  const [localFoods, setLocalFoods] = useState<Food[]>(() => foods);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<FoodSortOption>('alphabetical');
  const [sortDirection, setSortDirection] = useState<FoodSortDirection>(() =>
    getDefaultSortDirection('alphabetical'),
  );
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [draftFoodName, setDraftFoodName] = useState('');
  const [foodPendingDeleteId, setFoodPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setLocalFoods(foods);
  }, [foods]);

  function beginEditing(food: Food) {
    setEditingFoodId(food.id);
    setDraftFoodName(food.name);
  }

  function cancelEditing() {
    setEditingFoodId(null);
    setDraftFoodName('');
  }

  function saveEditing() {
    if (!editingFoodId) {
      return;
    }

    const nextName = draftFoodName.trim();

    if (!nextName) {
      cancelEditing();
      return;
    }

    setLocalFoods((currentFoods) =>
      currentFoods.map((food) =>
        food.id === editingFoodId ? { ...food, name: nextName } : food,
      ),
    );
    cancelEditing();
  }

  function removeFood(foodId: string) {
    setLocalFoods((currentFoods) => currentFoods.filter((food) => food.id !== foodId));

    if (editingFoodId === foodId) {
      cancelEditing();
    }

    setFoodPendingDeleteId(null);
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredFoods = localFoods.filter((food) => {
    if (!normalizedQuery) {
      return true;
    }

    return [food.name, food.brand ?? ''].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    );
  });
  const visibleFoods = sortFoods(filteredFoods, sortBy, sortDirection);
  const foodPendingDelete =
    localFoods.find((food) => food.id === foodPendingDeleteId) ?? null;

  return (
    <div className="space-y-4">
      <Card className="gap-4 border-transparent bg-[var(--color-accent-cream)] py-5 text-[var(--color-on-accent)] shadow-none">
        <CardHeader className="gap-1 px-5 sm:px-6">
          <CardTitle className="text-xl text-[var(--color-on-accent)]">
            Search your foods database
          </CardTitle>
          <CardDescription className="text-sm text-gray-700">
            Filter by food name or brand, then switch between alphabetical, recency, and
            protein-focused views with reversible sort direction.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-3 px-5 sm:grid-cols-[minmax(0,1fr)_13rem_10rem] sm:px-6">
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--color-on-accent)]">Search foods</span>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500" />
              <Input
                aria-label="Search foods"
                className="border-black/10 bg-white/80 pl-9 text-[var(--color-on-accent)] placeholder:text-gray-500 dark:bg-white/80"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Chicken, Fairlife, oats..."
                type="search"
                value={searchQuery}
              />
            </div>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--color-on-accent)]">Sort by</span>
            <Select
              onValueChange={(value) => {
                const nextSortBy = value as FoodSortOption;

                setSortBy(nextSortBy);
                setSortDirection(getDefaultSortDirection(nextSortBy));
              }}
              value={sortBy}
            >
              <SelectTrigger
                aria-label="Sort foods"
                className="border-black/10 bg-white/80 text-[var(--color-on-accent)] dark:bg-white/80"
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

          <div className="space-y-2">
            <span className="text-sm font-medium text-[var(--color-on-accent)]">Direction</span>
            <Button
              aria-label="Toggle sort direction"
              aria-pressed={sortDirection === 'descending'}
              className="w-full border-black/10 bg-white/80 text-[var(--color-on-accent)] hover:bg-white/90"
              onClick={() =>
                setSortDirection((currentDirection) =>
                  currentDirection === 'ascending' ? 'descending' : 'ascending',
                )
              }
              type="button"
              variant="outline"
            >
              <ArrowUpDownIcon className="size-4" />
              {sortDirection === 'ascending' ? 'Ascending' : 'Descending'}
            </Button>
          </div>
        </CardContent>

        <CardContent className="px-5 pt-0 sm:px-6">
          <p className="text-sm text-gray-700">
            Showing {visibleFoods.length} of {localFoods.length} foods
          </p>
        </CardContent>
      </Card>

      {visibleFoods.length === 0 ? (
        <Card className="gap-3 border-dashed py-8 text-center shadow-none">
          <CardHeader className="gap-1 px-5 sm:px-6">
            <CardTitle className="text-lg">No foods found</CardTitle>
            <CardDescription>
              Try a broader search term or switch the sort to see the full mock database again.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleFoods.map((food) => (
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
                          saveEditing();
                        }}
                      >
                        <Input
                          aria-label={`Edit ${food.name} name`}
                          autoFocus
                          className="h-9"
                          onBlur={cancelEditing}
                          onChange={(event) => setDraftFoodName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              cancelEditing();
                            }
                          }}
                          value={draftFoodName}
                        />
                        <p className="text-xs text-muted-foreground">
                          Press Enter to save or Escape to cancel.
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
                      <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                        <CheckCircle2Icon className="size-3.5" />
                        Verified
                      </Badge>
                    ) : null}

                    <Button
                      aria-label={`Delete ${food.name}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setFoodPendingDeleteId(food.id)}
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
                    <dd className="mt-1 text-sm font-semibold text-foreground">{food.calories} cal</dd>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
                    <dt className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                      Protein
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground">{food.protein}g</dd>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
                    <dt className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                      Carbs
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground">{food.carbs}g</dd>
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
          ))}
        </div>
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setFoodPendingDeleteId(null);
          }
        }}
        open={foodPendingDeleteId !== null}
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
                  removeFood(foodPendingDelete.id);
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
