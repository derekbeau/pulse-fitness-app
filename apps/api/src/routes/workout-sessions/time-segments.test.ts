import { describe, expect, it } from 'vitest';

import { calculateActiveDuration, closeOpenTimeSegment, openTimeSegment } from './time-segments.js';

describe('workout session time segment helpers', () => {
  it('closes the latest open segment', () => {
    expect(
      closeOpenTimeSegment(
        [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:10:00.000Z',
          },
          {
            start: '2026-03-12T10:15:00.000Z',
            end: null,
          },
        ],
        '2026-03-12T10:20:00.000Z',
      ),
    ).toEqual([
      {
        start: '2026-03-12T10:00:00.000Z',
        end: '2026-03-12T10:10:00.000Z',
      },
      {
        start: '2026-03-12T10:15:00.000Z',
        end: '2026-03-12T10:20:00.000Z',
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
          },
        ],
        '2026-03-12T10:15:00.000Z',
      ),
    ).toEqual([
      {
        start: '2026-03-12T10:00:00.000Z',
        end: '2026-03-12T10:10:00.000Z',
      },
      {
        start: '2026-03-12T10:15:00.000Z',
        end: null,
      },
    ]);
  });

  it('sums active duration across closed segments in seconds', () => {
    expect(
      calculateActiveDuration([
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T10:10:00.000Z',
        },
        {
          start: '2026-03-12T10:20:00.000Z',
          end: '2026-03-12T10:25:30.000Z',
        },
        {
          start: '2026-03-12T10:30:00.000Z',
          end: null,
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
        },
        {
          start: '2026-03-12T10:30:00.000Z',
          end: '2026-03-12T10:40:00.000Z',
        },
      ]),
    ).toBe(1800);
  });

  it('returns zero for empty segment arrays', () => {
    expect(calculateActiveDuration([])).toBe(0);
  });
});
