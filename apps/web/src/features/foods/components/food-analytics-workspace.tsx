import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  Filter,
  History,
  Pencil,
  Search,
  ShieldCheck,
  Utensils,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';

import {
  type FoodAnalyticsDetail,
  type FoodAnalyticsGramsFilter,
  type FoodAnalyticsItem,
  type FoodAnalyticsQuery,
  type FoodAnalyticsRange,
  type FoodAnalyticsReviewFilter,
  type FoodAnalyticsSort,
  type FoodAnalyticsUsageFilter,
  type FoodAnalyticsVerificationFilter,
  type UpdateFoodInput,
} from '@pulse/shared';

import { ChartRangeControl } from '@/components/charts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PaginationBar } from '@/components/ui/pagination-bar';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useFoodAnalytics, useFoodAnalyticsDetail } from '@/features/foods/api/food-analytics';
import { useUpdateFood } from '@/features/foods/api/foods';
import { useDebouncedCallback } from '@/lib/use-debounced-callback';

const RANGE_OPTIONS = [
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'all', label: 'All' },
] as const;

const SORT_OPTIONS: Array<{ value: FoodAnalyticsSort; label: string }> = [
  { value: 'most_used', label: 'Most used' },
  { value: 'most_recent', label: 'Most recent' },
  { value: 'calorie_contribution', label: 'Largest calorie contributors' },
  { value: 'protein_contribution', label: 'Largest protein contributors' },
  { value: 'protein_density', label: 'Highest observed protein density' },
  { value: 'calorie_density', label: 'Highest current calorie density' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'name', label: 'Name' },
];

const REVIEW_LABELS = {
  UNVERIFIED: 'Not verified',
  SOURCE_MISSING: 'Source missing',
  SERVING_GRAMS_MISSING: 'Serving grams missing',
  MACRO_CALORIE_MISMATCH: 'Calories differ from macro estimate',
  NO_LINKED_USAGE: 'No linked usage in this range',
} as const;

const rangeValues = new Set(RANGE_OPTIONS.map((option) => option.value));
const sortValues = new Set(SORT_OPTIONS.map((option) => option.value));
const usageValues = new Set<FoodAnalyticsUsageFilter>(['any', 'used', 'unused']);
const verificationValues = new Set<FoodAnalyticsVerificationFilter>([
  'any',
  'verified',
  'unverified',
]);
const reviewValues = new Set<FoodAnalyticsReviewFilter>(['any', 'needs_review', 'clear']);
const gramsValues = new Set<FoodAnalyticsGramsFilter>(['any', 'has_grams', 'missing_grams']);

const parseEnum = <T extends string>(value: string | null, values: Set<T>, fallback: T): T =>
  value !== null && values.has(value as T) ? (value as T) : fallback;
const parsePositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const formatDateKey = (date: string | null) => {
  if (!date) return 'Not available';
  const [yearText, monthText, dayText] = date.split('-');
  if (!yearText || !monthText || !dayText) return 'Not available';
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
};
const formatNumber = (value: number, digits = 0) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
const formatPercent = (value: number | null) =>
  value === null ? 'Not available' : `${formatNumber(value, 1)}%`;
const formatDensity = (value: number | null, unit: string) =>
  value === null ? 'Not available' : `${formatNumber(value, 1)} ${unit}`;

const analyticsSelectClass =
  'min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

function AnalyticsSearchInput({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Input
      className="min-h-11 pl-10"
      id="food-analytics-search"
      onBlur={() => {
        setIsEditing(false);
        onCommit();
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        onChange(event.target.value);
      }}
      onFocus={() => {
        setDraft(value);
        setIsEditing(true);
      }}
      placeholder="Search foods or brands"
      value={isEditing ? draft : value}
    />
  );
}

function updateParam(
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  key: string,
  value: string | null,
  resetPage = true,
) {
  const next = new URLSearchParams(searchParams);
  if (value === null || value === '') next.delete(key);
  else next.set(key, value);
  if (resetPage) next.set('analyticsPage', '1');
  setSearchParams(next);
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/70 bg-background/75 p-4 shadow-sm">
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</dd>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function ReviewBadges({ item }: { item: FoodAnalyticsItem }) {
  if (item.definitionReviewReasons.length === 0) {
    return (
      <Badge className="gap-1" variant="outline">
        <CheckCircle2 className="size-3.5" /> Clear
      </Badge>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {item.definitionReviewReasons.map((reason) => (
        <Badge className="gap-1" key={reason} variant="secondary">
          <AlertCircle className="size-3.5" /> {REVIEW_LABELS[reason]}
        </Badge>
      ))}
    </div>
  );
}

function FoodAnalyticsCard({ item, onOpen }: { item: FoodAnalyticsItem; onOpen: () => void }) {
  return (
    <article className="rounded-3xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{item.name}</h3>
          <p className="truncate text-sm text-muted-foreground">
            {item.brand ?? 'No brand listed'}
          </p>
        </div>
        <Badge variant={item.currentDefinition.verified ? 'default' : 'outline'}>
          {item.currentDefinition.verified ? 'Verified' : 'Unverified'}
        </Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-muted/45 p-3">
          <p className="text-xs font-semibold text-muted-foreground">Observed in range</p>
          <p className="mt-1 text-lg font-semibold">{item.observed.usageOccurrences} occurrences</p>
          <p className="text-xs text-muted-foreground">
            {item.observed.distinctLoggedDays} days · {formatNumber(item.observed.totalCalories)}{' '}
            kcal
          </p>
        </div>
        <div className="rounded-2xl bg-muted/45 p-3">
          <p className="text-xs font-semibold text-muted-foreground">Protein contribution</p>
          <p className="mt-1 text-lg font-semibold">
            {formatNumber(item.observed.totalProtein, 1)} g
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDensity(item.observed.proteinPer100Kcal, 'g / 100 kcal')}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {formatPercent(item.observed.linkedCalorieSharePercent)} of linked-food calories
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Current definition calorie density:{' '}
        {formatDensity(item.currentDefinition.caloriesPer100Grams, 'kcal / 100 g')}
      </p>
      <div className="mt-3">
        <ReviewBadges item={item} />
      </div>
      <Button className="mt-4 min-h-11 w-full" onClick={onOpen} type="button" variant="outline">
        View {item.name} analytics <ArrowUpRight className="size-4" />
      </Button>
    </article>
  );
}

function FoodAnalyticsTable({
  items,
  onOpen,
  sort,
}: {
  items: FoodAnalyticsItem[];
  onOpen: (foodId: string) => void;
  sort: FoodAnalyticsSort;
}) {
  const ariaSort = (key: FoodAnalyticsSort) =>
    sort === key ? (key === 'name' ? ('ascending' as const) : ('descending' as const)) : undefined;
  return (
    <div className="hidden overflow-x-auto rounded-3xl border border-border bg-card lg:block">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead className="bg-muted/45 text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th aria-sort={ariaSort('name')} className="px-4 py-3" scope="col">
              Food
            </th>
            <th aria-sort={ariaSort('most_used')} className="px-4 py-3" scope="col">
              Occurrences
            </th>
            <th className="px-4 py-3" scope="col">
              Days
            </th>
            <th aria-sort={ariaSort('calorie_contribution')} className="px-4 py-3" scope="col">
              Observed calories
            </th>
            <th aria-sort={ariaSort('protein_contribution')} className="px-4 py-3" scope="col">
              Observed protein
            </th>
            <th aria-sort={ariaSort('protein_density')} className="px-4 py-3" scope="col">
              Observed protein density
            </th>
            <th aria-sort={ariaSort('calorie_density')} className="px-4 py-3" scope="col">
              Current calorie density
            </th>
            <th className="px-4 py-3" scope="col">
              Share
            </th>
            <th aria-sort={ariaSort('needs_review')} className="px-4 py-3" scope="col">
              Review
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {items.map((item) => (
            <tr key={item.foodId}>
              <td className="px-4 py-4 align-top">
                <Button
                  className="h-auto min-h-11 justify-start px-0 text-left"
                  onClick={() => onOpen(item.foodId)}
                  type="button"
                  variant="link"
                >
                  <span>
                    <span className="block font-semibold">{item.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.brand ?? 'No brand'}
                    </span>
                  </span>
                </Button>
              </td>
              <td className="px-4 py-4 align-top">{item.observed.usageOccurrences}</td>
              <td className="px-4 py-4 align-top">{item.observed.distinctLoggedDays}</td>
              <td className="px-4 py-4 align-top">
                {formatNumber(item.observed.totalCalories)} kcal
              </td>
              <td className="px-4 py-4 align-top">
                {formatNumber(item.observed.totalProtein, 1)} g
              </td>
              <td className="px-4 py-4 align-top">
                {formatDensity(item.observed.proteinPer100Kcal, 'g / 100 kcal')}
              </td>
              <td className="px-4 py-4 align-top">
                {formatDensity(item.currentDefinition.caloriesPer100Grams, 'kcal / 100 g')}
              </td>
              <td className="px-4 py-4 align-top">
                {formatPercent(item.observed.linkedCalorieSharePercent)}
              </td>
              <td className="max-w-64 px-4 py-4 align-top">
                <ReviewBadges item={item} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const nullableNumberText = z
  .string()
  .trim()
  .refine((value) => value === '' || (!Number.isNaN(Number(value)) && Number(value) >= 0), {
    message: 'Enter a non-negative number or leave blank',
  });
const positiveNullableNumberText = nullableNumberText.refine(
  (value) => value === '' || Number(value) > 0,
  'Enter a number greater than zero or leave blank',
);
const definitionFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  brand: z.string().trim().max(255),
  servingSize: z.string().trim().max(100),
  servingGrams: positiveNullableNumberText,
  calories: z.coerce.number().nonnegative(),
  protein: z.coerce.number().nonnegative(),
  carbs: z.coerce.number().nonnegative(),
  fat: z.coerce.number().nonnegative(),
  fiber: nullableNumberText,
  sugar: nullableNumberText,
  source: z.string().trim().max(255),
  notes: z.string().trim().max(2000),
  tags: z.string().max(1000),
  verified: z.boolean(),
});
type DefinitionFormValues = z.input<typeof definitionFormSchema>;

function FoodDefinitionDialog({
  item,
  onOpenChange,
  open,
}: {
  item: FoodAnalyticsItem;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const update = useUpdateFood();
  const definition = item.currentDefinition;
  const form = useForm<DefinitionFormValues>({
    resolver: zodResolver(definitionFormSchema),
    defaultValues: {
      name: item.name,
      brand: item.brand ?? '',
      servingSize: definition.servingSize ?? '',
      servingGrams: definition.servingGrams?.toString() ?? '',
      calories: definition.calories,
      protein: definition.protein,
      carbs: definition.carbs,
      fat: definition.fat,
      fiber: definition.fiber?.toString() ?? '',
      sugar: definition.sugar?.toString() ?? '',
      source: definition.source ?? '',
      notes: definition.notes ?? '',
      tags: item.tags.join(', '),
      verified: definition.verified,
    },
  });
  const verified = useWatch({ control: form.control, name: 'verified' });

  const onSubmit = async (raw: DefinitionFormValues) => {
    const values = definitionFormSchema.parse(raw);
    const nullableText = (value: string) => value || null;
    const nullableNumber = (value: string) => (value === '' ? null : Number(value));
    const updates: UpdateFoodInput = {
      name: values.name,
      brand: nullableText(values.brand),
      servingSize: nullableText(values.servingSize),
      servingGrams: nullableNumber(values.servingGrams),
      calories: values.calories,
      protein: values.protein,
      carbs: values.carbs,
      fat: values.fat,
      fiber: nullableNumber(values.fiber),
      sugar: nullableNumber(values.sugar),
      source: nullableText(values.source),
      notes: nullableText(values.notes),
      tags: [
        ...new Set(
          values.tags
            .split(',')
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
        ),
      ],
      verified: values.verified,
    };
    try {
      await update.mutateAsync({ id: item.foodId, updates });
      onOpenChange(false);
    } catch (error) {
      form.setError('root', {
        message: error instanceof Error ? error.message : 'Food definition could not be saved',
      });
    }
  };

  const field = (
    name: keyof DefinitionFormValues,
    label: string,
    inputProps?: React.ComponentProps<typeof Input>,
  ) => {
    const error = form.formState.errors[name]?.message;
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`food-definition-${name}`}>{label}</Label>
        <Input
          aria-describedby={error ? `food-definition-${name}-error` : undefined}
          aria-invalid={Boolean(error)}
          id={`food-definition-${name}`}
          {...form.register(name)}
          {...inputProps}
        />
        {error ? (
          <p className="text-sm text-destructive" id={`food-definition-${name}-error`} role="alert">
            {String(error)}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit food definition</DialogTitle>
          <DialogDescription>
            Edits change future defaults only. Historical meal entries keep the calories and macros
            recorded when they were logged.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('name', 'Name')}
            {field('brand', 'Brand')}
            {field('servingSize', 'Serving size')}
            {field('servingGrams', 'Serving grams', { inputMode: 'decimal' })}
            {field('calories', 'Calories', { inputMode: 'decimal', type: 'number', step: 'any' })}
            {field('protein', 'Protein (g)', { inputMode: 'decimal', type: 'number', step: 'any' })}
            {field('carbs', 'Carbohydrates (g)', {
              inputMode: 'decimal',
              type: 'number',
              step: 'any',
            })}
            {field('fat', 'Fat (g)', { inputMode: 'decimal', type: 'number', step: 'any' })}
            {field('fiber', 'Fiber (g)', { inputMode: 'decimal' })}
            {field('sugar', 'Sugar (g)', { inputMode: 'decimal' })}
            {field('source', 'Source')}
            {field('tags', 'Tags (comma separated)')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="food-definition-notes">Notes</Label>
            <Textarea id="food-definition-notes" {...form.register('notes')} />
          </div>
          <div className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3">
            <Checkbox
              checked={verified}
              id="food-definition-verified"
              onCheckedChange={(checked) =>
                form.setValue('verified', checked === true, { shouldDirty: true })
              }
            />
            <Label className="flex-1" htmlFor="food-definition-verified">
              Verified definition
            </Label>
          </div>
          {form.formState.errors.root ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.root.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button disabled={update.isPending} type="submit">
              {update.isPending ? 'Saving definition…' : 'Save definition'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DetailMetric({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/40 p-3">
      <dt className="text-xs font-semibold text-muted-foreground">{term}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{children}</dd>
    </div>
  );
}

function FoodAnalyticsDetailContent({ detail }: { detail: FoodAnalyticsDetail }) {
  const [editOpen, setEditOpen] = useState(false);
  const { food } = detail;
  const current = food.currentDefinition;
  const observed = food.observed;
  return (
    <>
      <div className="space-y-6 px-4 pb-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant={current.verified ? 'default' : 'outline'}>
            {current.verified ? (
              <ShieldCheck className="mr-1 size-3.5" />
            ) : (
              <CircleHelp className="mr-1 size-3.5" />
            )}
            {current.verified ? 'Verified' : 'Unverified'}
          </Badge>
          <Button
            className="min-h-11"
            onClick={() => setEditOpen(true)}
            type="button"
            variant="outline"
          >
            <Pencil className="size-4" /> Edit definition
          </Button>
        </div>

        <p className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm leading-6">
          Edits change future defaults only. Historical meal entries keep the calories and macros
          recorded when they were logged.
        </p>

        <section aria-labelledby="food-current-definition-heading" className="space-y-3">
          <h3 className="text-lg font-semibold" id="food-current-definition-heading">
            Current definition
          </h3>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <DetailMetric term="Serving">{current.servingSize ?? 'Not provided'}</DetailMetric>
            <DetailMetric term="Serving grams">
              {current.servingGrams === null
                ? 'Not available'
                : `${formatNumber(current.servingGrams, 1)} g`}
            </DetailMetric>
            <DetailMetric term="Calories">{formatNumber(current.calories)} kcal</DetailMetric>
            <DetailMetric term="Protein">{formatNumber(current.protein, 1)} g</DetailMetric>
            <DetailMetric term="Carbohydrates">{formatNumber(current.carbs, 1)} g</DetailMetric>
            <DetailMetric term="Fat">{formatNumber(current.fat, 1)} g</DetailMetric>
            <DetailMetric term="Protein density">
              {formatDensity(current.proteinPer100Kcal, 'g / 100 kcal')}
            </DetailMetric>
            <DetailMetric term="Calorie density">
              {current.caloriesPer100Grams === null
                ? 'Not available · Serving grams are missing.'
                : `${formatNumber(current.caloriesPer100Grams, 1)} kcal / 100 g`}
            </DetailMetric>
            <DetailMetric term="Source">{current.source ?? 'Not provided'}</DetailMetric>
            <DetailMetric term="Definition updated">
              {new Intl.DateTimeFormat('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: detail.range.timeZone,
              }).format(new Date(current.updatedAt))}{' '}
              · {detail.range.timeZone}
            </DetailMetric>
          </dl>
        </section>

        <section aria-labelledby="food-observed-heading" className="space-y-3">
          <h3 className="text-lg font-semibold" id="food-observed-heading">
            Observed in {detail.range.kind.toUpperCase()}
          </h3>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <DetailMetric term="Occurrences">{observed.usageOccurrences}</DetailMetric>
            <DetailMetric term="Distinct logged days">{observed.distinctLoggedDays}</DetailMetric>
            <DetailMetric term="Last logged">
              {formatDateKey(observed.lastLoggedLocalDate)}
            </DetailMetric>
            <DetailMetric term="Logged calories">
              {formatNumber(observed.totalCalories)} kcal
            </DetailMetric>
            <DetailMetric term="Logged protein">
              {formatNumber(observed.totalProtein, 1)} g
            </DetailMetric>
            <DetailMetric term="Share">
              {formatPercent(observed.linkedCalorieSharePercent)} of linked-food calories
            </DetailMetric>
            <DetailMetric term="Observed protein density">
              {observed.proteinPer100Kcal === null
                ? 'Not available · Observed calories are zero.'
                : `${formatNumber(observed.proteinPer100Kcal, 1)} g / 100 kcal`}
            </DetailMetric>
            <DetailMetric term="Observed calorie density">
              {observed.caloriesPer100Grams === null
                ? 'Not available · Logged portions do not provide compatible gram evidence.'
                : `${formatNumber(observed.caloriesPer100Grams, 1)} kcal / 100 g`}
            </DetailMetric>
            <DetailMetric term="Observed portion">
              {observed.portion.state === 'compatible' &&
              observed.portion.medianQuantity !== null &&
              observed.portion.unit !== null
                ? `${formatNumber(observed.portion.medianQuantity, 1)} ${observed.portion.unit} median`
                : observed.portion.state === 'mixed_units'
                  ? 'Not comparable · Logged units differ.'
                  : 'No linked usage in this range'}
            </DetailMetric>
            <DetailMetric term="Most recent portion">
              {observed.portion.state === 'compatible' &&
              observed.portion.recentQuantity !== null &&
              observed.portion.unit !== null
                ? `${formatNumber(observed.portion.recentQuantity, 1)} ${observed.portion.unit} · ${formatDateKey(observed.portion.recentLocalDate)}`
                : observed.portion.state === 'mixed_units'
                  ? 'Not comparable · Logged units differ.'
                  : 'No linked usage in this range'}
            </DetailMetric>
            <DetailMetric term="Day evidence">
              Complete {observed.dayStates.complete.distinctDays} · Partial{' '}
              {observed.dayStates.partial.distinctDays} · Unknown{' '}
              {observed.dayStates.unknown.distinctDays}
            </DetailMetric>
          </dl>
        </section>

        <section aria-labelledby="food-review-heading" className="space-y-3">
          <h3 className="text-lg font-semibold" id="food-review-heading">
            Definition review
          </h3>
          <ReviewBadges item={food} />
          {food.definitionReviewReasons.includes('MACRO_CALORIE_MISMATCH') ? (
            <p className="text-sm text-muted-foreground">
              Stated calories differ from the macro estimate by{' '}
              {formatNumber(current.macroCalorieDifference, 1)} kcal. Pulse flags values beyond{' '}
              {formatNumber(current.macroCalorieTolerance, 1)} kcal as a library-review heuristic.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="food-occurrences-heading" className="space-y-3">
          <h3 className="text-lg font-semibold" id="food-occurrences-heading">
            Recent linked occurrences
          </h3>
          {detail.occurrences.length === 0 ? (
            <p className="text-sm text-muted-foreground">No linked usage in this range.</p>
          ) : (
            <ul className="space-y-2">
              {detail.occurrences.map((occurrence) => (
                <li className="rounded-2xl border border-border/70 p-3" key={occurrence.mealItemId}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {formatDateKey(occurrence.localDate)} · {occurrence.mealName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatNumber(occurrence.quantity, 1)} {occurrence.unit} ·{' '}
                        {formatNumber(occurrence.calories)} kcal ·{' '}
                        {formatNumber(occurrence.protein, 1)} g protein ·{' '}
                        {formatNumber(occurrence.carbs, 1)} g carbs ·{' '}
                        {formatNumber(occurrence.fat, 1)} g fat
                      </p>
                      <Badge className="mt-2 capitalize" variant="outline">
                        {occurrence.nutritionDayState}
                      </Badge>
                    </div>
                    <Button asChild className="min-h-11" size="sm" variant="outline">
                      <Link
                        to={`/nutrition?view=log&date=${occurrence.localDate}&meal=${occurrence.mealId}`}
                      >
                        Open log <ArrowUpRight className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <FoodDefinitionDialog item={food} onOpenChange={setEditOpen} open={editOpen} />
    </>
  );
}

export function FoodAnalyticsWorkspace({
  referenceDate,
  timeZone,
}: {
  referenceDate: string;
  timeZone: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const range = parseEnum(
    searchParams.get('analyticsRange'),
    rangeValues,
    '30d',
  ) as FoodAnalyticsRange;
  const sort = parseEnum(
    searchParams.get('analyticsSort'),
    sortValues,
    'most_used',
  ) as FoodAnalyticsSort;
  const usage = parseEnum(searchParams.get('analyticsUsage'), usageValues, 'any');
  const verification = parseEnum(
    searchParams.get('analyticsVerification'),
    verificationValues,
    'any',
  );
  const review = parseEnum(searchParams.get('analyticsReview'), reviewValues, 'any');
  const grams = parseEnum(searchParams.get('analyticsServingGrams'), gramsValues, 'any');
  const page = parsePositiveInt(searchParams.get('analyticsPage'), 1);
  const limit = Math.min(100, parsePositiveInt(searchParams.get('analyticsLimit'), 10));
  const selectedFoodId = searchParams.get('foodId');
  const selectedTags = (searchParams.get('analyticsTags') ?? '').split(',').filter(Boolean);
  const queryText = searchParams.get('analyticsQ') ?? '';
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const searchUpdate = useDebouncedCallback((value: string) => {
    updateParam(searchParams, setSearchParams, 'analyticsQ', value || null);
  }, 250);

  const query: FoodAnalyticsQuery = {
    range,
    end: referenceDate,
    timeZone,
    q: queryText.trim() || undefined,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    sort,
    usage,
    verification,
    review,
    grams,
    page,
    limit,
  };
  const analyticsQuery = useFoodAnalytics(query);
  const detailQuery = useFoodAnalyticsDetail(selectedFoodId, {
    range,
    end: referenceDate,
    timeZone,
    occurrencePage: 1,
    occurrenceLimit: 25,
  });
  const analytics = analyticsQuery.data?.data;
  const totalPages = Math.max(1, Math.ceil((analyticsQuery.data?.meta.total ?? 0) / limit));
  const activeFilterCount =
    Number(usage !== 'any') +
    Number(verification !== 'any') +
    Number(review !== 'any') +
    Number(grams !== 'any') +
    selectedTags.length;

  const setSelectedFood = (foodId: string | null) => {
    if (foodId !== null && document.activeElement instanceof HTMLElement) {
      detailTriggerRef.current = document.activeElement;
    }
    updateParam(searchParams, setSearchParams, 'foodId', foodId, false);
  };
  const toggleTag = (tag: string) => {
    const nextTags = selectedTags.includes(tag)
      ? selectedTags.filter((value) => value !== tag)
      : [...selectedTags, tag].sort();
    updateParam(searchParams, setSearchParams, 'analyticsTags', nextTags.join(',') || null);
  };
  const clearFilters = () => {
    searchUpdate.cancel();
    const next = new URLSearchParams(searchParams);
    [
      'analyticsUsage',
      'analyticsVerification',
      'analyticsReview',
      'analyticsServingGrams',
      'analyticsTags',
      'analyticsQ',
    ].forEach((key) => next.delete(key));
    next.set('analyticsPage', '1');
    setSearchParams(next);
  };

  if (analyticsQuery.isLoading && !analytics) {
    return (
      <section aria-label="Loading food analytics" className="space-y-4" role="status">
        <Skeleton className="h-44 rounded-3xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton className="h-28 rounded-2xl" key={index} />
          ))}
        </div>
        <Skeleton className="h-80 rounded-3xl" />
      </section>
    );
  }

  if (analyticsQuery.isError || !analytics) {
    return (
      <EmptyState
        action={{ label: 'Retry', onClick: () => void analyticsQuery.refetch() }}
        description="Your nutrition log is safe. Try loading this range again."
        icon={AlertCircle}
        title="Food analytics could not be loaded"
      />
    );
  }

  const rangeText = `${range.toUpperCase()} · ${analytics.range.startDate ? formatDateKey(analytics.range.startDate) : 'First log'}–${formatDateKey(analytics.range.endDate)} · ${analytics.range.timeZone} · ${analytics.summary.linkedUsageOccurrences} linked occurrences`;

  return (
    <section
      aria-busy={analyticsQuery.isFetching}
      className="min-w-0 space-y-4"
      data-testid="food-analytics-workspace"
    >
      <Card className="overflow-hidden border-sky-500/25 bg-gradient-to-br from-card via-card to-primary/10">
        <CardHeader className="gap-4 sm:flex sm:items-end sm:justify-between">
          <div className="space-y-2">
            <Badge className="w-fit gap-1" variant="outline">
              <History className="size-3.5" /> Logged evidence
            </Badge>
            <div>
              <CardTitle>
                <h2 className="text-2xl">Food library analytics</h2>
              </CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-sm leading-6">
                See how saved foods were used in your nutrition log. Observed usage uses the
                calories and macros recorded with each meal item; current food definitions are shown
                separately.
              </CardDescription>
            </div>
          </div>
          <ChartRangeControl
            aria-controls="food-analytics-results"
            label="Food analytics range"
            onChange={(value) =>
              updateParam(searchParams, setSearchParams, 'analyticsRange', value)
            }
            options={RANGE_OPTIONS}
            statusText={rangeText}
            value={range}
          />
        </CardHeader>
      </Card>

      {analyticsQuery.isFetching ? (
        <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
          Refreshing food analytics…
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <SummaryMetric
          label="Saved foods used"
          value={`${analytics.summary.savedFoodsUsed} of ${analytics.summary.savedFoodsTotal}`}
          detail="Active saved foods linked in this range"
        />
        <SummaryMetric
          label="Linked occurrences"
          value={String(analytics.summary.linkedUsageOccurrences)}
          detail={`Across ${analytics.summary.distinctLoggedDays} logged days`}
        />
        <SummaryMetric
          label="Calories linked"
          value={formatPercent(analytics.summary.linkedCaloriesPercent)}
          detail="Of all meal-item calories"
        />
        <SummaryMetric
          label="Unlinked meal items"
          value={String(analytics.summary.unlinkedMealItemCount)}
          detail={`${formatNumber(analytics.summary.unlinkedMealItemCalories)} kcal · ${analytics.summary.inactiveLinkedMealItemCount} linked to trash`}
        />
        <SummaryMetric
          label="Definitions needing review"
          value={String(analytics.summary.definitionsNeedingReview)}
          detail="Neutral library checks, not a food score"
        />
      </dl>

      <Card id="food-analytics-results">
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
            <Label className="sr-only" htmlFor="food-analytics-search">
              Search saved foods
            </Label>
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" />
              <AnalyticsSearchInput
                onChange={searchUpdate.run}
                onCommit={searchUpdate.flush}
                value={queryText}
              />
            </div>
            <div>
              <Label className="sr-only" htmlFor="food-analytics-sort">
                Sort foods
              </Label>
              <select
                className={analyticsSelectClass}
                id="food-analytics-sort"
                onChange={(event) =>
                  updateParam(searchParams, setSearchParams, 'analyticsSort', event.target.value)
                }
                value={sort}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <details className="rounded-2xl border border-border/70 bg-muted/20 p-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium">
              <Filter className="size-4" /> Filters
              {activeFilterCount > 0 ? `, ${activeFilterCount} applied` : ''}
            </summary>
            <div className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Usage</span>
                <select
                  aria-label="Usage"
                  className={analyticsSelectClass}
                  onChange={(event) =>
                    updateParam(searchParams, setSearchParams, 'analyticsUsage', event.target.value)
                  }
                  value={usage}
                >
                  <option value="any">All foods</option>
                  <option value="used">Used</option>
                  <option value="unused">Unused</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Verification</span>
                <select
                  aria-label="Verification"
                  className={analyticsSelectClass}
                  onChange={(event) =>
                    updateParam(
                      searchParams,
                      setSearchParams,
                      'analyticsVerification',
                      event.target.value,
                    )
                  }
                  value={verification}
                >
                  <option value="any">All</option>
                  <option value="verified">Verified</option>
                  <option value="unverified">Unverified</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Review</span>
                <select
                  aria-label="Review"
                  className={analyticsSelectClass}
                  onChange={(event) =>
                    updateParam(
                      searchParams,
                      setSearchParams,
                      'analyticsReview',
                      event.target.value,
                    )
                  }
                  value={review}
                >
                  <option value="any">Any status</option>
                  <option value="needs_review">Needs review</option>
                  <option value="clear">Clear</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Serving grams</span>
                <select
                  aria-label="Serving grams"
                  className={analyticsSelectClass}
                  onChange={(event) =>
                    updateParam(
                      searchParams,
                      setSearchParams,
                      'analyticsServingGrams',
                      event.target.value,
                    )
                  }
                  value={grams}
                >
                  <option value="any">Any</option>
                  <option value="has_grams">Has grams</option>
                  <option value="missing_grams">Missing grams</option>
                </select>
              </label>
            </div>
            {analytics.availableTags.length > 0 ? (
              <fieldset className="mt-4">
                <legend className="text-sm font-medium">Tags</legend>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-3">
                  {analytics.availableTags.map((tag) => (
                    <label className="flex min-h-11 items-center gap-2 text-sm" key={tag}>
                      <Checkbox
                        checked={selectedTags.includes(tag)}
                        onCheckedChange={() => toggleTag(tag)}
                      />{' '}
                      {tag}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {activeFilterCount > 0 ? (
              <Button
                className="mt-3 min-h-11"
                onClick={clearFilters}
                type="button"
                variant="ghost"
              >
                Clear filters
              </Button>
            ) : null}
          </details>

          {analytics.items.length === 0 ? (
            analytics.summary.savedFoodsTotal === 0 ? (
              <EmptyState
                description="Foods saved through agent logging will appear here."
                icon={Utensils}
                title="No saved foods yet"
              />
            ) : activeFilterCount > 0 || queryText ? (
              <EmptyState
                action={{ label: 'Clear filters', onClick: clearFilters }}
                description="Try a different search or remove a filter."
                icon={Search}
                title="No foods match these filters"
              />
            ) : (
              <EmptyState
                description="Saved foods remain visible as unused when they have no linked meal items."
                icon={History}
                title="No linked saved-food usage in this range"
              />
            )
          ) : (
            <>
              <div className="grid gap-3 lg:hidden">
                {analytics.items.map((item) => (
                  <FoodAnalyticsCard
                    item={item}
                    key={item.foodId}
                    onOpen={() => setSelectedFood(item.foodId)}
                  />
                ))}
              </div>
              <FoodAnalyticsTable items={analytics.items} onOpen={setSelectedFood} sort={sort} />
              <PaginationBar
                className="pt-2"
                isLoading={analyticsQuery.isFetching}
                onPageChange={(nextPage) =>
                  updateParam(
                    searchParams,
                    setSearchParams,
                    'analyticsPage',
                    String(nextPage),
                    false,
                  )
                }
                page={page}
                perPage={limit}
                onPerPageChange={(nextLimit) =>
                  updateParam(searchParams, setSearchParams, 'analyticsLimit', String(nextLimit))
                }
                perPageAriaLabel="Foods per analytics page"
                total={analyticsQuery.data?.meta.total}
                totalPages={totalPages}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Sheet
        onOpenChange={(open) => {
          if (!open) setSelectedFood(null);
        }}
        open={selectedFoodId !== null}
      >
        <SheetContent
          className="overflow-y-auto pt-6 sm:max-w-xl lg:max-w-2xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            detailTriggerRef.current?.focus();
          }}
          side="right"
        >
          <SheetHeader className="pr-12">
            <SheetTitle>
              {!detailQuery.isPlaceholderData && detailQuery.data?.food.name
                ? detailQuery.data.food.name
                : 'Food analytics'}
            </SheetTitle>
            <SheetDescription>
              {!detailQuery.isPlaceholderData && detailQuery.data?.food.brand
                ? detailQuery.data.food.brand
                : 'Current definition and historical linked usage'}
            </SheetDescription>
          </SheetHeader>
          {detailQuery.isLoading || detailQuery.isPlaceholderData ? (
            <div className="space-y-3 px-4 sm:px-6" role="status" aria-label="Loading food detail">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          ) : detailQuery.isError || !detailQuery.data ? (
            <div className="mx-4 rounded-2xl border border-destructive/40 p-4 sm:mx-6" role="alert">
              <p className="font-medium">Food detail could not be loaded</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The library definition and logged meals are unchanged.
              </p>
              <Button className="mt-3" onClick={() => void detailQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <FoodAnalyticsDetailContent detail={detailQuery.data} />
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
