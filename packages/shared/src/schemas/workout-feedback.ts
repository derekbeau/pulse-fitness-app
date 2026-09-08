import { z } from 'zod';

export const WORKOUT_FEEDBACK_MAX_ADDITIONAL_QUESTIONS = 3;
export const WORKOUT_FEEDBACK_MAX_OPTIONS = 20;
export const WORKOUT_FEEDBACK_MAX_TEXT_LENGTH = 4000;
export const WORKOUT_FEEDBACK_SYSTEM_QUESTION_IDS = [
  'session-rpe',
  'pain-discomfort',
  'session-context',
] as const;

const shortText = z.string().trim().min(1).max(255);
const longText = z.string().max(WORKOUT_FEEDBACK_MAX_TEXT_LENGTH);
const nullableShortText = shortText.nullable();
const finiteNumber = z.number().finite();

export const workoutFeedbackQuestionTypeSchema = z.enum([
  'scale',
  'slider',
  'text',
  'yes_no',
  'emoji',
  'multi_select',
]);
export const workoutFeedbackQuestionTimingSchema = z.enum(['post_session', 'next_check_in']);
export const workoutFeedbackQuestionSourceKindSchema = z.enum([
  'system',
  'user',
  'agent_token',
  'legacy_import',
]);
export const workoutFeedbackRespondentSourceSchema = z.enum([
  'user',
  'agent_token',
  'other',
  'unknown',
]);
export const workoutFeedbackLateralitySchema = z.enum([
  'left',
  'right',
  'bilateral',
  'midline',
  'unspecified',
]);
export const workoutFeedbackAnswerStateSchema = z.enum([
  'answered',
  'skipped',
  'unanswered',
  'unknown',
]);
export const workoutFeedbackQuestionsSourceSchema = z.enum([
  'system_core',
  'template_defaults',
  'template_snapshot',
  'scheduled_override',
  'ad_hoc',
  'legacy_import',
]);

const anchorSchema = z.object({ value: finiteNumber, label: shortText }).strict();
const optionListSchema = z
  .array(shortText)
  .min(2)
  .max(WORKOUT_FEEDBACK_MAX_OPTIONS)
  .superRefine((options, context) => {
    const seen = new Set<string>();
    options.forEach((option, index) => {
      if (seen.has(option)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: 'Question options must be unique.',
        });
      }
      seen.add(option);
    });
  });

const definitionEnvelope = z.object({
  id: shortText,
  version: z.number().int().positive(),
  revisionId: shortText,
  priorRevisionId: nullableShortText,
  prompt: shortText,
  optional: z.boolean(),
  timing: workoutFeedbackQuestionTimingSchema,
  sourceKind: workoutFeedbackQuestionSourceKindSchema,
  sourceActorId: nullableShortText,
  sourceActorName: nullableShortText,
  authoredAt: z.string().datetime({ offset: true }),
  exerciseIdSnapshot: nullableShortText.optional(),
  exerciseNameSnapshot: nullableShortText.optional(),
  bodyRegion: nullableShortText.optional(),
  laterality: workoutFeedbackLateralitySchema.nullable().optional(),
  concernRef: nullableShortText.optional(),
  contextLabel: nullableShortText.optional(),
});

const validateScaleDefinition = (
  definition: {
    config: {
      min: number;
      max: number;
      step?: number;
      anchors?: Array<{ value: number; label: string }>;
    };
  },
  context: z.RefinementCtx,
) => {
  const step = definition.config.step ?? 1;
  const span = definition.config.max - definition.config.min;
  const choiceCount = span / step + 1;
  if (span <= 0 || !Number.isInteger(choiceCount) || choiceCount < 2 || choiceCount > 10) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['config', 'max'],
      message: 'Scale must contain 2 to 10 inclusive discrete choices aligned to step.',
    });
  }
  validateAnchors(
    definition.config.anchors,
    definition.config.min,
    definition.config.max,
    step,
    context,
  );
};

const validateSliderDefinition = (
  definition: {
    config: {
      min: number;
      max: number;
      step: number;
      anchors?: Array<{ value: number; label: string }>;
    };
  },
  context: z.RefinementCtx,
) => {
  const span = definition.config.max - definition.config.min;
  const increments = span / definition.config.step;
  if (span <= 0 || !Number.isFinite(increments) || increments > 1000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['config', 'max'],
      message: 'Slider min must be below max and may represent at most 1,000 increments.',
    });
  }
  validateAnchors(
    definition.config.anchors,
    definition.config.min,
    definition.config.max,
    definition.config.step,
    context,
    false,
  );
};

const scaleDefinitionObject = definitionEnvelope
  .extend({
    type: z.literal('scale'),
    config: z
      .object({
        min: z.number().int().safe(),
        max: z.number().int().safe(),
        step: z.number().int().safe().positive().optional(),
        anchors: z.array(anchorSchema).max(10).optional(),
      })
      .strict(),
  })
  .strict();
const scaleDefinitionSchema = scaleDefinitionObject.superRefine(validateScaleDefinition);

const sliderDefinitionObject = definitionEnvelope
  .extend({
    type: z.literal('slider'),
    config: z
      .object({
        min: finiteNumber,
        max: finiteNumber,
        step: finiteNumber.positive(),
        anchors: z.array(anchorSchema).max(20).optional(),
      })
      .strict(),
  })
  .strict();
const sliderDefinitionSchema = sliderDefinitionObject.superRefine(validateSliderDefinition);

const textDefinitionSchema = definitionEnvelope
  .extend({ type: z.literal('text'), config: z.object({}).strict() })
  .strict();
const yesNoDefinitionSchema = definitionEnvelope
  .extend({ type: z.literal('yes_no'), config: z.object({}).strict() })
  .strict();
const emojiDefinitionSchema = definitionEnvelope
  .extend({
    type: z.literal('emoji'),
    config: z.object({ options: optionListSchema }).strict(),
  })
  .strict();
const multiSelectDefinitionSchema = definitionEnvelope
  .extend({
    type: z.literal('multi_select'),
    config: z
      .object({ options: optionListSchema, exclusiveOption: shortText.optional() })
      .strict()
      .superRefine((config, context) => {
        if (config.exclusiveOption && !config.options.includes(config.exclusiveOption)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['exclusiveOption'],
            message: 'The exclusive option must be one of the question options.',
          });
        }
      }),
  })
  .strict();

export const workoutFeedbackQuestionDefinitionSchema = z.union([
  scaleDefinitionSchema,
  sliderDefinitionSchema,
  textDefinitionSchema,
  yesNoDefinitionSchema,
  emojiDefinitionSchema,
  multiSelectDefinitionSchema,
]);

const authoringOmissions = {
  version: true,
  revisionId: true,
  priorRevisionId: true,
  sourceKind: true,
  sourceActorId: true,
  sourceActorName: true,
  authoredAt: true,
} as const;

export const workoutFeedbackQuestionInputSchema = z.union([
  scaleDefinitionObject.omit(authoringOmissions).superRefine(validateScaleDefinition),
  sliderDefinitionObject.omit(authoringOmissions).superRefine(validateSliderDefinition),
  textDefinitionSchema.omit(authoringOmissions),
  yesNoDefinitionSchema.omit(authoringOmissions),
  emojiDefinitionSchema.omit(authoringOmissions),
  multiSelectDefinitionSchema.omit(authoringOmissions),
]);

export const workoutFeedbackQuestionInputListSchema = z
  .array(workoutFeedbackQuestionInputSchema)
  .max(WORKOUT_FEEDBACK_MAX_ADDITIONAL_QUESTIONS, {
    message: `At most ${WORKOUT_FEEDBACK_MAX_ADDITIONAL_QUESTIONS} additional feedback questions are allowed.`,
  })
  .superRefine((questions, context) => {
    const ids = new Set<string>();
    const systemIds = new Set<string>(WORKOUT_FEEDBACK_SYSTEM_QUESTION_IDS);
    questions.forEach((question, index) => {
      if (systemIds.has(question.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'id'],
          message: 'System feedback question IDs are reserved and cannot be redefined.',
        });
      }
      if (ids.has(question.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'id'],
          message: 'Feedback question IDs must be unique within a question list.',
        });
      }
      ids.add(question.id);
    });
  });

export const workoutFeedbackQuestionListSchema = z.object({
  revision: z.number().int().nonnegative(),
  source: workoutFeedbackQuestionsSourceSchema,
  questions: z.array(workoutFeedbackQuestionDefinitionSchema).max(50),
});

export const workoutFeedbackQuestionListMutationSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  feedbackQuestions: workoutFeedbackQuestionInputListSchema,
});

const answerValueSchema = z.union([
  finiteNumber,
  z.boolean(),
  longText,
  z.array(shortText).max(WORKOUT_FEEDBACK_MAX_OPTIONS),
]);

const workoutFeedbackAnswerInputObject = z
  .object({
    questionId: shortText,
    definitionVersion: z.number().int().positive(),
    state: workoutFeedbackAnswerStateSchema,
    value: answerValueSchema.optional(),
    notes: longText.optional(),
  })
  .strict();

const validateAnswerState = (
  answer: z.infer<typeof workoutFeedbackAnswerInputObject>,
  context: z.RefinementCtx,
) => {
  if (answer.state === 'answered' && answer.value === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['value'],
      message: 'An answered response requires a native value.',
    });
  }
  if (answer.state !== 'answered' && answer.value !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['value'],
      message: 'Skipped, unanswered, and unknown responses cannot include a value.',
    });
  }
};

export const workoutFeedbackAnswerInputSchema =
  workoutFeedbackAnswerInputObject.superRefine(validateAnswerState);

export const workoutFeedbackAnswerRevisionSchema = workoutFeedbackAnswerInputObject
  .extend({
    responseId: shortText,
    revision: z.number().int().positive(),
    priorRevisionId: nullableShortText,
    answeredAt: z.string().datetime({ offset: true }),
    timing: workoutFeedbackQuestionTimingSchema,
    respondentSource: workoutFeedbackRespondentSourceSchema,
    respondentActorId: nullableShortText,
    exerciseIdSnapshot: nullableShortText.optional(),
    exerciseNameSnapshot: nullableShortText.optional(),
    bodyRegion: nullableShortText.optional(),
    laterality: workoutFeedbackLateralitySchema.nullable().optional(),
    concernRef: nullableShortText.optional(),
    contextLabel: nullableShortText.optional(),
  })
  .superRefine(validateAnswerState);

export const workoutFeedbackAnswerMutationSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  responses: z.array(workoutFeedbackAnswerInputSchema).max(50),
});

export const workoutFeedbackAnswerSnapshotSchema = z.object({
  revision: z.number().int().nonnegative(),
  current: z.array(workoutFeedbackAnswerRevisionSchema).max(50),
  history: z.array(workoutFeedbackAnswerRevisionSchema).max(1000),
});

export type WorkoutFeedbackQuestionDefinition = z.infer<
  typeof workoutFeedbackQuestionDefinitionSchema
>;
export type WorkoutFeedbackQuestionInput = z.infer<typeof workoutFeedbackQuestionInputSchema>;
export type WorkoutFeedbackQuestionList = z.infer<typeof workoutFeedbackQuestionListSchema>;
export type WorkoutFeedbackAnswerInput = z.infer<typeof workoutFeedbackAnswerInputSchema>;
export type WorkoutFeedbackAnswerRevision = z.infer<typeof workoutFeedbackAnswerRevisionSchema>;
export type WorkoutFeedbackAnswerSnapshot = z.infer<typeof workoutFeedbackAnswerSnapshotSchema>;

function validateAnchors(
  anchors: Array<{ value: number; label: string }> | undefined,
  min: number,
  max: number,
  step: number,
  context: z.RefinementCtx,
  requireStepAlignment = true,
) {
  const values = new Set<number>();
  anchors?.forEach((anchor, index) => {
    const aligned = Math.abs((anchor.value - min) / step - Math.round((anchor.value - min) / step));
    if (
      anchor.value < min ||
      anchor.value > max ||
      (requireStepAlignment && aligned > Number.EPSILON * 16)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'anchors', index, 'value'],
        message: 'Anchor values must be inside the configured range and aligned to step.',
      });
    }
    if (values.has(anchor.value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config', 'anchors', index, 'value'],
        message: 'Anchor values must be unique.',
      });
    }
    values.add(anchor.value);
  });
}

const stepAligned = (value: number, min: number, step: number) =>
  Math.abs((value - min) / step - Math.round((value - min) / step)) <= Number.EPSILON * 32;

export function validateWorkoutFeedbackAnswer(
  definition: WorkoutFeedbackQuestionDefinition,
  input: unknown,
  options: { allowLegacyEmptyText?: boolean } = {},
): WorkoutFeedbackAnswerInput {
  const answer = workoutFeedbackAnswerInputSchema.parse(input);
  if (answer.questionId !== definition.id || answer.definitionVersion !== definition.version) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ['questionId'],
        message: 'Response must reference the exact frozen question ID and version.',
      },
    ]);
  }
  if (answer.state !== 'answered') return answer;

  const value = answer.value;
  let valid = false;
  switch (definition.type) {
    case 'scale':
    case 'slider':
      valid =
        typeof value === 'number' &&
        value >= definition.config.min &&
        value <= definition.config.max &&
        stepAligned(value, definition.config.min, definition.config.step ?? 1);
      break;
    case 'yes_no':
      valid = typeof value === 'boolean';
      break;
    case 'text':
      valid =
        typeof value === 'string' && (value.length > 0 || options.allowLegacyEmptyText === true);
      break;
    case 'emoji':
      valid = typeof value === 'string' && definition.config.options.includes(value);
      break;
    case 'multi_select': {
      const selections = Array.isArray(value) ? value : null;
      valid =
        selections !== null &&
        selections.length > 0 &&
        new Set(selections).size === selections.length &&
        selections.every((option) => definition.config.options.includes(option));
      if (
        valid &&
        selections &&
        definition.config.exclusiveOption &&
        selections.includes(definition.config.exclusiveOption) &&
        selections.length > 1
      ) {
        valid = false;
      }
      break;
    }
  }
  if (!valid) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Response value does not satisfy the referenced frozen question definition.',
      },
    ]);
  }
  return answer;
}

export const createSystemWorkoutFeedbackQuestions = (
  authoredAt: string,
): WorkoutFeedbackQuestionDefinition[] =>
  z.array(workoutFeedbackQuestionDefinitionSchema).parse([
    {
      id: 'session-rpe',
      version: 1,
      revisionId: 'system:session-rpe:v1',
      priorRevisionId: null,
      prompt: 'Session RPE',
      type: 'scale',
      optional: true,
      timing: 'post_session',
      config: {
        min: 1,
        max: 10,
        step: 1,
        anchors: [
          { value: 1, label: 'Very easy' },
          { value: 10, label: 'Maximum effort' },
        ],
      },
      sourceKind: 'system',
      sourceActorId: null,
      sourceActorName: null,
      authoredAt,
    },
    {
      id: 'pain-discomfort',
      version: 1,
      revisionId: 'system:pain-discomfort:v1',
      priorRevisionId: null,
      prompt: 'Any pain or discomfort?',
      type: 'yes_no',
      optional: true,
      timing: 'post_session',
      config: {},
      sourceKind: 'system',
      sourceActorId: null,
      sourceActorName: null,
      authoredAt,
    },
    {
      id: 'session-context',
      version: 1,
      revisionId: 'system:session-context:v1',
      priorRevisionId: null,
      prompt: 'Anything that affected this session?',
      type: 'text',
      optional: true,
      timing: 'post_session',
      config: {},
      sourceKind: 'system',
      sourceActorId: null,
      sourceActorName: null,
      authoredAt,
    },
  ]);
