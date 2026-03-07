import { describe, expect, it } from 'vitest';

import { type LoginInput, type RegisterInput, loginInputSchema, registerInputSchema } from './auth';

describe('registerInputSchema', () => {
  it('parses a valid registration payload and normalizes text fields', () => {
    const payload = registerInputSchema.parse({
      username: ' Derek ',
      password: 'super-secret',
      name: ' Derek ',
    });

    expect(payload).toEqual({
      username: 'derek',
      password: 'super-secret',
      name: 'Derek',
    });
  });

  it('rejects short usernames and passwords', () => {
    expect(() =>
      registerInputSchema.parse({
        username: 'ab',
        password: 'short',
      }),
    ).toThrow();
  });

  it('rejects passwords longer than bcrypt supports and empty names', () => {
    expect(() =>
      registerInputSchema.parse({
        username: 'derek',
        password: 'a'.repeat(73),
      }),
    ).toThrow();

    expect(() =>
      registerInputSchema.parse({
        username: 'derek',
        password: 'super-secret',
        name: '   ',
      }),
    ).toThrow();
  });

  it('infers the RegisterInput type from the schema', () => {
    const payload: RegisterInput = {
      username: 'pulse-user',
      password: 'very-secure-password',
      name: 'Pulse',
    };

    expect(payload.name).toBe('Pulse');
  });
});

describe('loginInputSchema', () => {
  it('parses a valid login payload and normalizes the username', () => {
    const payload = loginInputSchema.parse({
      username: ' Derek ',
      password: 'super-secret',
    });

    expect(payload).toEqual({
      username: 'derek',
      password: 'super-secret',
    });
  });

  it('infers the LoginInput type from the schema', () => {
    const payload: LoginInput = {
      username: 'pulse-user',
      password: 'very-secure-password',
    };

    expect(payload.username).toBe('pulse-user');
  });
});
