import { z } from 'zod';

export const feedbackConstructSchema = z.enum(['energy', 'recovery', 'technique']);
export const feedbackSourceSchema = z.enum([
  'explicit_user_response',
  'explicit_agent_or_other_response',
  'same_construct_documented_mapping',
  'legacy_derived',
  'legacy_unknown',
  'unknown',
]);
export const feedbackAnswerStateSchema = z.enum(['answered', 'unanswered', 'skipped', 'unknown']);
const rawString = z.string().max(4000);
export const nativeFeedbackResponseSchema = z
  .object({
    id: z.string().min(1).max(255),
    label: z.string().min(1).max(255),
    type: z.enum(['scale', 'slider', 'text', 'yes_no', 'emoji', 'multi_select']),
    value: z
      .union([z.number().finite(), z.boolean(), rawString, z.array(rawString).max(20), z.null()])
      .optional(),
    notes: rawString.optional(),
    state: feedbackAnswerStateSchema.optional(),
    construct: feedbackConstructSchema.optional(),
    revisionId: z.string().min(1).max(255).optional(),
  })
  .strict()
  .superRefine((response, context) => {
    if (
      (['session-rpe', 'pain-discomfort'].includes(response.id) &&
        response.construct !== undefined) ||
      (response.id === 'energy-post-workout' &&
        response.construct !== undefined &&
        response.construct !== 'energy')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['construct'],
        message: 'Reserved native questions cannot be relabeled as another construct.',
      });
    }
    if (response.value === null || response.value === undefined) return;
    const valid =
      response.type === 'scale' || response.type === 'slider'
        ? typeof response.value === 'number'
        : response.type === 'yes_no'
          ? typeof response.value === 'boolean'
          : response.type === 'multi_select'
            ? Array.isArray(response.value)
            : typeof response.value === 'string';
    if (!valid)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Value must match the native response type.',
      });
    if (response.state && response.state !== 'answered')
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['state'],
        message: 'A supplied native value cannot be marked unanswered, skipped, or unknown.',
      });
  });
export const feedbackRatingProvenanceSchema = z
  .object({
    source: feedbackSourceSchema,
    sourceResponseId: z.string().nullable(),
    sourceRevisionId: z.string().nullable(),
    sourceKind: z.enum(['user', 'agent_token', 'other', 'unknown']),
    actorId: z.string().nullable(),
    schemaVersion: z.literal(2),
    mappingVersion: z.string().nullable(),
    reason: z.string(),
    classifiedAt: z.string().datetime(),
  })
  .strict();
export const provenanceSafeFeedbackSchema = z
  .object({
    schemaVersion: z.literal(2),
    energy: z.number().int().min(1).max(5).nullable(),
    recovery: z.number().int().min(1).max(5).nullable(),
    technique: z.number().int().min(1).max(5).nullable(),
    provenance: z
      .object({
        energy: feedbackRatingProvenanceSchema,
        recovery: feedbackRatingProvenanceSchema,
        technique: feedbackRatingProvenanceSchema,
      })
      .strict(),
    notes: rawString.optional(),
    responses: z.array(nativeFeedbackResponseSchema).max(50),
  })
  .strict();
export type ProvenanceSafeFeedback = z.infer<typeof provenanceSafeFeedbackSchema>;
export type NativeFeedbackResponse = z.infer<typeof nativeFeedbackResponseSchema>;
export type FeedbackConstruct = z.infer<typeof feedbackConstructSchema>;
export type FeedbackActor = { kind: 'user' | 'agent_token' | 'other'; id: string };

export const ENERGY_EMOJI_MAPPING_VERSION = 'pulse-energy-emoji-v1';
const energyEmojiRatings: Readonly<Record<string, number>> = {
  '😫': 1,
  '😕': 2,
  '😐': 3,
  '🙂': 4,
  '💪': 5,
};
const constructs = ['energy', 'recovery', 'technique'] as const;

/** Only an explicit construct declaration or the documented standard energy ID is eligible.
 * Labels, positions, pain, effort, completed sets and matching summary numbers are never sources.
 */
export function classifyNativeFeedback(
  input: {
    responses?: NativeFeedbackResponse[];
    notes?: string;
    energy?: number | null;
    recovery?: number | null;
    technique?: number | null;
  },
  options: { classifiedAt: string; actor?: FeedbackActor; legacy?: boolean },
): ProvenanceSafeFeedback {
  const responses = z
    .array(nativeFeedbackResponseSchema)
    .max(50)
    .parse(input.responses ?? []);
  const ratings = { energy: null, recovery: null, technique: null } as Pick<
    ProvenanceSafeFeedback,
    FeedbackConstruct
  >;
  const provenance = {} as ProvenanceSafeFeedback['provenance'];
  for (const construct of constructs) {
    const sources = responses.filter(
      (response) =>
        response.construct === construct ||
        (construct === 'energy' &&
          response.id === 'energy-post-workout' &&
          response.type === 'emoji'),
    );
    const response = sources.length === 1 ? sources[0] : undefined;
    const answered =
      response &&
      (response.state === 'answered' ||
        (!response.state && response.value !== null && response.value !== undefined));
    const mapped =
      answered &&
      construct === 'energy' &&
      response.type === 'emoji' &&
      typeof response.value === 'string'
        ? energyEmojiRatings[response.value]
        : undefined;
    const native =
      answered &&
      (response.type === 'scale' || response.type === 'slider') &&
      typeof response.value === 'number' &&
      Number.isInteger(response.value) &&
      response.value >= 1 &&
      response.value <= 5
        ? response.value
        : undefined;
    const valid = options.actor !== undefined && (mapped !== undefined || native !== undefined);
    ratings[construct] = valid ? (mapped ?? native ?? null) : null;
    provenance[construct] = {
      source: valid
        ? mapped !== undefined
          ? 'same_construct_documented_mapping'
          : options.actor?.kind === 'user'
            ? 'explicit_user_response'
            : 'explicit_agent_or_other_response'
        : options.legacy
          ? 'legacy_unknown'
          : 'unknown',
      sourceResponseId: response?.id ?? null,
      sourceRevisionId: response?.revisionId ?? null,
      sourceKind: options.actor?.kind ?? 'unknown',
      actorId: options.actor?.id ?? null,
      schemaVersion: 2,
      mappingVersion: valid && mapped !== undefined ? ENERGY_EMOJI_MAPPING_VERSION : null,
      reason: valid
        ? 'Explicit same-construct native answer with evidenced actor.'
        : sources.length > 1
          ? 'Conflicting source responses; no supersession relation proves precedence.'
          : !options.actor
            ? 'Source actor is not evidenced; numeric summaries cannot prove provenance.'
            : 'No valid explicit same-construct answer.',
      classifiedAt: options.classifiedAt,
    };
  }
  return provenanceSafeFeedbackSchema.parse({
    schemaVersion: 2,
    ...ratings,
    provenance,
    responses,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  });
}

/** Recompute from source, then require exact rating/provenance agreement. Never trust metadata alone. */
export function actionableFeedbackRating(
  feedback: ProvenanceSafeFeedback,
  construct: FeedbackConstruct,
): number | null {
  const provenance = feedback.provenance[construct];
  if (
    ![
      'explicit_user_response',
      'explicit_agent_or_other_response',
      'same_construct_documented_mapping',
    ].includes(provenance.source) ||
    provenance.sourceKind === 'unknown' ||
    !provenance.actorId
  )
    return null;
  const expected = classifyNativeFeedback(feedback, {
    classifiedAt: provenance.classifiedAt,
    actor: { kind: provenance.sourceKind, id: provenance.actorId },
  });
  return expected[construct] === feedback[construct] &&
    JSON.stringify(expected.provenance[construct]) === JSON.stringify(provenance)
    ? expected[construct]
    : null;
}

export const feedbackNoteReviewSchema = z.array(
  z.object({
    id: z.string(),
    state: z.enum(['pending_review', 'superseded']),
    reason: z.string(),
    field: z.string().optional(),
    sourceKey: z.string().nullable().optional(),
    actionable: z.literal(false).optional(),
  }),
);
