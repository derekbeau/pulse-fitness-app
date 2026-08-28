import { describe, expect, it } from 'vitest';

import {
  getDateKeyInTimeZone,
  isSupportedTimeZone,
  resolveUserPreferenceTimeZone,
  resolveUserTimeZone,
} from './user-time-zone.js';

describe('user time zone authority', () => {
  it('uses the supported canonical or legacy preference key', () => {
    expect(resolveUserPreferenceTimeZone({ timeZone: 'Asia/Tokyo' })).toBe('Asia/Tokyo');
    expect(resolveUserPreferenceTimeZone({ timezone: 'America/Detroit' })).toBe('America/Detroit');
  });

  it('leaves missing or invalid preferences unresolved', () => {
    expect(resolveUserPreferenceTimeZone(null)).toBeNull();
    expect(resolveUserPreferenceTimeZone({})).toBeNull();
    expect(resolveUserPreferenceTimeZone({ timeZone: 'Detroit' })).toBeNull();
    expect(isSupportedTimeZone('Pacific/Kiritimati')).toBe(true);
    expect(isSupportedTimeZone('not/a-zone')).toBe(false);
  });

  it('prefers an effective program zone and otherwise uses the persisted profile zone', () => {
    expect(
      resolveUserTimeZone({
        preferences: { timeZone: 'America/Detroit' },
        programTimeZone: 'Asia/Tokyo',
      }),
    ).toEqual({ source: 'adaptive_program', timeZone: 'Asia/Tokyo' });
    expect(resolveUserTimeZone({ preferences: { timeZone: 'America/Detroit' } })).toEqual({
      source: 'user_profile',
      timeZone: 'America/Detroit',
    });
    expect(resolveUserTimeZone({ preferences: null })).toBeNull();
  });

  it('resolves the authoritative calendar key at opposite-zone midnight boundaries', () => {
    const instant = new Date('2026-08-24T02:30:00.000Z');
    expect(getDateKeyInTimeZone(instant, 'America/Detroit')).toBe('2026-08-23');
    expect(getDateKeyInTimeZone(instant, 'UTC')).toBe('2026-08-24');
    expect(getDateKeyInTimeZone(instant, 'Pacific/Kiritimati')).toBe('2026-08-24');
  });
});
