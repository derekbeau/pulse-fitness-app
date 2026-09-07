import { foodSchema, type NutritionRecentMealItem } from '@pulse/shared';
import { describe, expect, it } from 'vitest';
import {
  FOOD_ALIASES,
  FOOD_ALIAS_VERSION,
  buildPromotionCandidates,
  exactReusableFood,
  normalizeFoodIdentity,
  rankFoodMatches,
} from './reuse-policy.js';

const food = (id: string, name: string, overrides = {}) =>
  foodSchema.parse({
    id,
    userId: 'owner',
    name,
    brand: null,
    servingSize: 'cup',
    servingGrams: null,
    calories: 100,
    protein: 5,
    carbs: 10,
    fat: 4,
    fiber: null,
    sugar: null,
    verified: false,
    source: null,
    notes: null,
    usageCount: 0,
    tags: [],
    lastUsedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });
const entry = (
  id: string,
  date: string,
  name = 'Hotel buffet',
  overrides = {},
): NutritionRecentMealItem => ({
  date,
  mealId: 'meal',
  mealName: 'Dinner',
  mealTime: null,
  item: {
    id,
    mealId: 'meal',
    foodId: null,
    name,
    amount: 1,
    unit: 'plate',
    displayQuantity: null,
    displayUnit: null,
    calories: 100,
    protein: 5,
    carbs: 10,
    fat: 4,
    fiber: null,
    sugar: null,
    createdAt: 1,
    ...overrides,
  },
});

describe('reviewed v1 food reuse policy', () => {
  it('locks the literal advisory alias set to its version', () => {
    expect(FOOD_ALIAS_VERSION).toBe('1');
    expect(FOOD_ALIASES).toEqual([
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
    ]);
  });
  it('normalizes case, punctuation, apostrophes and possessives without dropping Unicode identities', () => {
    expect(normalizeFoodIdentity(' Rao’s—Marinara! ')).toBe('raos marinara');
    expect(normalizeFoodIdentity("RAO'S marinara")).toBe('raos marinara');
    expect(normalizeFoodIdentity('Crème 豆腐')).toBe('crème 豆腐');
  });
  it.each([
    ["RAO'S—Marinara", 'exact_normalized'],
    ['Marinara Raos', 'token_order'],
    ['raos', 'partial_name'],
    ['Premium', 'brand_or_tag'],
    ['sauce', 'brand_or_tag'],
  ])('explains %s with %s', (q, reason) => {
    const match = rankFoodMatches(
      [food('sauce', 'Rao’s Marinara', { brand: 'Premium', tags: ['sauce'] })],
      q,
    )[0];
    if (!match) throw new Error('Expected a ranked match');
    expect(match.reason).toBe(reason);
    expect(match.evidence[0]).toMatchObject({ category: reason });
  });
  it('returns alias and recent-name evidence but neither permits binding', () => {
    const saved = food('s', 'Raspberry Preserves');
    expect(rankFoodMatches([saved], 'jam')[0]?.reason).toBe('alias_exact');
    expect(exactReusableFood([saved], 'jam')).toBeUndefined();
    expect(
      rankFoodMatches([saved], 'afternoon spread', [
        entry('old', '2026-08-20', 'afternoon spread', { foodId: 's' }),
      ])[0],
    ).toMatchObject({
      reason: 'recent_name',
      evidence: [{ category: 'recent_name', mealItemId: 'old' }],
    });
    expect(exactReusableFood([saved], 'afternoon spread')).toBeUndefined();
    expect(exactReusableFood([saved], 'preserves raspberry')).toBeUndefined();
  });
  it('marks ties before slicing and orders by usage, identity, brand then id', () => {
    const a = food('a', 'Milk', { brand: 'A' });
    const b = food('b', 'MILK', { brand: 'A' });
    const c = food('c', 'Milk', { usageCount: 1, brand: 'C' });
    expect(rankFoodMatches([b, c, a], 'milk').map((m) => [m.food.id, m.ambiguity])).toEqual([
      ['c', 'multiple_candidates'],
      ['a', 'multiple_candidates'],
      ['b', 'multiple_candidates'],
    ]);
    expect(rankFoodMatches([a, b, c], 'milk')).toEqual(rankFoodMatches([b, c, a], 'milk'));
    expect(exactReusableFood([a, b], 'milk', 'A')).toBeUndefined();
    expect(exactReusableFood([a], 'milk', 'B')).toBeUndefined();
    expect(exactReusableFood([a], ' MILK ', 'a')).toEqual(a);
  });
  it('does not invent candidates or confidence from weak substrings', () => {
    expect(rankFoodMatches([food('m', 'Almond milk')], 'ilk')).toEqual([]);
    expect(rankFoodMatches([food('m', 'Almond milk')], 'milk')[0]?.reason).toBe('partial_name');
    expect(exactReusableFood([food('m', 'Almond milk')], 'milk')).toBeUndefined();
  });
  it('requires two distinct dates and keeps all occurrences, including same-day duplicates', () => {
    expect(
      buildPromotionCandidates([entry('a', '2026-08-20'), entry('b', '2026-08-20')], []),
    ).toEqual([]);
    const result = buildPromotionCandidates(
      [entry('c', '2026-08-21'), entry('b', '2026-08-20'), entry('a', '2026-08-20')],
      [],
    );
    expect(result[0]).toMatchObject({
      occurrenceCount: 3,
      distinctDayCount: 2,
      stability: 'stable_exact',
      reason: 'REPEATED_ADHOC',
    });
    expect(result[0]?.snapshots.map((x) => x.item.id)).toEqual(['c', 'a', 'b']);
  });
  it.each([
    { calories: 101 },
    { amount: 2 },
    { unit: 'Plate' },
    { displayQuantity: 1 },
    { displayUnit: 'plate' },
    { fiber: 0 },
    { sugar: 1 },
  ])('retains review-only evidence for exact snapshot difference %j', (difference) => {
    const candidate = buildPromotionCandidates(
      [entry('a', '2026-08-20'), entry('b', '2026-08-21', 'Hotel buffet', difference)],
      [],
    )[0];
    if (!candidate) throw new Error('Expected recurrence evidence');
    expect(candidate.stability).toBe('review_only');
    expect(candidate.occurrenceCount).toBe(2);
    expect(candidate.snapshots).toHaveLength(2);
  });
  it.each(['Restaurant meal', 'Travel snack', 'Hotel buffet', 'Homemade composite stew'])(
    'leaves %s suitability to an explicit current-write decision',
    (name) => {
      const history = [entry('a', '2026-08-20', name), entry('b', '2026-08-21', name)];
      expect(buildPromotionCandidates(history, [])[0]).toMatchObject({
        stability: 'stable_exact',
        reason: 'REPEATED_ADHOC',
      });
      expect(buildPromotionCandidates(history, [food('f', name)])[0]?.reason).toBe(
        'EXACT_SAVED_MATCH',
      );
    },
  );
  it('keeps exact and possible saved matches advisory and never changes input history', () => {
    const history = [entry('a', '2026-08-20', 'Jam'), entry('b', '2026-08-21', 'Jam')];
    const before = JSON.stringify(history);
    expect(buildPromotionCandidates(history, [food('f', 'Preserves')])[0]?.reason).toBe(
      'POSSIBLE_SAVED_MATCH',
    );
    expect(JSON.stringify(history)).toBe(before);
  });
});
