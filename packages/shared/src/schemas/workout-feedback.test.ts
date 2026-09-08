import { describe, expect, it } from 'vitest';

import {
  createSystemWorkoutFeedbackQuestions,
  validateWorkoutFeedbackAnswer,
  workoutFeedbackAnswerInputSchema,
  workoutFeedbackQuestionInputListSchema,
  workoutFeedbackQuestionInputSchema,
  workoutFeedbackQuestionListSchema,
  type WorkoutFeedbackQuestionDefinition,
  type WorkoutFeedbackQuestionInput,
} from './workout-feedback';

const authoredAt = '2026-09-08T12:00:00.000Z';

function definition(
  input: WorkoutFeedbackQuestionInput,
  overrides: Partial<WorkoutFeedbackQuestionDefinition> = {},
): WorkoutFeedbackQuestionDefinition {
  return {
    ...input,
    version: 1,
    revisionId: `revision:${input.id}:1`,
    priorRevisionId: null,
    sourceKind: 'agent_token',
    sourceActorId: 'synthetic-agent',
    sourceActorName: 'Synthetic Agent',
    authoredAt,
    ...overrides,
  } as WorkoutFeedbackQuestionDefinition;
}

describe('workout feedback question contracts', () => {
  it('accepts exactly the six native input types and preserves contextual snapshots', () => {
    const inputs = [
      {
        id: 'scale',
        prompt: 'Scale?',
        type: 'scale',
        optional: false,
        timing: 'post_session',
        config: { min: 0, max: 8, step: 2, anchors: [{ value: 0, label: 'None' }] },
      },
      {
        id: 'slider',
        prompt: 'Slider?',
        type: 'slider',
        optional: true,
        timing: 'post_session',
        config: { min: -5, max: 5, step: 0.5 },
      },
      {
        id: 'text',
        prompt: 'Text?',
        type: 'text',
        optional: true,
        timing: 'next_check_in',
        config: {},
      },
      {
        id: 'yes-no',
        prompt: 'Yes or no?',
        type: 'yes_no',
        optional: true,
        timing: 'post_session',
        config: {},
      },
      {
        id: 'emoji',
        prompt: 'Emoji?',
        type: 'emoji',
        optional: true,
        timing: 'post_session',
        config: { options: ['🙂', '🙁'] },
      },
      {
        id: 'multi',
        prompt: 'Select?',
        type: 'multi_select',
        optional: true,
        timing: 'post_session',
        config: { options: ['None', 'Shin', 'Ankle'], exclusiveOption: 'None' },
        exerciseIdSnapshot: 'tib-raise',
        exerciseNameSnapshot: 'Tibialis Raise',
        bodyRegion: 'lower leg',
        laterality: 'left',
        concernRef: 'fictional-concern',
        contextLabel: 'Synthetic tib-bar check',
      },
    ];

    for (const input of inputs)
      expect(workoutFeedbackQuestionInputSchema.parse(input)).toEqual(input);
  });

  it('enforces the three-question authoring budget, unique IDs, and reserved core IDs', () => {
    const text = (id: string) => ({
      id,
      prompt: id,
      type: 'text' as const,
      optional: true,
      timing: 'post_session' as const,
      config: {},
    });
    expect(() =>
      workoutFeedbackQuestionInputListSchema.parse([text('a'), text('b'), text('c'), text('d')]),
    ).toThrow('At most 3');
    expect(() => workoutFeedbackQuestionInputListSchema.parse([text('a'), text('a')])).toThrow(
      'unique',
    );
    expect(() => workoutFeedbackQuestionInputListSchema.parse([text('session-rpe')])).toThrow(
      'reserved',
    );
  });

  it('rejects malformed bounds, steps, anchors, options, and type/config combinations', () => {
    const base = { id: 'q', prompt: 'Question?', optional: true, timing: 'post_session' as const };
    const invalid = [
      { ...base, type: 'scale', config: { min: 1, max: 20, step: 1 } },
      {
        ...base,
        type: 'scale',
        config: { min: 1, max: 5, step: 2, anchors: [{ value: 2, label: 'misaligned' }] },
      },
      { ...base, type: 'slider', config: { min: 0, max: 1001, step: 1 } },
      { ...base, type: 'slider', config: { min: 0, max: 1, step: 0 } },
      { ...base, type: 'emoji', config: { options: ['same', 'same'] } },
      { ...base, type: 'multi_select', config: { options: ['a', 'b'], exclusiveOption: 'c' } },
      { ...base, type: 'yes_no', config: { options: ['yes', 'no'] } },
      { ...base, type: 'text', config: {}, prompt: 'x'.repeat(256) },
      {
        ...base,
        type: 'emoji',
        config: { options: Array.from({ length: 21 }, (_, index) => `o${index}`) },
      },
    ];
    for (const input of invalid)
      expect(workoutFeedbackQuestionInputSchema.safeParse(input).success).toBe(false);
  });

  it('keeps the three optional system questions exact and excludes the old energy control', () => {
    const core = createSystemWorkoutFeedbackQuestions(authoredAt);
    expect(core.map(({ id, prompt, optional }) => ({ id, prompt, optional }))).toEqual([
      { id: 'session-rpe', prompt: 'Session RPE', optional: true },
      { id: 'pain-discomfort', prompt: 'Any pain or discomfort?', optional: true },
      { id: 'session-context', prompt: 'Anything that affected this session?', optional: true },
    ]);
    expect(core.some((question) => question.id.includes('energy'))).toBe(false);
  });

  it('reads historical over-budget lists without applying new authoring limits', () => {
    const questions = Array.from({ length: 5 }, (_, index) =>
      definition({
        id: `legacy-${index}`,
        prompt: `Legacy ${index}`,
        type: 'text',
        optional: true,
        timing: 'post_session',
        config: {},
      }),
    );
    expect(
      workoutFeedbackQuestionListSchema.parse({ revision: 9, source: 'legacy_import', questions })
        .questions,
    ).toHaveLength(5);
  });
});

describe('workout feedback answer validation', () => {
  it('preserves false and zero as answered values and distinguishes absent states', () => {
    const yesNo = definition({
      id: 'pain',
      prompt: 'Pain?',
      type: 'yes_no',
      optional: true,
      timing: 'post_session',
      config: {},
    });
    const scale = definition({
      id: 'scale',
      prompt: 'Scale?',
      type: 'scale',
      optional: true,
      timing: 'post_session',
      config: { min: 0, max: 4, step: 1 },
    });
    expect(
      validateWorkoutFeedbackAnswer(yesNo, {
        questionId: 'pain',
        definitionVersion: 1,
        state: 'answered',
        value: false,
      }).value,
    ).toBe(false);
    expect(
      validateWorkoutFeedbackAnswer(scale, {
        questionId: 'scale',
        definitionVersion: 1,
        state: 'answered',
        value: 0,
      }).value,
    ).toBe(0);
    for (const state of ['skipped', 'unanswered', 'unknown'] as const) {
      expect(
        workoutFeedbackAnswerInputSchema.parse({ questionId: 'pain', definitionVersion: 1, state }),
      ).not.toHaveProperty('value');
      expect(() =>
        workoutFeedbackAnswerInputSchema.parse({
          questionId: 'pain',
          definitionVersion: 1,
          state,
          value: false,
        }),
      ).toThrow();
    }
  });

  it('validates native values against the exact frozen definition and version', () => {
    const multi = definition({
      id: 'tib-response',
      prompt: 'Response?',
      type: 'multi_select',
      optional: true,
      timing: 'post_session',
      config: { options: ['None', 'Pain', 'Tightness'], exclusiveOption: 'None' },
    });
    expect(() =>
      validateWorkoutFeedbackAnswer(multi, {
        questionId: 'tib-response',
        definitionVersion: 2,
        state: 'answered',
        value: ['Pain'],
      }),
    ).toThrow('exact frozen');
    expect(() =>
      validateWorkoutFeedbackAnswer(multi, {
        questionId: 'tib-response',
        definitionVersion: 1,
        state: 'answered',
        value: ['None', 'Pain'],
      }),
    ).toThrow('does not satisfy');
    expect(() =>
      validateWorkoutFeedbackAnswer(multi, {
        questionId: 'tib-response',
        definitionVersion: 1,
        state: 'answered',
        value: ['Unknown option'],
      }),
    ).toThrow('does not satisfy');
    expect(
      validateWorkoutFeedbackAnswer(multi, {
        questionId: 'tib-response',
        definitionVersion: 1,
        state: 'answered',
        value: ['Pain', 'Tightness'],
      }).value,
    ).toEqual(['Pain', 'Tightness']);
  });

  it('rejects new empty text while retaining an explicit legacy read adapter', () => {
    const text = definition({
      id: 'context',
      prompt: 'Context?',
      type: 'text',
      optional: true,
      timing: 'post_session',
      config: {},
    });
    const answer = {
      questionId: 'context',
      definitionVersion: 1,
      state: 'answered' as const,
      value: '',
    };
    expect(() => validateWorkoutFeedbackAnswer(text, answer)).toThrow('does not satisfy');
    expect(validateWorkoutFeedbackAnswer(text, answer, { allowLegacyEmptyText: true }).value).toBe(
      '',
    );
  });
});
