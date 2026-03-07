import { describe, expect, it } from 'vitest';

import { type CreateAgentTokenInput, createAgentTokenInputSchema } from './agent-tokens';

describe('createAgentTokenInputSchema', () => {
  it('parses a valid payload and trims the token name', () => {
    const payload = createAgentTokenInputSchema.parse({
      name: ' Meal logger ',
    });

    expect(payload).toEqual({
      name: 'Meal logger',
    });
  });

  it('rejects empty token names', () => {
    expect(() =>
      createAgentTokenInputSchema.parse({
        name: '   ',
      }),
    ).toThrow();
  });

  it('rejects token names longer than 255 characters', () => {
    expect(() =>
      createAgentTokenInputSchema.parse({
        name: 'a'.repeat(256),
      }),
    ).toThrow();
  });

  it('infers the CreateAgentTokenInput type from the schema', () => {
    const payload: CreateAgentTokenInput = {
      name: 'Automation token',
    };

    expect(payload.name).toBe('Automation token');
  });
});
