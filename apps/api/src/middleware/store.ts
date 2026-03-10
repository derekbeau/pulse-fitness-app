import { eq } from 'drizzle-orm';

import { agentTokens, users } from '../db/schema/index.js';

export type AgentTokenAuthRecord = {
  id: string;
  userId: string;
};

export const findUserAuthById = async (
  userId: string,
): Promise<{ id: string } | undefined> => {
  const { db } = await import('../db/index.js');

  return db
    .select({
      id: users.id,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .get();
};

export const findAgentTokenByHash = async (
  tokenHash: string,
): Promise<AgentTokenAuthRecord | undefined> => {
  const { db } = await import('../db/index.js');

  return db
    .select({
      id: agentTokens.id,
      userId: agentTokens.userId,
    })
    .from(agentTokens)
    .where(eq(agentTokens.tokenHash, tokenHash))
    .limit(1)
    .get();
};

export const updateAgentTokenLastUsedAt = async (
  id: string,
  lastUsedAt = Date.now(),
): Promise<void> => {
  const { db } = await import('../db/index.js');

  const result = db
    .update(agentTokens)
    .set({
      lastUsedAt,
    })
    .where(eq(agentTokens.id, id))
    .run();

  if (result.changes !== 1) {
    throw new Error('Failed to update agent token last used timestamp');
  }
};
