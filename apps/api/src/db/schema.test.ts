import { getTableColumns, getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';

import type {
  ActivityType,
  ConditionProtocolStatus,
  ConditionTimelineEventType,
  EntityLinkSourceType,
  EntityLinkTargetType,
  EquipmentItemCategory,
  HealthConditionStatus,
  HabitTrackingType,
  JournalEntryCreatedBy,
  JournalEntryType,
  ResourceType,
  WorkoutExerciseCategory,
  WorkoutSessionFeedback,
  WorkoutSessionStatus,
  WorkoutTemplateSectionType,
} from './schema/index.js';
import {
  activities,
  agentTokens,
  bodyWeight,
  conditionProtocols,
  conditionSeverityPoints,
  conditionTimelineEvents,
  dashboardConfig,
  entityLinks,
  equipmentItems,
  equipmentLocations,
  exercises,
  foods,
  healthConditions,
  habitEntries,
  habits,
  journalEntries,
  mealItems,
  meals,
  nutritionTargets,
  nutritionLogs,
  parseJsonStringArray,
  parseWorkoutSessionFeedback,
  resources,
  scheduledWorkouts,
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
      'weightUnit',
      'preferences',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.weightUnit.default).toBe('lbs');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');
  });
});

describe('agentTokens schema', () => {
  it('defines the expected table, unique token hash, and foreign key to users', () => {
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
    expect(columns.tokenHash.isUnique).toBe(true);
    expect(columns.tokenHash.uniqueName).toBe('agent_tokens_token_hash_unique');
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

describe('bodyWeight schema', () => {
  it('defines the expected table, unique per-user date constraint, and validation checks', () => {
    expect(getTableName(bodyWeight)).toBe('body_weight');

    const columns = getTableColumns(bodyWeight);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'date',
      'weight',
      'notes',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const config = getTableConfig(bodyWeight);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.uniqueConstraints).toHaveLength(1);
    expect(config.uniqueConstraints[0]?.getName()).toBe('body_weight_user_id_date_unique');
    expect(config.uniqueConstraints[0]?.columns.map((column) => column.name)).toEqual([
      'user_id',
      'date',
    ]);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'body_weight_date_format_check',
      'body_weight_weight_check',
    ]);
  });
});

describe('activities schema', () => {
  it('defines the expected table, per-user date index, and activity guardrails', () => {
    const type: ActivityType = 'walking';

    expect(getTableName(activities)).toBe('activities');
    expect(type).toBe('walking');

    const columns = getTableColumns(activities);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'date',
      'type',
      'name',
      'durationMinutes',
      'notes',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.notes.notNull).toBe(false);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const config = getTableConfig(activities);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual(['activities_user_date_idx']);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'activities_date_format_check',
      'activities_duration_minutes_check',
      'activities_type_check',
    ]);
  });
});

describe('resources schema', () => {
  it('defines the expected table, user index, JSON columns, and type guardrails', () => {
    const type: ResourceType = 'program';

    expect(getTableName(resources)).toBe('resources');
    expect(type).toBe('program');

    const columns = getTableColumns(resources);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'title',
      'type',
      'author',
      'description',
      'tags',
      'principles',
      'createdAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.tags.default).toEqual([]);
    expect(columns.principles.default).toEqual([]);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(resources);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual(['resources_user_id_idx']);
    expect(config.checks.map((constraint) => constraint.name)).toEqual(['resources_type_check']);
  });
});

describe('equipmentLocations schema', () => {
  it('defines the expected table, user foreign key, and lookup index', () => {
    expect(getTableName(equipmentLocations)).toBe('equipment_locations');

    const columns = getTableColumns(equipmentLocations);
    expect(Object.keys(columns)).toEqual(['id', 'userId', 'name', 'notes', 'createdAt']);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.notes.notNull).toBe(false);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(equipmentLocations);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual([
      'equipment_locations_user_id_idx',
    ]);
  });
});

describe('equipmentItems schema', () => {
  it('defines the expected table, location foreign key, and category guardrails', () => {
    const category: EquipmentItemCategory = 'free-weights';

    expect(getTableName(equipmentItems)).toBe('equipment_items');
    expect(category).toBe('free-weights');

    const columns = getTableColumns(equipmentItems);
    expect(Object.keys(columns)).toEqual([
      'id',
      'locationId',
      'name',
      'category',
      'details',
      'createdAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.details.notNull).toBe(false);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(equipmentItems);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe(
      'equipment_locations',
    );
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual([
      'equipment_items_location_id_idx',
    ]);
    expect(config.checks.map((constraint) => constraint.name)).toEqual([
      'equipment_items_category_check',
    ]);
  });
});

describe('entityLinks schema', () => {
  it('defines the expected table, user scope, and polymorphic type guardrails', () => {
    const sourceType: EntityLinkSourceType = 'resource';
    const targetType: EntityLinkTargetType = 'exercise';

    expect(getTableName(entityLinks)).toBe('entity_links');
    expect(sourceType).toBe('resource');
    expect(targetType).toBe('exercise');

    const columns = getTableColumns(entityLinks);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'sourceType',
      'sourceId',
      'targetType',
      'targetId',
      'targetName',
      'createdAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(entityLinks);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.indexes.map((idx) => idx.config.name).sort()).toEqual([
      'entity_links_user_source_type_source_id_idx',
      'entity_links_user_target_type_target_id_idx',
    ]);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'entity_links_source_type_check',
      'entity_links_target_type_check',
    ]);
  });
});

describe('journalEntries schema', () => {
  it('defines the expected table, per-user date index, and journal guardrails', () => {
    const type: JournalEntryType = 'post-workout';
    const createdBy: JournalEntryCreatedBy = 'agent';

    expect(getTableName(journalEntries)).toBe('journal_entries');
    expect(type).toBe('post-workout');
    expect(createdBy).toBe('agent');

    const columns = getTableColumns(journalEntries);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'date',
      'title',
      'type',
      'content',
      'createdBy',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const config = getTableConfig(journalEntries);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual(['journal_entries_user_date_idx']);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'journal_entries_created_by_check',
      'journal_entries_date_format_check',
      'journal_entries_type_check',
    ]);
  });
});

describe('healthConditions schema', () => {
  it('defines the expected table, user index, and status/date guardrails', () => {
    expect(getTableName(healthConditions)).toBe('health_conditions');

    const columns = getTableColumns(healthConditions);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'name',
      'bodyArea',
      'status',
      'onsetDate',
      'description',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const allowedStatuses: HealthConditionStatus[] = ['active', 'monitoring', 'resolved'];
    expect(allowedStatuses).toEqual(['active', 'monitoring', 'resolved']);

    const config = getTableConfig(healthConditions);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual(['health_conditions_user_id_idx']);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'health_conditions_onset_date_format_check',
      'health_conditions_status_check',
    ]);
  });
});

describe('conditionTimelineEvents schema', () => {
  it('defines the expected table, condition/date index, and timeline type rules', () => {
    expect(getTableName(conditionTimelineEvents)).toBe('condition_timeline_events');

    const columns = getTableColumns(conditionTimelineEvents);
    expect(Object.keys(columns)).toEqual([
      'id',
      'conditionId',
      'date',
      'event',
      'type',
      'notes',
      'createdAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const allowedTypes: ConditionTimelineEventType[] = [
      'onset',
      'flare',
      'improvement',
      'treatment',
      'milestone',
    ];
    expect(allowedTypes).toEqual(['onset', 'flare', 'improvement', 'treatment', 'milestone']);

    const config = getTableConfig(conditionTimelineEvents);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('health_conditions');
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual([
      'condition_timeline_events_condition_date_idx',
    ]);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'condition_timeline_events_date_format_check',
      'condition_timeline_events_type_check',
    ]);
  });
});

describe('conditionProtocols schema', () => {
  it('defines the expected table, audit/index metadata, and protocol status/date rules', () => {
    expect(getTableName(conditionProtocols)).toBe('condition_protocols');

    const columns = getTableColumns(conditionProtocols);
    expect(Object.keys(columns)).toEqual([
      'id',
      'conditionId',
      'name',
      'status',
      'startDate',
      'endDate',
      'notes',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.endDate.notNull).toBe(false);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const allowedStatuses: ConditionProtocolStatus[] = ['active', 'discontinued', 'completed'];
    expect(allowedStatuses).toEqual(['active', 'discontinued', 'completed']);

    const config = getTableConfig(conditionProtocols);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('health_conditions');
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual([
      'condition_protocols_condition_id_idx',
    ]);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'condition_protocols_end_date_format_check',
      'condition_protocols_end_date_order_check',
      'condition_protocols_start_date_format_check',
      'condition_protocols_status_check',
    ]);
  });
});

describe('conditionSeverityPoints schema', () => {
  it('defines the expected table, condition/date index, and severity range guards', () => {
    expect(getTableName(conditionSeverityPoints)).toBe('condition_severity_points');

    const columns = getTableColumns(conditionSeverityPoints);
    expect(Object.keys(columns)).toEqual(['id', 'conditionId', 'date', 'value', 'createdAt']);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(conditionSeverityPoints);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('health_conditions');
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual([
      'condition_severity_points_condition_date_idx',
    ]);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'condition_severity_points_date_format_check',
      'condition_severity_points_value_check',
    ]);
  });
});

describe('nutritionTargets schema', () => {
  it('defines the expected table, lookup index, and effective-date guardrails', () => {
    expect(getTableName(nutritionTargets)).toBe('nutrition_targets');

    const columns = getTableColumns(nutritionTargets);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'calories',
      'protein',
      'carbs',
      'fat',
      'effectiveDate',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const config = getTableConfig(nutritionTargets);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.indexes).toHaveLength(0);
    expect(config.uniqueConstraints).toHaveLength(1);
    expect(config.uniqueConstraints[0]?.getName()).toBe(
      'nutrition_targets_user_id_effective_date_unique',
    );
    expect(config.uniqueConstraints[0]?.columns.map((column) => column.name)).toEqual([
      'user_id',
      'effective_date',
    ]);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'nutrition_targets_effective_date_format_check',
      'nutrition_targets_macros_nonnegative_check',
    ]);
  });
});

describe('nutritionLogs schema', () => {
  it('defines the expected table, unique per-user date constraint, and date validation', () => {
    expect(getTableName(nutritionLogs)).toBe('nutrition_logs');

    const columns = getTableColumns(nutritionLogs);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'date',
      'notes',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

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
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const config = getTableConfig(meals);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('nutrition_logs');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual(['meals_nutrition_log_id_idx']);
    expect(config.checks.map((constraint) => constraint.name)).toEqual(['meals_time_format_check']);
  });
});

describe('dashboardConfig schema', () => {
  it('defines the expected singleton-per-user config row with JSON text defaults', () => {
    expect(getTableName(dashboardConfig)).toBe('dashboard_config');

    const columns = getTableColumns(dashboardConfig);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'habitChainIds',
      'trendMetrics',
      'visibleWidgets',
      'widgetOrder',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.habitChainIds.default).toEqual([]);
    expect(columns.trendMetrics.default).toEqual([]);
    expect(columns.visibleWidgets.notNull).toBe(false);
    expect(columns.widgetOrder.notNull).toBe(false);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const config = getTableConfig(dashboardConfig);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.uniqueConstraints).toHaveLength(1);
    expect(config.uniqueConstraints[0]?.getName()).toBe('dashboard_config_user_id_unique');
    expect(config.uniqueConstraints[0]?.columns.map((column) => column.name)).toEqual(['user_id']);
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
      'fiber',
      'sugar',
      'createdAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.foodId.notNull).toBe(false);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');

    const config = getTableConfig(mealItems);
    expect(config.foreignKeys).toHaveLength(2);
    expect(
      config.foreignKeys.map((fk) => getTableName(fk.reference().foreignTable)).sort(),
    ).toEqual(['foods', 'meals']);
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
      'meal_items_fiber_nonnegative_check',
      'meal_items_macros_nonnegative_check',
      'meal_items_sugar_nonnegative_check',
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
      'frequency',
      'frequencyTarget',
      'scheduledDays',
      'pausedUntil',
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
      'habits_frequency_check',
      'habits_tracking_type_check',
    ]);
  });
});

describe('exercises schema', () => {
  it('defines the expected table, optional user scope, and tracking constraints', () => {
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
      'trackingType',
      'instructions',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.userId.notNull).toBe(false);
    expect(columns.trackingType.default).toBe('weight_reps');
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const config = getTableConfig(exercises);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableName(config.foreignKeys[0].reference().foreignTable)).toBe('users');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual(['exercises_user_id_idx']);
    expect(config.checks.map((constraint) => constraint.name).sort()).toEqual([
      'exercises_category_check',
      'exercises_tracking_type_check',
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
    expect(config.indexes.map((idx) => idx.config.name)).toEqual(['workout_templates_user_id_idx']);
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
    expect(
      config.foreignKeys.map((fk) => getTableName(fk.reference().foreignTable)).sort(),
    ).toEqual(['exercises', 'workout_templates']);
    expect(
      config.foreignKeys.find((fk) => getTableName(fk.reference().foreignTable) === 'exercises')
        ?.onDelete,
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
    expect(
      config.foreignKeys.map((fk) => getTableName(fk.reference().foreignTable)).sort(),
    ).toEqual(['users', 'workout_templates']);
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
    expect(
      config.foreignKeys.map((fk) => getTableName(fk.reference().foreignTable)).sort(),
    ).toEqual(['habits', 'users']);

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
  it('defines the expected table, defaults, ordering constraint, and required foreign keys', () => {
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
    expect(config.foreignKeys).toHaveLength(2);
    expect(
      config.foreignKeys.map((fk) => getTableName(fk.reference().foreignTable)).sort(),
    ).toEqual(['exercises', 'workout_sessions']);
    expect(
      config.foreignKeys.find((fk) => getTableName(fk.reference().foreignTable) === 'exercises')
        ?.onDelete,
    ).toBe('restrict');
    expect(config.indexes.map((idx) => idx.config.name)).toEqual(['session_sets_session_id_idx']);
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

describe('scheduledWorkouts schema', () => {
  it('defines the expected table, foreign keys, and upcoming-workout indexes', () => {
    expect(getTableName(scheduledWorkouts)).toBe('scheduled_workouts');

    const columns = getTableColumns(scheduledWorkouts);
    expect(Object.keys(columns)).toEqual([
      'id',
      'userId',
      'templateId',
      'date',
      'sessionId',
      'createdAt',
      'updatedAt',
    ]);

    expect(columns.id.defaultFn).toBeTypeOf('function');
    expect(columns.templateId.notNull).toBe(false);
    expect(columns.sessionId.notNull).toBe(false);
    expect(columns.createdAt.default).toBeDefined();
    expect(columns.createdAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.default).toBeDefined();
    expect(columns.updatedAt.defaultFn).toBeTypeOf('function');
    expect(columns.updatedAt.onUpdateFn).toBeTypeOf('function');

    const config = getTableConfig(scheduledWorkouts);
    expect(config.foreignKeys).toHaveLength(3);
    expect(
      config.foreignKeys.map((fk) => getTableName(fk.reference().foreignTable)).sort(),
    ).toEqual(['users', 'workout_sessions', 'workout_templates']);
    expect(
      config.foreignKeys.find(
        (fk) => getTableName(fk.reference().foreignTable) === 'workout_sessions',
      )?.onDelete,
    ).toBe('set null');
    expect(
      config.foreignKeys.find(
        (fk) => getTableName(fk.reference().foreignTable) === 'workout_templates',
      )?.onDelete,
    ).toBe('set null');
    expect(config.indexes.map((idx) => idx.config.name).sort()).toEqual([
      'scheduled_workouts_session_id_idx',
      'scheduled_workouts_template_id_idx',
      'scheduled_workouts_user_date_idx',
    ]);
    expect(config.checks.map((constraint) => constraint.name)).toEqual([
      'scheduled_workouts_date_format_check',
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
    expect(() => parseJsonStringArray('not-json')).toThrow(TypeError);
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

    expect(serialized).toBe('{"energy":4,"recovery":3,"technique":5,"notes":"Moved well today."}');
    expect(parseWorkoutSessionFeedback(serialized)).toEqual(feedback);
    expect(parseWorkoutSessionFeedback(null)).toBeNull();
    expect(serializeWorkoutSessionFeedback(null)).toBeNull();
  });

  it('rejects invalid feedback payloads', () => {
    expect(() => parseWorkoutSessionFeedback('not-json')).toThrow(TypeError);
    expect(() => parseWorkoutSessionFeedback('{"energy":6,"recovery":3,"technique":4}')).toThrow(
      TypeError,
    );
    expect(() =>
      parseWorkoutSessionFeedback('{"energy":4,"recovery":3,"technique":4,"notes":1}'),
    ).toThrow(TypeError);
    expect(() =>
      parseWorkoutSessionFeedback(
        '{"energy":4,"recovery":3,"technique":4,"notes":"ok","extra":true}',
      ),
    ).toThrow(TypeError);
  });
});
