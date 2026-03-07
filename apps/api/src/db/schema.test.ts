import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';

import type {
  HabitTrackingType,
  WorkoutExerciseCategory,
  WorkoutSessionFeedback,
  WorkoutSessionStatus,
  WorkoutTemplateSectionType,
} from './schema/index.js';
import {
  agentTokens,
  exercises,
  foods,
  habitEntries,
  habits,
  mealItems,
  meals,
  nutritionLogs,
  parseJsonStringArray,
  parseWorkoutSessionFeedback,
  sessionSets,
  serializeJsonStringArray,
  serializeWorkoutSessionFeedback,
  workoutSessions,
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

describe('foods schema', () => {
  it('defines the expected table, recency index, defaults, and nutrition guards', () => {
    expect(getTableName(foods)).toBe('foods');

    const columns = getTableColumns(foods);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'name',
      'brand',
      'servingSize',
      'servingGrams',
      'calories',
      'protein',
      'carbs',
      'fat',
      'fiber',
      'sugar',
      'verified',
      'source',
      'notes',
      'lastUsedAt',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.verified.default).toBe(false);
    expect(columns.lastUsedAt.notNull).toBe(false);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const config = getTableConfig(foods);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual(['foods_user_last_used_at_idx']);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'foods_fiber_nonnegative_check',
      'foods_macros_nonnegative_check',
      'foods_serving_grams_check',
      'foods_sugar_nonnegative_check',
    ]);
  });
});

describe('nutritionLogs schema', () => {
  it('defines the expected table, unique per-user date constraint, and date validation', () => {
    expect(getTableName(nutritionLogs)).toBe('nutrition_logs');

    const columns = getTableColumns(nutritionLogs);
    expect(Object.keys(columns)).toEqual(['id', 'userId', 'date', 'notes', 'createdAt']);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(nutritionLogs);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.uniqueConstraints).toHaveLength(1);
    expect(config.uniqueConstraints[0]?.getName()).toBe('nutrition_logs_user_id_date_unique');
    expect(config.uniqueConstraints[0]?.columns.map((column) => column.name)).toEqual([
      'user_id',
      'date',
    ]);
    expect(config.checks.map((constraint) => constraint.name)).toEqual([
      'nutrition_logs_date_format_check',
    ]);
  });
});

describe('meals schema', () => {
  it('defines the expected table, timestamps, and nutrition log foreign key', () => {
    expect(getTableName(meals)).toBe('meals');

    const columns = getTableColumns(meals);
    expect(Object.keys(columns)).toEqual([
      'id',
      'nutritionLogId',
      'name',
      'time',
      'notes',
      'createdAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(meals);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('nutrition_logs');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual(['meals_nutrition_log_id_idx']);
  });
});

describe('mealItems schema', () => {
  it('defines the expected table, historical food linkage, and nonnegative nutrition checks', () => {
    expect(getTableName(mealItems)).toBe('meal_items');

    const columns = getTableColumns(mealItems);
    expect(Object.keys(columns)).toEqual([
      'id',
      'mealId',
      'foodId',
      'name',
      'amount',
      'unit',
      'calories',
      'protein',
      'carbs',
      'fat',
      'createdAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.foodId.notNull).toBe(false);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(mealItems);
    expect(config.foreignKeys).toHaveLength(2);
    expect(config.foreignKeys.map((fk) => getTableName(fk.reference().foreignTable)).sort()).toEqual([
      'foods',
      'meals',
    ]);
    expect(
      config.foreignKeys.find((fk) => getTableName(fk.reference().foreignTable) === 'foods')
        ?.onDelete,
    ).toBe('set null');
    expect(config.indexes.map((idx) => idx.config.name).sort()).toEqual([
      'meal_items_food_id_idx',
      'meal_items_meal_id_idx',
    ]);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'meal_items_amount_check',
      'meal_items_macros_nonnegative_check',
    ]);
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

describe('workoutSessions schema', () => {
  it('defines the expected table, nullable template link, indexes, and constraints', () => {
    const status: WorkoutSessionStatus = 'in-progress';

    expect(getTableName(workoutSessions)).toBe('workout_sessions');
    expect(status).toBe('in-progress');

    const columns = getTableColumns(workoutSessions);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'templateId',
      'name',
      'date',
      'status',
      'startedAt',
      'completedAt',
      'duration',
      'feedback',
      'notes',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.templateId.notNull).toBe(false);
    expect(columns.status.default).toBe('in-progress');
    expect(columns.duration.getSQLType()).toBe('integer');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const config = getTableConfig(workoutSessions);
    expect(config.foreignKeys).toHaveLength(2);
    expect(config.foreignKeys.map((fk) => getTableName(fk.reference().foreignTable)).sort()).toEqual([
      'users',
      'workout_templates',
    ]);
    expect(
      config.foreignKeys.find(
        (fk) => getTableName(fk.reference().foreignTable) === 'workout_templates',
      )?.onDelete,
    ).toBe('set null');
    expect(
      config.foreignKeys.find((fk) => getTableName(fk.reference().foreignTable) === 'users')
        ?.onDelete,
    ).toBe('cascade');
    expect(config.indexes.map((idx) => idx.config.name).sort()).toEqual([
      'workout_sessions_date_idx',
      'workout_sessions_user_id_idx',
    ]);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'workout_sessions_completed_at_check',
      'workout_sessions_date_format_check',
      'workout_sessions_status_check',
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

describe('sessionSets schema', () => {
  it('defines the expected table, defaults, ordering constraint, and session foreign key', () => {
    expect(getTableName(sessionSets)).toBe('session_sets');

    const columns = getTableColumns(sessionSets);
    expect(Object.keys(columns)).toEqual([
      'id',
      'sessionId',
      'exerciseId',
      'setNumber',
      'weight',
      'reps',
      'completed',
      'skipped',
      'section',
      'notes',
      'createdAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.completed.default).toBe(false);
    expect(columns.skipped.default).toBe(false);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(sessionSets);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('workout_sessions');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual([
      'session_sets_session_id_idx',
    ]);
    expect(config.uniqueConstraints).toHaveLength(1);
    expect(config.uniqueConstraints[0]?.getName()).toBe(
      'session_sets_session_exercise_set_number_unique',
    );
    expect(config.uniqueConstraints[0]?.columns.map((column) => column.name)).toEqual([
      'session_id',
      'exercise_id',
      'set_number',
    ]);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'session_sets_completion_state_check',
      'session_sets_section_check',
      'session_sets_set_number_check',
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

describe('workout session feedback helpers', () => {
  it('serializes and parses feedback objects for SQLite text columns', () => {
    const feedback: WorkoutSessionFeedback = {
      energy: 4,
      recovery: 3,
      technique: 5,
      notes: 'Moved well today.',
    };

    const serialized = serializeWorkoutSessionFeedback(feedback);

    expect(serialized).toBe(
      '{"energy":4,"recovery":3,"technique":5,"notes":"Moved well today."}',
    );
    expect(parseWorkoutSessionFeedback(serialized)).toEqual(feedback);
    expect(parseWorkoutSessionFeedback(null)).toBeNull();
    expect(serializeWorkoutSessionFeedback(null)).toBeNull();
  });

  it('rejects invalid feedback payloads', () => {
    expect(() => parseWorkoutSessionFeedback('{"energy":6,"recovery":3,"technique":4}')).toThrow(
      TypeError,
    );
    expect(
      () => parseWorkoutSessionFeedback('{"energy":4,"recovery":3,"technique":4,"notes":1}'),
    ).toThrow(TypeError);
    expect(
      () =>
        parseWorkoutSessionFeedback(
          '{"energy":4,"recovery":3,"technique":4,"notes":"ok","extra":true}',
        ),
    ).toThrow(TypeError);
  });
});
