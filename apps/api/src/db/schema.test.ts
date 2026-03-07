import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';

import { agentTokens, habitEntries, habits, users } from './schema/index.js';

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

describe('habits schema', () => {
  it('defines the expected table, columns, and tracking type constraint', () => {
    expect(getTableName(habits)).toBe('habits');

    const columns = getTableColumns(habits);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'name',
      'emoji',
      'trackingType',
      'target',
      'unit',
      'sortOrder',
      'active',
      'createdAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.sortOrder.default).toBe(0);
    expect(columns.active.default).toBe(true);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(habits);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.checks.map((constraint) => constraint.name)).toContain('habits_tracking_type_check');
  });
});

describe('habitEntries schema', () => {
  it('defines the expected table, foreign keys, unique constraint, and indexes', () => {
    expect(getTableName(habitEntries)).toBe('habit_entries');

    const columns = getTableColumns(habitEntries);
    expect(Object.keys(columns)).toEqual([
      'id',
      'habitId',
      'userId',
      'date',
      'completed',
      'value',
      'createdAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.completed.default).toBe(false);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(habitEntries);
    expect(config.foreignKeys).toHaveLength(2);
    expect(config.foreignKeys.map((fk) => getTableName(fk.reference().foreignTable)).sort()).toEqual([
      'habits',
      'users',
    ]);

    expect(config.uniqueConstraints).toHaveLength(1);
    expect(config.uniqueConstraints[0]?.getName()).toBe('habit_entries_habit_id_date_unique');
    expect(config.uniqueConstraints[0]?.columns.map((column) => column.name)).toEqual([
      'habit_id',
      'date',
    ]);

    expect(config.indexes.map((idx) => idx.config.name).sort()).toEqual([
      'habit_entries_date_idx',
      'habit_entries_user_id_idx',
    ]);
  });
});
