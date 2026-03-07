import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';

import type {
  HabitTrackingType,
  WorkoutExerciseCategory,
  WorkoutTemplateSectionType,
} from './schema/index.js';
import {
  agentTokens,
  exercises,
  habitEntries,
  habits,
  parseJsonStringArray,
  serializeJsonStringArray,
  templateExercises,
  users,
  workoutTemplates,
} from './schema/index.js';

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
    const trackingType: HabitTrackingType = 'boolean';

    expect(getTableName(habits)).toBe('habits');
    expect(trackingType).toBe('boolean');

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
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.sortOrder.default).toBe(0);
    expect(columns.active.default).toBe(true);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const config = getTableConfig(habits);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual(['habits_user_id_idx']);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'habits_tracking_type_check',
    ]);
  });
});

describe('exercises schema', () => {
  it('defines the expected table, optional user scope, and category constraint', () => {
    const category: WorkoutExerciseCategory = 'compound';

    expect(getTableName(exercises)).toBe('exercises');
    expect(category).toBe('compound');

    const columns = getTableColumns(exercises);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'name',
      'muscleGroups',
      'equipment',
      'category',
      'instructions',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.userId.notNull).toBe(false);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const config = getTableConfig(exercises);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual(['exercises_user_id_idx']);
    expect(config.checks.map((constraint) => constraint.name)).toEqual([
      'exercises_category_check',
    ]);
  });
});

describe('workoutTemplates schema', () => {
  it('defines the expected table, columns, timestamps, and user index', () => {
    expect(getTableName(workoutTemplates)).toBe('workout_templates');

    const columns = getTableColumns(workoutTemplates);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'name',
      'description',
      'tags',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const config = getTableConfig(workoutTemplates);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual([
      'workout_templates_user_id_idx',
    ]);
  });
});

describe('templateExercises schema', () => {
  it('defines the expected table, foreign keys, ordering, and section constraints', () => {
    const section: WorkoutTemplateSectionType = 'warmup';

    expect(getTableName(templateExercises)).toBe('template_exercises');
    expect(section).toBe('warmup');

    const columns = getTableColumns(templateExercises);
    expect(Object.keys(columns)).toEqual([
      'id',
      'templateId',
      'exerciseId',
      'orderIndex',
      'sets',
      'repsMin',
      'repsMax',
      'tempo',
      'restSeconds',
      'supersetGroup',
      'section',
      'notes',
      'cues',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(templateExercises);
    expect(config.foreignKeys).toHaveLength(2);
    expect(config.foreignKeys.map((fk) => getTableName(fk.reference().foreignTable)).sort()).toEqual([
      'exercises',
      'workout_templates',
    ]);
    expect(
      config.foreignKeys.find(
        (fk) => getTableName(fk.reference().foreignTable) === 'exercises',
      )?.onDelete,
    ).toBe('restrict');
    expect(config.indexes.map((idx) => idx.config.name).sort()).toEqual([
      'template_exercises_exercise_id_idx',
      'template_exercises_template_id_idx',
    ]);
    expect(config.uniqueConstraints).toHaveLength(1);
    expect(config.uniqueConstraints[0]?.getName()).toBe(
      'template_exercises_template_section_order_unique',
    );
    expect(config.uniqueConstraints[0]?.columns.map((column) => column.name)).toEqual([
      'template_id',
      'section',
      'order_index',
    ]);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'template_exercises_reps_range_check',
      'template_exercises_section_check',
    ]);
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
    expect(config.checks.map((constraint) => constraint.name)).toEqual([
      'habit_entries_date_format_check',
    ]);
  });
});

describe('JSON-backed string array helpers', () => {
  it('serializes and parses string arrays for SQLite text columns', () => {
    const serialized = serializeJsonStringArray(['legs', 'glutes']);

    expect(serialized).toBe('["legs","glutes"]');
    expect(parseJsonStringArray(serialized)).toEqual(['legs', 'glutes']);
    expect(parseJsonStringArray(null)).toEqual([]);
  });

  it('rejects invalid JSON payloads', () => {
    expect(() => parseJsonStringArray('{"group":"legs"}')).toThrow(TypeError);
    expect(() => parseJsonStringArray('[1,2,3]')).toThrow(TypeError);
  });
});
