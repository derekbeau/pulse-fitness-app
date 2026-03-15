import { describe, expect, it } from 'vitest';

import { foodKeys } from './keys';

describe('foodKeys.list', () => {
  it('uses a dedicated list segment', () => {
    expect(foodKeys.list()).toEqual(['foods', 'list']);
    expect(foodKeys.list({ page: 2, limit: 10, sort: 'popular' })).toEqual([
      'foods',
      'list',
      {
        limit: 10,
        page: 2,
        q: null,
        sort: 'popular',
        tags: null,
      },
    ]);
  });
});
