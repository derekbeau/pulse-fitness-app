import { describe, expect, it } from 'vitest';

import { isSupportedTimeZone, resolveUserPreferenceTimeZone } from './user-time-zone.js';

describe('user time zone authority', () => {
  it('uses the supported canonical or legacy preference key', () => {
    expect(resolveUserPreferenceTimeZone({ timeZone: 'Asia/Tokyo' })).toBe('Asia/Tokyo');
    expect(resolveUserPreferenceTimeZone({ timezone: 'America/Detroit' })).toBe('America/Detroit');
  });

  it('falls back to UTC for missing or invalid preferences', () => {
    expect(resolveUserPreferenceTimeZone(null)).toBe('UTC');
    expect(resolveUserPreferenceTimeZone({})).toBe('UTC');
    expect(resolveUserPreferenceTimeZone({ timeZone: 'Detroit' })).toBe('UTC');
    expect(isSupportedTimeZone('Pacific/Kiritimati')).toBe(true);
    expect(isSupportedTimeZone('not/a-zone')).toBe(false);
  });
});
