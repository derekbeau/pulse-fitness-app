import { describe, expect, it } from 'vitest';

import {
  entityLinkSchema,
  type EntityLink,
  type EntityLinkSourceType,
  type EntityLinkTargetType,
} from './entity-links';

describe('entityLinkSchema', () => {
  it('parses a valid entity link payload', () => {
    const payload = entityLinkSchema.parse({
      id: 'link-1',
      sourceType: 'resource',
      sourceId: 'resource-1',
      targetType: 'exercise',
      targetId: 'exercise-1',
      targetName: ' Romanian Deadlift ',
      createdAt: 1,
    });

    expect(payload).toEqual({
      id: 'link-1',
      sourceType: 'resource',
      sourceId: 'resource-1',
      targetType: 'exercise',
      targetId: 'exercise-1',
      targetName: 'Romanian Deadlift',
      createdAt: 1,
    });
  });

  it('rejects invalid source and target types', () => {
    expect(() =>
      entityLinkSchema.parse({
        id: 'link-1',
        sourceType: 'workout',
        sourceId: 'resource-1',
        targetType: 'meal',
        targetId: 'exercise-1',
        targetName: 'Deadlift',
        createdAt: 1,
      }),
    ).toThrow();
  });

  it('infers the EntityLink type from the schema', () => {
    const sourceType: EntityLinkSourceType = 'journal';
    const targetType: EntityLinkTargetType = 'protocol';
    const payload: EntityLink = {
      id: 'link-2',
      sourceType,
      sourceId: 'journal-1',
      targetType,
      targetId: 'protocol-1',
      targetName: 'Daily mobility',
      createdAt: 2,
    };

    expect(payload.sourceType).toBe('journal');
    expect(payload.targetType).toBe('protocol');
  });
});
