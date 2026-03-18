import { beforeEach, describe, expect, it, vi } from 'vitest';

type SelectResultConfig = {
  all?: unknown[];
  get?: unknown;
};

const dbState = vi.hoisted(() => ({
  selectResults: [] as SelectResultConfig[],
  selectBuilders: [] as Array<{
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    offset: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  }>,
  insertValues: [] as unknown[],
  updateSets: [] as unknown[],
  updateWhereCalls: [] as unknown[],
  deleteWhereCalls: [] as unknown[],
  insertRunResult: { changes: 1 },
  updateRunResult: { changes: 1 },
  deleteRunResult: { changes: 1 },
  transaction: vi.fn(),
  reset() {
    this.selectResults = [];
    this.selectBuilders = [];
    this.insertValues = [];
    this.updateSets = [];
    this.updateWhereCalls = [];
    this.deleteWhereCalls = [];
    this.insertRunResult = { changes: 1 };
    this.updateRunResult = { changes: 1 };
    this.deleteRunResult = { changes: 1 };
    this.transaction.mockClear();
  },
}));

const flattenSql = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  if ('name' in value && typeof value.name === 'string') {
    return value.name;
  }

  if ('value' in value) {
    if (Array.isArray(value.value)) {
      return value.value.map(flattenSql).join('');
    }

    if (
      typeof value.value === 'string' ||
      typeof value.value === 'number' ||
      typeof value.value === 'boolean'
    ) {
      return String(value.value);
    }
  }

  if ('queryChunks' in value && Array.isArray(value.queryChunks)) {
    return value.queryChunks.map(flattenSql).join('');
  }

  return '';
};

const createSelectBuilder = (result: SelectResultConfig) => {
  const builder = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    all: vi.fn(() => result.all ?? []),
    get: vi.fn(() => result.get),
  };

  builder.from.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.offset.mockReturnValue(builder);

  dbState.selectBuilders.push(builder);

  return builder;
};

const buildStoredFood = (
  overrides: Partial<{
    id: string;
    userId: string;
    name: string;
    usageCount: number;
    lastUsedAt: number | null;
    deletedAt: string | null;
  }> = {},
) => ({
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'user-1',
  name: 'Greek Yogurt',
  brand: null,
  servingSize: '170 g',
  servingGrams: 170,
  calories: 90,
  protein: 18,
  carbs: 5,
  fat: 0,
  fiber: null,
  sugar: 5,
  verified: true,
  source: null,
  notes: null,
  usageCount: 4,
  tags: [],
  lastUsedAt: 1_700_000_000_000,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_001,
  ...overrides,
});

vi.mock('../../db/index.js', () => ({
  db: (() => {
    const db = {
      transaction: dbState.transaction,
      select: vi.fn(() => createSelectBuilder(dbState.selectResults.shift() ?? {})),
      insert: vi.fn(() => ({
        values: vi.fn((values: unknown) => {
          dbState.insertValues.push(values);

          return {
            run: vi.fn(() => dbState.insertRunResult),
          };
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: unknown) => {
          dbState.updateSets.push(values);

          return {
            where: vi.fn((whereClause: unknown) => {
              dbState.updateWhereCalls.push(whereClause);

              return {
                run: vi.fn(() => dbState.updateRunResult),
              };
            }),
          };
        }),
      })),
      delete: vi.fn(() => ({
        where: vi.fn((whereClause: unknown) => {
          dbState.deleteWhereCalls.push(whereClause);

          return {
            run: vi.fn(() => dbState.deleteRunResult),
          };
        }),
      })),
    };

    dbState.transaction.mockImplementation((callback: (tx: typeof db) => unknown) => callback(db));

    return db;
  })(),
}));

describe('foods store', () => {
  beforeEach(() => {
    dbState.reset();
  });

  it('creates a food and normalizes omitted optional fields to null', async () => {
    dbState.selectResults.push({
      get: {
        id: 'food-1',
        userId: 'user-1',
        name: 'Greek Yogurt',
        brand: null,
        servingSize: null,
        servingGrams: null,
        calories: 90,
        protein: 18,
        carbs: 5,
        fat: 0,
        fiber: null,
        sugar: null,
        verified: true,
        source: null,
        notes: null,
        usageCount: 0,
        tags: [],
        lastUsedAt: null,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_001,
      },
    });

    const { createFood } = await import('./store.js');

    const created = await createFood({
      id: 'food-1',
      userId: 'user-1',
      name: 'Greek Yogurt',
      calories: 90,
      protein: 18,
      carbs: 5,
      fat: 0,
      verified: true,
      tags: [],
    });

    expect(created).toMatchObject({
      id: 'food-1',
      brand: null,
      servingSize: null,
      servingGrams: null,
      fiber: null,
      sugar: null,
      source: null,
      notes: null,
    });
    expect(dbState.insertValues).toEqual([
      {
        id: 'food-1',
        userId: 'user-1',
        name: 'Greek Yogurt',
        brand: null,
        servingSize: null,
        servingGrams: null,
        calories: 90,
        protein: 18,
        carbs: 5,
        fat: 0,
        fiber: null,
        sugar: null,
        verified: true,
        source: null,
        notes: null,
        tags: [],
      },
    ]);
  });

  it('returns paginated foods with search and tag filters and performs separate row and total queries', async () => {
    dbState.selectResults.push(
      {
        all: [
          {
            id: 'food-2',
            userId: 'user-1',
            name: 'Protein Cereal',
            brand: 'Ghost',
            servingSize: '1 cup',
            servingGrams: null,
            calories: 180,
            protein: 20,
            carbs: 15,
            fat: 3,
            fiber: null,
            sugar: null,
            verified: false,
            source: null,
            notes: null,
            usageCount: 3,
            tags: ['breakfast'],
            lastUsedAt: null,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      },
      {
        get: {
          total: 3,
        },
      },
    );

    const { listFoods } = await import('./store.js');

    const result = await listFoods('user-1', {
      q: '50%_off',
      tags: ['protein', 'dairy'],
      sort: 'popular',
      page: 2,
      limit: 1,
    });

    expect(result).toEqual({
      foods: [
        expect.objectContaining({
          id: 'food-2',
          name: 'Protein Cereal',
        }),
      ],
      total: 3,
    });
    expect(dbState.selectBuilders).toHaveLength(2);
    expect(dbState.selectBuilders[0].where).toHaveBeenCalledOnce();
    expect(dbState.selectBuilders[0].orderBy).toHaveBeenCalledOnce();
    expect(dbState.selectBuilders[0].limit).toHaveBeenCalledWith(1);
    expect(dbState.selectBuilders[0].offset).toHaveBeenCalledWith(1);
    expect(dbState.selectBuilders[1].get).toHaveBeenCalledOnce();

    const whereClauseText = flattenSql(dbState.selectBuilders[0].where.mock.calls[0]?.[0]);
    expect(whereClauseText).toContain('%50\\%\\_off%');
    expect(whereClauseText.toLowerCase()).toContain("escape '\\'");
    expect(whereClauseText.toLowerCase()).toContain('json_each');
    expect(whereClauseText.toLowerCase()).toContain('protein');
    expect(whereClauseText.toLowerCase()).toContain('dairy');
  });

  it('supports recent sorting without pagination errors when the query is absent', async () => {
    dbState.selectResults.push(
      {
        all: [
          {
            id: 'food-new',
            userId: 'user-1',
            name: 'New Food',
            brand: null,
            servingSize: null,
            servingGrams: null,
            calories: 100,
            protein: 10,
            carbs: 10,
            fat: 2,
            fiber: null,
            sugar: null,
            verified: false,
            source: null,
            notes: null,
            usageCount: 2,
            tags: [],
            lastUsedAt: 200,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      },
      {
        get: {
          total: 1,
        },
      },
    );

    const { listFoods } = await import('./store.js');

    const result = await listFoods('user-1', {
      sort: 'recent',
      page: 1,
      limit: 10,
    });

    expect(result.foods[0]).toMatchObject({
      id: 'food-new',
      lastUsedAt: 200,
    });
    expect(dbState.selectBuilders[0].where).toHaveBeenCalledOnce();
    expect(dbState.selectBuilders[0].orderBy).toHaveBeenCalledOnce();
    expect(dbState.selectBuilders[0].limit).toHaveBeenCalledWith(10);
    expect(dbState.selectBuilders[0].offset).toHaveBeenCalledWith(0);
  });

  it('updates foods within scope and returns undefined when no row changed', async () => {
    dbState.selectResults.push({
      get: {
        id: 'food-1',
        userId: 'user-1',
        name: 'Chicken Breast',
        brand: null,
        servingSize: '4 oz',
        servingGrams: 112,
        calories: 187,
        protein: 35,
        carbs: 0,
        fat: 4,
        fiber: null,
        sugar: null,
        verified: true,
        source: 'USDA',
        notes: 'Updated note',
        usageCount: 5,
        tags: ['lean'],
        lastUsedAt: null,
        createdAt: 1,
        updatedAt: 2,
      },
    });

    const { updateFood } = await import('./store.js');

    const updated = await updateFood('food-1', 'user-1', {
      brand: null,
      notes: 'Updated note',
      verified: true,
    });

    expect(updated).toMatchObject({
      id: 'food-1',
      brand: null,
      notes: 'Updated note',
      verified: true,
    });
    expect(dbState.updateSets).toHaveLength(1);
    expect(dbState.updateSets[0]).toMatchObject({
      brand: null,
      notes: 'Updated note',
      verified: true,
    });
    expect(dbState.updateSets[0]).not.toHaveProperty('tags');
    expect(dbState.updateSets[0]).toHaveProperty('updatedAt');

    dbState.updateRunResult = { changes: 0 };

    await expect(
      updateFood('food-1', 'user-2', {
        name: 'Unauthorized rename',
      }),
    ).resolves.toBeUndefined();
  });

  it('soft-deletes foods by scope and updates usage counters safely', async () => {
    const { decrementFoodUsage, deleteFood, trackFoodUsage } = await import('./store.js');

    await expect(deleteFood('food-1', 'user-1')).resolves.toBe(true);
    expect(dbState.updateSets[0]).toEqual({
      deletedAt: expect.any(String),
    });

    dbState.updateRunResult = { changes: 0 };
    await expect(deleteFood('food-1', 'user-2')).resolves.toBe(false);
    dbState.updateRunResult = { changes: 1 };

    await trackFoodUsage('food-1', 'user-1', 1_700_000_300_000);

    expect(dbState.updateSets.at(-1)).toMatchObject({
      lastUsedAt: 1_700_000_300_000,
    });
    expect(dbState.updateSets.at(-1)).toHaveProperty('usageCount');
    const updateWhereText = flattenSql(dbState.updateWhereCalls.at(-1));
    expect(updateWhereText).toContain('id = food-1');
    expect(updateWhereText).toContain('user_id = user-1');

    await decrementFoodUsage('food-1', 'user-1');

    expect(dbState.updateSets.at(-1)).toEqual({
      usageCount: expect.anything(),
    });
    expect(dbState.updateSets.at(-1)).not.toHaveProperty('lastUsedAt');
    expect(flattenSql((dbState.updateSets.at(-1) as { usageCount: unknown }).usageCount)).toContain(
      'case when usage_count > 0 then usage_count - 1 else 0 end',
    );
  });

  it('merges foods transactionally by relinking meal items, combining usage stats, and soft-deleting the loser', async () => {
    const winnerId = '11111111-1111-4111-8111-111111111111';
    const loserId = '22222222-2222-4222-8222-222222222222';
    dbState.selectResults.push(
      {
        get: buildStoredFood({
          id: winnerId,
          usageCount: 4,
          lastUsedAt: 1_700_000_100_000,
        }),
      },
      {
        get: buildStoredFood({
          id: loserId,
          name: 'Skyr',
          usageCount: 7,
          lastUsedAt: 1_700_000_400_000,
        }),
      },
      {
        get: buildStoredFood({
          id: winnerId,
          usageCount: 11,
          lastUsedAt: 1_700_000_400_000,
        }),
      },
    );

    const { mergeFoods } = await import('./store.js');
    const mergedWinner = await mergeFoods('user-1', winnerId, loserId);

    expect(dbState.transaction).toHaveBeenCalledOnce();
    expect(mergedWinner).toEqual(
      expect.objectContaining({
        id: winnerId,
        usageCount: 11,
        lastUsedAt: 1_700_000_400_000,
      }),
    );
    expect(dbState.updateSets).toHaveLength(3);
    expect(dbState.updateSets[0]).toEqual({
      foodId: winnerId,
    });
    expect(dbState.updateSets[1]).toMatchObject({
      usageCount: 11,
      lastUsedAt: 1_700_000_400_000,
      updatedAt: expect.any(Number),
    });
    expect(dbState.updateSets[2]).toMatchObject({
      deletedAt: expect.any(String),
      updatedAt: expect.any(Number),
    });

    const relinkWhereText = flattenSql(dbState.updateWhereCalls[0]);
    expect(relinkWhereText).toContain(`food_id = ${loserId}`);
    const winnerWhereText = flattenSql(dbState.updateWhereCalls[1]);
    expect(winnerWhereText).toContain(`id = ${winnerId}`);
    expect(winnerWhereText).toContain('user_id = user-1');
    const loserWhereText = flattenSql(dbState.updateWhereCalls[2]);
    expect(loserWhereText).toContain(`id = ${loserId}`);
    expect(loserWhereText).toContain('user_id = user-1');
  });

  it('uses the max available lastUsedAt when merging nullable timestamps', async () => {
    const winnerId = '11111111-1111-4111-8111-111111111111';
    const loserId = '22222222-2222-4222-8222-222222222222';
    dbState.selectResults.push(
      {
        get: buildStoredFood({
          id: winnerId,
          usageCount: 2,
          lastUsedAt: null,
        }),
      },
      {
        get: buildStoredFood({
          id: loserId,
          usageCount: 3,
          lastUsedAt: 1_700_000_500_000,
        }),
      },
      {
        get: buildStoredFood({
          id: winnerId,
          usageCount: 5,
          lastUsedAt: 1_700_000_500_000,
        }),
      },
    );

    const { mergeFoods } = await import('./store.js');
    await mergeFoods('user-1', winnerId, loserId);

    expect(dbState.updateSets[1]).toMatchObject({
      lastUsedAt: 1_700_000_500_000,
    });
  });

  it('rejects invalid merge combinations and missing scoped foods', async () => {
    const winnerId = '11111111-1111-4111-8111-111111111111';
    const loserId = '22222222-2222-4222-8222-222222222222';
    const { FoodMergeSameIdError, mergeFoods } = await import('./store.js');

    await expect(mergeFoods('user-1', winnerId, winnerId)).rejects.toBeInstanceOf(
      FoodMergeSameIdError,
    );
    expect(dbState.transaction).not.toHaveBeenCalled();

    dbState.selectResults.push({
      get: undefined,
    });
    await expect(mergeFoods('user-1', winnerId, loserId)).rejects.toMatchObject({
      foodRole: 'winner',
    });

    dbState.selectResults.push(
      {
        get: buildStoredFood({
          id: winnerId,
        }),
      },
      {
        get: undefined,
      },
    );
    await expect(mergeFoods('user-1', winnerId, loserId)).rejects.toMatchObject({
      foodRole: 'loser',
    });
  });
});
