import { describe, expect, it } from 'vitest';

import { formatWeight } from './weight-unit';

describe('weight-unit utils', () => {
  it('formats pounds with unit label', () => {
    expect(formatWeight(180, 'lbs')).toBe('180 lbs');
  });

  it('formats kilograms with unit label', () => {
    expect(formatWeight(81.6, 'kg')).toBe('81.6 kg');
  });
});
