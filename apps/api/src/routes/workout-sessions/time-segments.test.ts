import { describe, expect, it } from 'vitest';

import {
  backfillTimeSegmentSections,
  calculateActiveDuration,
  calculateSectionDurations,
  closeOpenTimeSegment,
  findOpenTimeSegment,
  openTimeSegment,
} from './time-segments.js';

describe('workout session time segment helpers', () => {
  it('closes the latest open segment', () => {
    expect(
      closeOpenTimeSegment(
        [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:10:00.000Z',
            section: 'main',
          },
          {
            start: '2026-03-12T10:15:00.000Z',
            end: null,
            section: 'main',
          },
        ],
        '2026-03-12T10:20:00.000Z',
      ),
    ).toEqual([
      {
        start: '2026-03-12T10:00:00.000Z',
        end: '2026-03-12T10:10:00.000Z',
        section: 'main',
      },
      {
        start: '2026-03-12T10:15:00.000Z',
        end: '2026-03-12T10:20:00.000Z',
        section: 'main',
      },
    ]);
  });

  it('opens a new segment when resuming', () => {
    expect(
      openTimeSegment(
        [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:10:00.000Z',
            section: 'main',
          },
        ],
        '2026-03-12T10:15:00.000Z',
      ),
    ).toEqual([
      {
        start: '2026-03-12T10:00:00.000Z',
        end: '2026-03-12T10:10:00.000Z',
        section: 'main',
      },
      {
        start: '2026-03-12T10:15:00.000Z',
        end: null,
        section: 'main',
      },
    ]);
  });

  it('backfills legacy segments without section to main', () => {
    expect(
      backfillTimeSegmentSections([
        {
          start: '2026-03-12T10:00:00.000Z',
          end: null,
        },
        {
          start: '2026-03-12T10:15:00.000Z',
          end: '2026-03-12T10:30:00.000Z',
          section: 'cooldown',
        },
      ]),
    ).toEqual([
      {
        start: '2026-03-12T10:00:00.000Z',
        end: null,
        section: 'main',
      },
      {
        start: '2026-03-12T10:15:00.000Z',
        end: '2026-03-12T10:30:00.000Z',
        section: 'cooldown',
      },
    ]);
  });

  it('sums active duration across closed segments in seconds', () => {
    expect(
      calculateActiveDuration([
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T10:10:00.000Z',
          section: 'warmup',
        },
        {
          start: '2026-03-12T10:20:00.000Z',
          end: '2026-03-12T10:25:30.000Z',
          section: 'main',
        },
        {
          start: '2026-03-12T10:30:00.000Z',
          end: null,
          section: 'cooldown',
        },
      ]),
    ).toBe(930);
  });

  it('calculates duration for a single continuous closed segment', () => {
    expect(
      calculateActiveDuration([
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T10:45:00.000Z',
          section: 'main',
        },
      ]),
    ).toBe(2700);
  });

  it('calculates duration across multiple segments with pause gaps', () => {
    expect(
      calculateActiveDuration([
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T10:20:00.000Z',
          section: 'main',
        },
        {
          start: '2026-03-12T10:30:00.000Z',
          end: '2026-03-12T10:40:00.000Z',
          section: 'supplemental',
        },
      ]),
    ).toBe(1800);
  });

  it('returns zero for empty segment arrays', () => {
    expect(calculateActiveDuration([])).toBe(0);
  });

  it('finds the current open segment', () => {
    expect(
      findOpenTimeSegment([
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T10:10:00.000Z',
          section: 'warmup',
        },
        {
          start: '2026-03-12T10:15:00.000Z',
          end: null,
          section: 'main',
        },
      ]),
    ).toEqual({
      index: 1,
      segment: {
        start: '2026-03-12T10:15:00.000Z',
        end: null,
        section: 'main',
      },
    });
  });

  it('returns null when no segment is open', () => {
    expect(
      findOpenTimeSegment([
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T10:10:00.000Z',
          section: 'main',
        },
      ]),
    ).toBeNull();
  });

  it('calculates per-section durations in milliseconds using only closed segments', () => {
    expect(
      calculateSectionDurations([
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T10:10:00.000Z',
          section: 'warmup',
        },
        {
          start: '2026-03-12T10:20:00.000Z',
          end: '2026-03-12T10:25:30.000Z',
          section: 'main',
        },
        {
          start: '2026-03-12T10:30:00.000Z',
          end: null,
          section: 'cooldown',
        },
      ]),
    ).toEqual({
      warmup: 600_000,
      main: 330_000,
      cooldown: 0,
      supplemental: 0,
    });
  });
});
