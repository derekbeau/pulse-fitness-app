import { describe, expect, it } from 'vitest';
import {
  actionableFeedbackRating,
  classifyNativeFeedback,
  type NativeFeedbackResponse,
} from './feedback-provenance.js';

const classifiedAt = '2026-09-08T00:00:00.000Z';
const actor = { kind: 'user' as const, id: 'synthetic-owner' };
const classify = (responses: NativeFeedbackResponse[]) =>
  classifyNativeFeedback({ responses }, { classifiedAt, actor });
describe('native feedback provenance', () => {
  it.each([true, false])(
    'preserves pain=%s and RPE without fabricating recovery or technique',
    (pain) => {
      const responses: NativeFeedbackResponse[] = [
        {
          id: 'pain-discomfort',
          label: 'Any pain?',
          type: 'yes_no',
          value: pain,
          notes: '  Exact text.  ',
        },
        { id: 'session-rpe', label: 'Session RPE', type: 'scale', value: 8 },
      ];
      const result = classify(responses);
      expect(result.responses).toEqual(responses);
      expect(result.recovery).toBeNull();
      expect(result.technique).toBeNull();
    },
  );
  it('keeps explicit ratings even when equal to historical formulas', () => {
    const result = classify([
      { id: 'recovery-answer', label: 'Recovery?', construct: 'recovery', type: 'scale', value: 2 },
      {
        id: 'technique-answer',
        label: 'Technique?',
        construct: 'technique',
        type: 'scale',
        value: 4,
      },
    ]);
    expect(actionableFeedbackRating(result, 'recovery')).toBe(2);
    expect(actionableFeedbackRating(result, 'technique')).toBe(4);
  });
  it('does not infer constructs from labels, positions or custom IDs', () => {
    expect(
      classify([{ id: 'recovery', label: 'Recovery', type: 'scale', value: 2 }]).recovery,
    ).toBeNull();
  });
  it('records documented same-construct emoji mapping', () => {
    const result = classify([
      { id: 'energy-post-workout', label: 'Energy post workout', type: 'emoji', value: '💪' },
    ]);
    expect(actionableFeedbackRating(result, 'energy')).toBe(5);
    expect(result.provenance.energy.mappingVersion).toBe('pulse-energy-emoji-v1');
  });
  it('keeps null, false, zero, empty text, absent and skipped distinct', () => {
    const responses: NativeFeedbackResponse[] = [
      { id: 'n', label: 'Null', type: 'text', value: null },
      { id: 'f', label: 'False', type: 'yes_no', value: false },
      { id: 'z', label: 'Zero', type: 'scale', value: 0 },
      { id: 'e', label: 'Empty', type: 'text', value: '' },
      { id: 'a', label: 'Absent', type: 'scale' },
      { id: 's', label: 'Skipped', type: 'scale', state: 'skipped' },
    ];
    expect(classify(responses).responses).toEqual(responses);
  });
  it('quarantines ambiguous duplicate constructs and unknown historical actors', () => {
    const response: NativeFeedbackResponse = {
      id: 'r',
      label: 'Recovery',
      construct: 'recovery',
      type: 'scale',
      value: 2,
    };
    expect(classify([response, { ...response, id: 'r2' }]).recovery).toBeNull();
    const legacy = classifyNativeFeedback(
      { responses: [response] },
      { classifiedAt, legacy: true },
    );
    expect(legacy.recovery).toBeNull();
    expect(legacy.provenance.recovery.source).toBe('legacy_unknown');
    expect(legacy.provenance.recovery.sourceKind).toBe('unknown');
  });
  it('refuses forged actionable metadata without the linked native answer', () => {
    const result = classify([]);
    result.recovery = 2;
    result.provenance.recovery.source = 'explicit_user_response';
    expect(actionableFeedbackRating(result, 'recovery')).toBeNull();
  });
});
