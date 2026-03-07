import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';

import { agentTokens, users } from './schema/index.js';

describe('users schema', () => {
  it('defines the expected table and columns', () => {
    expect(getTableName(users)).toBe('users');

    const columns = getTableColumns(users);
    expect(Object.keys(columns)).toEqual([
      'id',
      'username',
      'name',
      'passwordHash',
      'preferences',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');
  });
});

describe('agentTokens schema', () => {
  it('defines the expected table and foreign key to users', () => {
    expect(getTableName(agentTokens)).toBe('agent_tokens');

    const columns = getTableColumns(agentTokens);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'name',
      'tokenHash',
      'lastUsedAt',
      'createdAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(agentTokens);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
  });
});
