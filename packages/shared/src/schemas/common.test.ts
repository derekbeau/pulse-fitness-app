import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  agentEnrichmentSchema,
  apiDataResponseSchema,
  apiPaginatedResponseSchema,
  dateSchema,
} from './common';

describe('dateSchema', () => {
  it('accepts valid calendar dates and rejects impossible ones', () => {
    expect(dateSchema.parse('2026-03-09')).toBe('2026-03-09');
    expect(() => dateSchema.parse('2026-02-30')).toThrow();
    expect(() => dateSchema.parse('2026-3-9')).toThrow();
  });
});

describe('agentEnrichmentSchema', () => {
  it('parses optional hint, action, and related state fields', () => {
    const enrichment = agentEnrichmentSchema.parse({
      hints: ['Protein is still low for today.'],
      suggestedActions: ['Log dinner next.'],
      relatedState: {
        remainingProtein: 45,
      },
    });

    expect(enrichment).toEqual({
      hints: ['Protein is still low for today.'],
      suggestedActions: ['Log dinner next.'],
      relatedState: {
        remainingProtein: 45,
      },
    });
  });
});

describe('apiDataResponseSchema', () => {
  it('accepts responses with optional agent enrichment', () => {
    const schema = apiDataResponseSchema(z.object({ id: z.string() }));

    expect(
      schema.parse({
        data: { id: 'entry-1' },
        agent: {
          hints: ['Trend is down.'],
        },
      }),
    ).toEqual({
      data: { id: 'entry-1' },
      agent: {
        hints: ['Trend is down.'],
      },
    });
  });
});

describe('apiPaginatedResponseSchema', () => {
  it('accepts paginated responses with optional agent enrichment', () => {
    const schema = apiPaginatedResponseSchema(z.object({ id: z.string() }));

    expect(
      schema.parse({
        data: [{ id: 'entry-1' }],
        meta: {
          page: 1,
          limit: 25,
          total: 1,
        },
        agent: {
          suggestedActions: ['Keep paging if you need older entries.'],
        },
      }),
    ).toEqual({
      data: [{ id: 'entry-1' }],
      meta: {
        page: 1,
        limit: 25,
        total: 1,
      },
      agent: {
        suggestedActions: ['Keep paging if you need older entries.'],
      },
    });
  });
});
