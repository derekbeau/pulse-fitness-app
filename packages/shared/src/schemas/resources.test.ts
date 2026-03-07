import { describe, expect, it } from 'vitest';

import { resourceSchema, type Resource, type ResourceType } from './resources';

describe('resourceSchema', () => {
  it('parses a valid resource payload', () => {
    const payload = resourceSchema.parse({
      id: 'resource-1',
      userId: 'user-1',
      title: ' 5/3/1 Forever ',
      type: 'book',
      author: ' Jim Wendler ',
      description: null,
      tags: ['strength', 'programming'],
      principles: ['submaximal', 'consistency'],
      createdAt: 1,
    });

    expect(payload).toEqual({
      id: 'resource-1',
      userId: 'user-1',
      title: '5/3/1 Forever',
      type: 'book',
      author: 'Jim Wendler',
      description: null,
      tags: ['strength', 'programming'],
      principles: ['submaximal', 'consistency'],
      createdAt: 1,
    });
  });

  it('rejects invalid resource types and non-array list fields', () => {
    expect(() =>
      resourceSchema.parse({
        id: 'resource-1',
        userId: 'user-1',
        title: 'Starting Strength',
        type: 'course',
        author: 'Mark Rippetoe',
        description: null,
        tags: 'strength',
        principles: [],
        createdAt: 1,
      }),
    ).toThrow();
  });

  it('infers the Resource type from the schema', () => {
    const type: ResourceType = 'creator';
    const payload: Resource = {
      id: 'resource-2',
      userId: 'user-1',
      title: 'Dan John',
      type,
      author: 'Dan John',
      description: 'Coach and writer',
      tags: ['coach'],
      principles: ['simple', 'repeatable'],
      createdAt: 2,
    };

    expect(payload.type).toBe('creator');
  });
});
