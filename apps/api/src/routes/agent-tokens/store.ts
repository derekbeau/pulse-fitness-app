import { and, desc, eq } from 'drizzle-orm';

import { agentTokens } from '../../db/schema/index.js';

export type CreateAgentTokenRecordInput = {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  expiresAt?: number | null;
  lastRotatedAt: number;
};

export type AgentTokenListItem = {
  id: string;
  name: string;
  lastUsedAt: number | null;
  createdAt: number;
};

export const createAgentToken = async ({
  id,
  userId,
  name,
  tokenHash,
  expiresAt = null,
  lastRotatedAt,
}: CreateAgentTokenRecordInput): Promise<{ id: string; name: string }> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .insert(agentTokens)
    .values({
      id,
      userId,
      name,
      tokenHash,
      expiresAt,
      lastRotatedAt,
    })
    .run();

  if (result.changes !== 1) {
    throw new Error('Failed to persist agent token');
  }

  return {
    id,
    name,
  };
};

export const listAgentTokens = async (userId: string): Promise<AgentTokenListItem[]> => {
  const { db } = await import('../../db/index.js');

  return db
    .select({
      id: agentTokens.id,
      name: agentTokens.name,
      lastUsedAt: agentTokens.lastUsedAt,
      createdAt: agentTokens.createdAt,
    })
    .from(agentTokens)
    .where(eq(agentTokens.userId, userId))
    .orderBy(desc(agentTokens.createdAt))
    .all();
};

export const regenerateAgentToken = async (
  id: string,
  userId: string,
  newTokenHash: string,
): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .update(agentTokens)
    .set({ tokenHash: newTokenHash, lastUsedAt: null, lastRotatedAt: Date.now() })
    .where(and(eq(agentTokens.id, id), eq(agentTokens.userId, userId)))
    .run();

  return result.changes === 1;
};

export const deleteAgentToken = async (id: string, userId: string): Promise<boolean> => {
  const { db } = await import('../../db/index.js');

  const result = db
    .delete(agentTokens)
    .where(and(eq(agentTokens.id, id), eq(agentTokens.userId, userId)))
    .run();

  return result.changes === 1;
};
