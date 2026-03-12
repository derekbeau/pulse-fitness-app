import { and, eq, isNull } from 'drizzle-orm';

import { workoutTemplates } from '../../db/schema/index.js';

export const templateBelongsToUser = async (
  templateId: string,
  userId: string,
): Promise<boolean> => {
  // Shared by scheduled-workouts and workout-sessions routes to keep ownership checks consistent.
  const { db } = await import('../../db/index.js');

  const template = db
    .select({ id: workoutTemplates.id })
    .from(workoutTemplates)
    .where(
      and(
        eq(workoutTemplates.id, templateId),
        eq(workoutTemplates.userId, userId),
        isNull(workoutTemplates.deletedAt),
      ),
    )
    .limit(1)
    .get();

  return Boolean(template);
};
