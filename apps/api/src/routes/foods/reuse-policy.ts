import type {
  Food,
  NutritionFoodMatch,
  NutritionPromotionCandidate,
  NutritionRecentMealItem,
} from '@pulse/shared';

// Reviewed server-owned advisory aliases. Changes require a version bump and literal tests.
export const FOOD_ALIAS_VERSION = '1';
export const FOOD_ALIASES = [
  ['tj', 'Trader Joe', "Trader Joe's"],
  ['jam', 'preserves', 'jelly', 'raspberry'],
  ['bread', 'toast', 'sourdough', 'slice'],
  [
    'standard shake',
    'protein shake',
    'Orgain',
    'Orgain Chocolate Protein Powder',
    "Anthony's",
    "Anthony's Premium Pea Protein",
    'pea protein',
    'protein powder',
  ],
] as const;

export const normalizeFoodIdentity = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const tokens = (value: string) => normalizeFoodIdentity(value).split(' ').filter(Boolean);
const containsTokens = (value: string, query: string) => {
  const haystack = tokens(value);
  return tokens(query).every((token) => haystack.includes(token));
};
export const foodQueryVariants = (query: string | undefined): string[] => {
  if (!query) return [];
  const variants: string[] = [query];
  for (const group of FOOD_ALIASES) {
    if (group.some((alias) => containsTokens(query, alias))) variants.push(...group);
  }
  return [...new Set(variants)];
};

// Name identity must be unique BEFORE considering an optional brand. No rank is consulted.
export const exactReusableFood = <T extends Pick<Food, 'name' | 'brand'>>(
  foods: T[],
  name: string,
  brand?: string | null,
): T | undefined => {
  const identity = normalizeFoodIdentity(name);
  const exact = identity
    ? foods.filter((food) => normalizeFoodIdentity(food.name) === identity)
    : [];
  if (exact.length !== 1) return undefined;
  const food = exact[0];
  if (!food) return undefined;
  return brand != null && normalizeFoodIdentity(food.brand ?? '') !== normalizeFoodIdentity(brand)
    ? undefined
    : food;
};

const EVIDENCE_ORDER = [
  'exact_normalized',
  'alias_exact',
  'brand_or_tag',
  'token_order',
  'recent_name',
  'partial_name',
] as const;
export const rankFoodMatches = (
  foods: Food[],
  query: string | undefined,
  recent: NutritionRecentMealItem[] = [],
): NutritionFoodMatch[] => {
  const normalized = normalizeFoodIdentity(query ?? '');
  if (!normalized) return [];
  const variants = foodQueryVariants(query);
  const matches = foods.flatMap<NutritionFoodMatch>((food) => {
    const evidence: NutritionFoodMatch['evidence'] = [];
    const name = normalizeFoodIdentity(food.name);
    const add = (
      category: (typeof EVIDENCE_ORDER)[number],
      value: string,
      field: 'name' | 'brand' | 'tag' | 'recent_item',
      mealItemId?: string,
    ) => {
      evidence.push({ category, field, value, ...(mealItemId ? { mealItemId } : {}) });
    };
    if (name === normalized) add('exact_normalized', food.name, 'name');
    for (const variant of variants.slice(1)) {
      if (
        containsTokens(food.name, variant) ||
        (food.brand && containsTokens(food.brand, variant))
      ) {
        add('alias_exact', variant, containsTokens(food.name, variant) ? 'name' : 'brand');
      }
    }
    if (food.brand && containsTokens(food.brand, normalized))
      add('brand_or_tag', food.brand, 'brand');
    for (const tag of food.tags)
      if (containsTokens(tag, normalized)) add('brand_or_tag', tag, 'tag');
    if (
      name !== normalized &&
      tokens(name).sort().join(' ') === tokens(normalized).sort().join(' ')
    )
      add('token_order', food.name, 'name');
    for (const entry of recent) {
      if (entry.item.foodId === food.id && normalizeFoodIdentity(entry.item.name) === normalized)
        add('recent_name', entry.item.name, 'recent_item', entry.item.id);
    }
    if (name !== normalized && containsTokens(name, normalized))
      add('partial_name', food.name, 'name');
    evidence.sort(
      (a, b) =>
        EVIDENCE_ORDER.indexOf(a.category as (typeof EVIDENCE_ORDER)[number]) -
          EVIDENCE_ORDER.indexOf(b.category as (typeof EVIDENCE_ORDER)[number]) ||
        compare(a.value, b.value) ||
        compare(a.mealItemId ?? '', b.mealItemId ?? ''),
    );
    const best = evidence[0];
    if (!best) return [];
    return [
      {
        food,
        score: 0,
        reason: best.category,
        matchedVariant: best.value,
        evidence,
        ambiguity: 'none',
        aliasVersion: FOOD_ALIAS_VERSION,
      },
    ];
  });
  matches.sort(
    (a, b) =>
      EVIDENCE_ORDER.indexOf(a.reason as (typeof EVIDENCE_ORDER)[number]) -
        EVIDENCE_ORDER.indexOf(b.reason as (typeof EVIDENCE_ORDER)[number]) ||
      b.food.usageCount - a.food.usageCount ||
      compare(normalizeFoodIdentity(a.food.name), normalizeFoodIdentity(b.food.name)) ||
      compare(a.food.brand ?? '', b.food.brand ?? '') ||
      compare(a.food.id, b.food.id),
  );
  return matches.map((match, index) => ({
    ...match,
    // Legacy field is ordinal rank only, never confidence or an authorization threshold.
    score: 1 / (index + 1),
    ambiguity:
      matches.filter((other) => other.reason === match.reason).length > 1
        ? 'multiple_candidates'
        : 'none',
  }));
};

export const buildPromotionCandidates = (
  history: NutritionRecentMealItem[],
  foods: Food[],
): NutritionPromotionCandidate[] => {
  const groups = new Map<string, NutritionRecentMealItem[]>();
  for (const entry of history) {
    if (entry.item.foodId !== null) continue;
    const identity = normalizeFoodIdentity(entry.item.name);
    const group = groups.get(identity) ?? [];
    group.push(entry);
    groups.set(identity, group);
  }
  return [...groups.entries()]
    .flatMap<NutritionPromotionCandidate>(([normalizedName, entries]) => {
      const days = new Set(entries.map((entry) => entry.date));
      if (days.size < 2) return [];
      entries.sort(
        (a, b) =>
          compare(b.date, a.date) ||
          b.item.createdAt - a.item.createdAt ||
          compare(a.item.id, b.item.id),
      );
      const latest = entries[0];
      if (!latest) return [];
      const signature = ({ item }: NutritionRecentMealItem) =>
        JSON.stringify([
          item.amount,
          item.unit,
          item.displayQuantity,
          item.displayUnit,
          item.calories,
          item.protein,
          item.carbs,
          item.fat,
          item.fiber,
          item.sugar,
        ]);
      const complete = entries.every(
        ({ item }) =>
          [item.calories, item.protein, item.carbs, item.fat, item.amount].every(
            (n) => typeof n === 'number' && Number.isFinite(n),
          ) &&
          item.amount > 0 &&
          item.unit.trim().length > 0 &&
          (item.displayQuantity === null) === (item.displayUnit === null),
      );
      const stable = complete && entries.every((entry) => signature(entry) === signature(latest));
      const matches = rankFoodMatches(foods, latest.item.name);
      const adequate = exactReusableFood(foods, latest.item.name);
      const likelySavedFoodMatch =
        matches.find((match) => match.food.id === adequate?.id) ?? matches[0] ?? null;
      return [
        {
          normalizedName,
          displayName: latest.item.name,
          occurrenceCount: entries.length,
          distinctDayCount: days.size,
          mostRecentDate: latest.date,
          snapshots: entries,
          stability: stable ? 'stable_exact' : 'review_only',
          stabilityReason: !complete
            ? 'INCOMPLETE_SERVING_OR_MACROS'
            : stable
              ? 'IDENTICAL_SNAPSHOTS'
              : 'SNAPSHOT_DIFFERENCE',
          likelySavedFoodMatch,
          reason: adequate
            ? 'EXACT_SAVED_MATCH'
            : likelySavedFoodMatch
              ? 'POSSIBLE_SAVED_MATCH'
              : 'REPEATED_ADHOC',
        },
      ];
    })
    .sort(
      (a, b) =>
        compare(b.mostRecentDate, a.mostRecentDate) || compare(a.normalizedName, b.normalizedName),
    );
};
