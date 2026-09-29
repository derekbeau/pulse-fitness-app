import { describe, expect, it } from 'vitest';
import { describeMissingInput } from './context-missing-input';
import { scheduledStartConfirmation } from './scheduled-start';

describe('scheduled start presentation', () => {
  it('distinguishes early, overdue and same-day without changing the start payload', () => {
    expect(scheduledStartConfirmation('2026-03-13', '2026-03-12').title).toBe(
      'Start workout early?',
    );
    expect(scheduledStartConfirmation('2026-03-11', '2026-03-12').title).toBe(
      'Start overdue workout?',
    );
    expect(scheduledStartConfirmation('2026-03-12', '2026-03-12').description).toContain(
      'original scheduled date',
    );
  });
});

describe('context input labels', () => {
  it('describes unknowns without converting them into denied findings or hiding identities', () => {
    const input = describeMissingInput('workout_load_duration:fictional-session-id');
    expect(input.label).toBe('Workout duration not recorded');
    expect(input.raw).toBe('workout_load_duration:fictional-session-id');
    expect(describeMissingInput('sleep').label).toBe('Sleep information not recorded');
    expect(describeMissingInput('guidance_for_concern:concern-id').label).toContain('not recorded');
    expect(describeMissingInput('future_key:record-id').raw).toBe('future_key:record-id');
  });
});
