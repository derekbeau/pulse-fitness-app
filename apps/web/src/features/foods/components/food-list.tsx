import { CheckCircle2Icon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
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

const SORT_OPTIONS: Array<{ label: string; value: FoodSortOption }> = [
  { label: 'Alphabetical', value: 'alphabetical' },
  { label: 'Most Recent', value: 'most-recent' },
  { label: 'Highest Protein', value: 'highest-protein' },
];

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

function sortFoods(foods: Food[], sortBy: FoodSortOption) {
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

      const dateDiff = new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();

      if (dateDiff !== 0) {
        return dateDiff;
      }

      return a.name.localeCompare(b.name);
    });
  }

  if (sortBy === 'highest-protein') {
    return sortedFoods.sort((a, b) => {
      const proteinDiff = b.protein - a.protein;

      if (proteinDiff !== 0) {
        return proteinDiff;
      }

      return a.name.localeCompare(b.name);
    });
  }

  return sortedFoods.sort((a, b) => a.name.localeCompare(b.name));
}

export function FoodList({ foods = mockFoods, now = new Date() }: FoodListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<FoodSortOption>('alphabetical');

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredFoods = foods.filter((food) => {
    if (!normalizedQuery) {
      return true;
    }

    return [food.name, food.brand ?? ''].some((value) =>
      value.toLowerCase().includes(normalizedQuery),
    );
  });
  const visibleFoods = sortFoods(filteredFoods, sortBy);

  return (
    <div className="space-y-4">
      <Card className="gap-4 border-transparent bg-[var(--color-accent-cream)] py-5 text-[var(--color-on-accent)] shadow-none">
        <CardHeader className="gap-1 px-5 sm:px-6">
          <CardTitle className="text-xl text-[var(--color-on-accent)]">
            Search your foods database
          </CardTitle>
          <CardDescription className="text-sm text-gray-700">
            Filter by food name or brand, then switch between alphabetical, recency, and
            protein-focused views.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-3 px-5 sm:grid-cols-[minmax(0,1fr)_13rem] sm:px-6">
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
            <Select onValueChange={(value) => setSortBy(value as FoodSortOption)} value={sortBy}>
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
        </CardContent>

        <CardContent className="px-5 pt-0 sm:px-6">
          <p className="text-sm text-gray-700">
            Showing {visibleFoods.length} of {foods.length} foods
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
                    <CardTitle aria-level={3} className="text-lg" role="heading">
                      {food.name}
                    </CardTitle>
                    {food.brand ? <CardDescription>{food.brand}</CardDescription> : null}
                  </div>

                  {food.verified ? (
                    <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                      <CheckCircle2Icon className="size-3.5" />
                      Verified
                    </Badge>
                  ) : null}
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
    </div>
  );
}
