import type { db as database } from './index.js';
import { and, eq, inArray } from 'drizzle-orm';

import { nutritionLogs } from './schema/index.js';

export type NutritionMutationTransaction = Parameters<
  Parameters<(typeof database)['transaction']>[0]
>[0];

export const downgradeCompleteNutritionLogs = (
  tx: NutritionMutationTransaction,
  nutritionLogIds: readonly string[],
  statusUpdatedAt = Date.now(),
) => {
  const uniqueIds = [...new Set(nutritionLogIds)];
  if (uniqueIds.length === 0) {
    return 0;
  }

  const result = tx
    .update(nutritionLogs)
    .set({
      status: 'partial',
      statusUpdatedAt,
      updatedAt: statusUpdatedAt,
    })
    .where(and(inArray(nutritionLogs.id, uniqueIds), eq(nutritionLogs.status, 'complete')))
    .run();

  return result.changes;
};
