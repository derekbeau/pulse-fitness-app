import { and, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { PatchDailyNutritionTargetInput, ResolvedDailyNutritionTarget } from '@pulse/shared';

import { dailyNutritionTargetOverrides } from '../../db/schema/index.js';
import * as schema from '../../db/schema/index.js';
import { getResolvedDailyNutritionTargetForDate } from './daily-energy-store.js';

const macroFields = ['calories', 'protein', 'carbs', 'fat'] as const;

type NutritionDatabase = BetterSQLite3Database<typeof schema>;

export const createDailyTargetOverrideStore = (dependencies: {
  db: NutritionDatabase;
  resolve: (userId: string, date: string) => Promise<ResolvedDailyNutritionTarget>;
}) => {
  const patch = async (
    userId: string,
    date: string,
    input: PatchDailyNutritionTargetInput,
  ): Promise<ResolvedDailyNutritionTarget> => {
    // Resolve first so unresolved server-owned date authority fails closed before any write.
    await dependencies.resolve(userId, date);

    dependencies.db.transaction(
      (tx) => {
        const existing = tx
          .select()
          .from(dailyNutritionTargetOverrides)
          .where(
            and(
              eq(dailyNutritionTargetOverrides.userId, userId),
              eq(dailyNutritionTargetOverrides.date, date),
            ),
          )
          .limit(1)
          .get();
        const values = Object.fromEntries(
          macroFields.map((field) => [
            field,
            Object.hasOwn(input, field) ? input[field] : (existing?.[field] ?? null),
          ]),
        ) as Record<(typeof macroFields)[number], number | null>;
        const hasOverride = macroFields.some((field) => values[field] !== null);

        if (!hasOverride) {
          if (existing) {
            tx.delete(dailyNutritionTargetOverrides)
              .where(
                and(
                  eq(dailyNutritionTargetOverrides.userId, userId),
                  eq(dailyNutritionTargetOverrides.date, date),
                ),
              )
              .run();
          }
          return;
        }

        const reason = Object.hasOwn(input, 'reason')
          ? (input.reason ?? null)
          : (existing?.reason ?? null);
        if (existing) {
          tx.update(dailyNutritionTargetOverrides)
            .set({
              ...values,
              reason,
              reasonCodeUnits: reason?.length ?? null,
              updatedAt: Date.now(),
            })
            .where(
              and(
                eq(dailyNutritionTargetOverrides.userId, userId),
                eq(dailyNutritionTargetOverrides.date, date),
              ),
            )
            .run();
        } else {
          tx.insert(dailyNutritionTargetOverrides)
            .values({ userId, date, ...values, reason, reasonCodeUnits: reason?.length ?? null })
            .run();
        }
      },
      { behavior: 'immediate' },
    );

    return dependencies.resolve(userId, date);
  };

  const remove = async (userId: string, date: string): Promise<ResolvedDailyNutritionTarget> => {
    await dependencies.resolve(userId, date);
    dependencies.db
      .delete(dailyNutritionTargetOverrides)
      .where(
        and(
          eq(dailyNutritionTargetOverrides.userId, userId),
          eq(dailyNutritionTargetOverrides.date, date),
        ),
      )
      .run();
    return dependencies.resolve(userId, date);
  };

  return { delete: remove, patch };
};

const getDefaultStore = async () => {
  const { db } = await import('../../db/index.js');
  return createDailyTargetOverrideStore({ db, resolve: getResolvedDailyNutritionTargetForDate });
};

export const patchDailyNutritionTargetForDate = async (
  userId: string,
  date: string,
  input: PatchDailyNutritionTargetInput,
) => (await getDefaultStore()).patch(userId, date, input);

export const deleteDailyNutritionTargetForDate = async (userId: string, date: string) =>
  (await getDefaultStore()).delete(userId, date);
