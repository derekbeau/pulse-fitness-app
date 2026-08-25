import { describe, expect, it } from 'vitest';

import { nextProgramLocalDateBoundaryMs } from './program-local-midnight';

describe('nextProgramLocalDateBoundaryMs', () => {
  it.each([
    {
      label: 'ordinary Detroit day',
      now: '2026-03-06T17:00:00.000Z',
      expected: '2026-03-07T05:00:00.000Z',
    },
    {
      label: '23-hour Detroit spring-forward day',
      now: '2026-03-08T05:00:00.000Z',
      expected: '2026-03-09T04:00:00.000Z',
    },
    {
      label: '25-hour Detroit fall-back day',
      now: '2026-11-01T04:00:00.000Z',
      expected: '2026-11-02T05:00:00.000Z',
    },
  ])('finds the first instant of the next $label', ({ expected, now }) => {
    expect(
      new Date(nextProgramLocalDateBoundaryMs(Date.parse(now), 'America/Detroit')).toISOString(),
    ).toBe(expected);
  });
});
