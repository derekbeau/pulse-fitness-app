import {
  nativeFeedbackResponseSchema,
  type WorkoutFeedbackAnswerRevision,
  type WorkoutFeedbackQuestionDefinition,
} from '@pulse/shared';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { CircleHelp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { ActiveWorkoutCustomFeedbackField, ActiveWorkoutFeedbackDraft } from '../types';

// Kept only for the legacy field adapter. Production session completion is driven by
// the frozen `questions` contract and therefore does not inherit this old energy control.
const LEGACY_STANDARD_FEEDBACK_QUESTIONS: ActiveWorkoutCustomFeedbackField[] = [
  {
    id: 'session-rpe',
    label: 'Session RPE',
    max: 10,
    min: 1,
    optional: false,
    type: 'scale',
    value: null,
  },
  {
    id: 'energy-post-workout',
    label: 'Energy post workout',
    optional: false,
    options: ['😫', '😕', '😐', '🙂', '💪'],
    type: 'emoji',
    value: null,
  },
  {
    id: 'pain-discomfort',
    label: 'Any pain or discomfort?',
    optional: false,
    type: 'yes_no',
    value: null,
  },
];

const RPE_SCALE_ANCHORS = [
  { rating: 6, description: 'Easy, plenty left in the tank' },
  { rating: 7, description: 'Moderate, solid work but comfortable' },
  { rating: 8, description: 'Hard, challenging but repeatable' },
  { rating: 9, description: 'Very hard, close to limit' },
  { rating: 10, description: 'Maximal, all-out effort' },
] as const;

type SessionFeedbackProps = {
  className?: string;
  draftKey?: string;
  fields?: ActiveWorkoutCustomFeedbackField[];
  questions?: WorkoutFeedbackQuestionDefinition[];
  serverAnswers?: WorkoutFeedbackAnswerRevision[];
  serverRevision?: number;
  heading?: string;
  kicker?: string;
  submitLabel?: string;
  onSaveDraft?: (feedback: ActiveWorkoutFeedbackDraft, expectedRevision: number) => Promise<number>;
  onSubmit: (
    feedback: ActiveWorkoutFeedbackDraft,
    expectedRevision: number,
  ) => void | Promise<void>;
};

export function SessionFeedback({
  className,
  draftKey,
  fields = [],
  questions,
  serverAnswers = [],
  serverRevision = 0,
  heading = 'How did this session feel?',
  kicker = 'Post-workout feedback',
  submitLabel = 'Finalize session',
  onSaveDraft,
  onSubmit,
}: SessionFeedbackProps) {
  const resolvedFields = questions
    ? questions.filter((question) => question.timing === 'post_session').map(questionToField)
    : mergeLegacyFeedbackFields(fields);
  const [feedback, persistFeedback] = useState<ActiveWorkoutFeedbackDraft>(() => {
    const empty = hydrateServerAnswers(resolvedFields.map(normalizeFeedbackField), serverAnswers);
    if (!draftKey) return empty;
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(draftKey) ?? 'null');
      const storedRevision =
        stored && typeof stored === 'object' && 'revision' in stored ? Number(stored.revision) : 0;
      const storedFields =
        stored && typeof stored === 'object' && 'fields' in stored && Array.isArray(stored.fields)
          ? stored.fields
          : Array.isArray(stored)
            ? stored
            : null;
      if (!storedFields || storedRevision < serverRevision) return empty;
      return empty.map((field) => {
        const candidate = storedFields.find(
          (entry) =>
            entry &&
            entry.id === field.id &&
            entry.type === field.type &&
            (field.definitionVersion === undefined ||
              entry.definitionVersion === field.definitionVersion),
        );
        if (
          !candidate ||
          !nativeFeedbackResponseSchema.safeParse({
            id: candidate.id,
            label: candidate.label,
            type: candidate.type,
            value: candidate.value,
            notes: candidate.notes,
            state: candidate.answerState,
          }).success
        )
          return field;
        return {
          ...field,
          value: candidate.value,
          notes: candidate.notes,
          answerState: candidate.answerState,
        };
      });
    } catch {
      return empty;
    }
  });
  const [currentRevision, setCurrentRevision] = useState(serverRevision);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const didMount = useRef(false);
  const onSaveDraftRef = useRef(onSaveDraft);
  const revisionRef = useRef(serverRevision);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveSequence = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const setFeedback: Dispatch<SetStateAction<ActiveWorkoutFeedbackDraft>> = (update) =>
    persistFeedback((current) => {
      const next = typeof update === 'function' ? update(current) : update;
      return next.map((field) =>
        field.value !== undefined && field.value !== null
          ? { ...field, answerState: 'answered' }
          : field,
      );
    });
  useEffect(() => {
    onSaveDraftRef.current = onSaveDraft;
  }, [onSaveDraft]);
  useEffect(() => {
    if (!draftKey) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ revision: currentRevision, fields: feedback }),
      );
    } catch {
      /* Current draft remains available when browser storage is unavailable. */
    }
  }, [currentRevision, draftKey, feedback]);

  const queueDraftSave = useCallback((draft: ActiveWorkoutFeedbackDraft) => {
    const saveDraft = onSaveDraftRef.current;
    if (!saveDraft) return Promise.resolve();
    const sequence = ++saveSequence.current;
    setIsSaving(true);
    const operation = saveQueue.current.then(async () => {
      const revision = await saveDraft(draft, revisionRef.current);
      revisionRef.current = revision;
      setCurrentRevision(revision);
      if (sequence === saveSequence.current) setSaveError(null);
    });
    saveQueue.current = operation.catch(() => undefined);
    void operation
      .catch(() => {
        if (sequence === saveSequence.current) {
          setSaveError('Draft not saved. Your answers remain here; retry before leaving.');
        }
      })
      .finally(() => {
        if (sequence === saveSequence.current) setIsSaving(false);
      });
    return operation;
  }, []);

  useEffect(() => {
    if (!onSaveDraftRef.current) return;
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void queueDraftSave(feedback);
    }, 450);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [feedback, queueDraftSave]);

  const flushAndSubmit = async () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (onSaveDraftRef.current) {
      try {
        await queueDraftSave(feedback);
      } catch {
        return;
      }
    }
    if (questions) {
      await onSubmit(feedback, revisionRef.current);
    } else {
      await (onSubmit as (draft: ActiveWorkoutFeedbackDraft) => void | Promise<void>)(feedback);
    }
  };

  const isComplete = feedback.every((field) => {
    if (field.optional || field.answerState === 'skipped') {
      return true;
    }

    switch (field.type) {
      case 'scale':
      case 'slider':
        return field.value !== null && field.value !== undefined;
      case 'text':
        return (field.value ?? '').trim().length > 0;
      case 'yes_no':
        return field.value !== null && field.value !== undefined;
      case 'emoji':
        return (field.value ?? '').trim().length > 0;
      case 'multi_select':
        return (field.value ?? []).length > 0;
      default:
        return false;
    }
  });

  return (
    <Card className={cn('overflow-hidden py-0 shadow-sm', className)}>
      <CardHeader className="gap-3 border-b border-border bg-[var(--color-accent-pink)] py-6 text-on-pink dark:border-b-border dark:bg-card dark:text-foreground">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-[0.22em] uppercase opacity-70 dark:text-muted dark:opacity-100">
            {kicker}
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">{heading}</h2>
          <p className="max-w-2xl text-sm opacity-75 dark:text-muted dark:opacity-100">
            Capture the session check-ins before you wrap the workout.
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-5 py-5 sm:px-6">
        {feedback.map((field) => (
          <section
            className="min-w-0 rounded-3xl border border-border bg-secondary/25 p-4"
            key={`${field.id}:${field.definitionVersion ?? 'legacy'}`}
          >
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-foreground">{field.label}</h3>
                  {field.id === 'session-rpe' ? <RpeScaleHelp /> : null}
                </div>
                <p className="text-sm text-muted">{getFeedbackDescription(field)}</p>
                {getContextDescription(field) ? (
                  <p className="text-xs text-muted">{getContextDescription(field)}</p>
                ) : null}
              </div>

              {renderFeedbackInput(field, setFeedback)}
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted" aria-live="polite">
                  {field.answerState === 'skipped'
                    ? 'Skipped — unknown'
                    : field.value === null || field.value === undefined
                      ? 'Unanswered'
                      : 'Answered'}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    persistFeedback((current) =>
                      current.map((entry) =>
                        entry.id === field.id
                          ? { ...entry, value: undefined, answerState: 'skipped' }
                          : entry,
                      ),
                    )
                  }
                >
                  Skip {field.label}
                </Button>
              </div>

              {field.id === 'pain-discomfort' && field.type === 'yes_no' && field.value === true ? (
                <div className="space-y-2">
                  <label
                    className="text-xs font-semibold tracking-[0.18em] text-muted uppercase"
                    htmlFor="pain-discomfort-details"
                  >
                    Pain/discomfort details
                  </label>
                  <Textarea
                    id="pain-discomfort-details"
                    onChange={(event) =>
                      setFeedback((current) =>
                        current.map((entry) =>
                          entry.id === field.id && entry.type === 'yes_no'
                            ? {
                                ...entry,
                                notes: event.target.value,
                              }
                            : entry,
                        ),
                      )
                    }
                    placeholder="Describe where it happened and what movements triggered it."
                    value={field.notes ?? ''}
                  />
                </div>
              ) : null}

              {!(
                field.id === 'pain-discomfort' &&
                field.type === 'yes_no' &&
                field.value === true
              ) && field.type !== 'text' ? (
                <div className="space-y-2">
                  <label
                    className="text-xs font-semibold tracking-[0.18em] text-muted uppercase"
                    htmlFor={`${field.id}-notes`}
                  >
                    Optional notes
                  </label>
                  <Textarea
                    id={`${field.id}-notes`}
                    onChange={(event) =>
                      setFeedback((current) =>
                        current.map((entry) =>
                          entry.id === field.id
                            ? {
                                ...entry,
                                notes: event.target.value,
                              }
                            : entry,
                        ),
                      )
                    }
                    placeholder={`Add context about ${field.label.toLowerCase()} if it mattered today.`}
                    value={field.notes ?? ''}
                  />
                </div>
              ) : null}
            </div>
          </section>
        ))}

        <div aria-live="polite" className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {saveError ??
            (isSaving ? 'Saving draft…' : onSaveDraft ? 'Draft saved to this session.' : '')}
          {saveError ? (
            <Button
              disabled={isSaving}
              onClick={() => void queueDraftSave(feedback)}
              size="sm"
              type="button"
              variant="outline"
            >
              Retry save
            </Button>
          ) : null}
        </div>

        <Button
          className="w-full sm:w-auto"
          disabled={!isComplete || isSaving}
          onClick={() => void flushAndSubmit()}
          type="button"
        >
          {submitLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

function questionToField(
  question: WorkoutFeedbackQuestionDefinition,
): ActiveWorkoutCustomFeedbackField {
  const common = {
    id: question.id,
    label: question.prompt,
    optional: question.optional,
    definitionVersion: question.version,
    timing: question.timing,
    anchors: 'anchors' in question.config ? question.config.anchors : undefined,
    exerciseNameSnapshot: question.exerciseNameSnapshot,
    bodyRegion: question.bodyRegion,
    laterality: question.laterality,
    contextLabel: question.contextLabel,
  };
  switch (question.type) {
    case 'scale':
      return {
        ...common,
        type: 'scale',
        min: question.config.min,
        max: question.config.max,
        step: question.config.step,
      };
    case 'slider':
      return {
        ...common,
        type: 'slider',
        min: question.config.min,
        max: question.config.max,
        step: question.config.step,
      };
    case 'emoji':
      return { ...common, type: 'emoji', options: question.config.options };
    case 'multi_select':
      return {
        ...common,
        type: 'multi_select',
        options: question.config.options,
        exclusiveOption: question.config.exclusiveOption,
      };
    case 'yes_no':
      return { ...common, type: 'yes_no' };
    case 'text':
      return { ...common, type: 'text' };
  }
}

function mergeLegacyFeedbackFields(fields: ActiveWorkoutCustomFeedbackField[]) {
  const standardIds = new Set(LEGACY_STANDARD_FEEDBACK_QUESTIONS.map((field) => field.id));
  return [
    ...LEGACY_STANDARD_FEEDBACK_QUESTIONS,
    ...fields.filter((field) => !standardIds.has(field.id)),
  ];
}

function hydrateServerAnswers(
  fields: ActiveWorkoutCustomFeedbackField[],
  answers: WorkoutFeedbackAnswerRevision[],
) {
  return fields.map((field) => {
    const answer = answers.find(
      (candidate) =>
        candidate.questionId === field.id &&
        candidate.definitionVersion === (field.definitionVersion ?? 1),
    );
    return answer
      ? {
          ...field,
          value: answer.value as ActiveWorkoutCustomFeedbackField['value'],
          notes: answer.notes,
          answerState: answer.state,
        }
      : field;
  }) as ActiveWorkoutCustomFeedbackField[];
}

function normalizeFeedbackField(
  field: ActiveWorkoutCustomFeedbackField,
): ActiveWorkoutCustomFeedbackField {
  switch (field.type) {
    case 'scale':
      return {
        ...field,
        notes: '',
        value: null,
      };
    case 'text':
      return {
        ...field,
        notes: '',
        value: undefined,
      };
    case 'yes_no':
      return {
        ...field,
        notes: '',
        value: null,
      };
    case 'emoji':
      return {
        ...field,
        notes: '',
        value: null,
      };
    case 'slider':
      return {
        ...field,
        notes: '',
        step: field.step ?? 1,
        value: null,
      };
    case 'multi_select':
      return {
        ...field,
        notes: '',
        value: undefined,
      };
    default:
      return field;
  }
}

function getFeedbackDescription(field: ActiveWorkoutCustomFeedbackField) {
  switch (field.type) {
    case 'scale':
      return `Rate ${field.label.toLowerCase()} from ${field.min} to ${field.max}.`;
    case 'text':
      if (isCoachNoteField(field)) {
        return 'What should we remember next time? Add a carry-forward coaching or programming note.';
      }

      return `Add a note for ${field.label.toLowerCase()}.`;
    case 'yes_no':
      return 'Select yes or no.';
    case 'emoji':
      return 'Choose the option that best matches how you felt.';
    case 'slider':
      return `Slide from ${field.min} to ${field.max}.`;
    case 'multi_select':
      return 'Select all that apply.';
    default:
      return '';
  }
}

function getContextDescription(field: ActiveWorkoutCustomFeedbackField) {
  return [field.contextLabel, field.exerciseNameSnapshot, field.bodyRegion, field.laterality]
    .filter(Boolean)
    .join(' · ');
}

function renderFeedbackInput(
  field: ActiveWorkoutCustomFeedbackField,
  setFeedback: Dispatch<SetStateAction<ActiveWorkoutFeedbackDraft>>,
) {
  switch (field.type) {
    case 'scale': {
      const scaleStep = field.step ?? 1;
      return (
        <div className="space-y-2">
          <div aria-label={`${field.label} rating`} className="flex flex-wrap gap-2" role="group">
            {Array.from(
              { length: Math.floor((field.max - field.min) / scaleStep) + 1 },
              (_, index) => field.min + index * scaleStep,
            ).map((score) => {
              const isSelected = field.value === score;
              const anchor = field.anchors?.find((candidate) => candidate.value === score);

              return (
                <Button
                  aria-pressed={isSelected}
                  aria-label={anchor ? `${score}: ${anchor.label}` : String(score)}
                  className={cn('min-w-11', getFeedbackOptionClassName(isSelected))}
                  key={score}
                  onClick={() =>
                    setFeedback((current) =>
                      current.map((entry) =>
                        entry.id === field.id && entry.type === 'scale'
                          ? { ...entry, value: score }
                          : entry,
                      ),
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {score}
                </Button>
              );
            })}
          </div>
          {field.anchors?.length ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {field.anchors.map((anchor) => (
                <span className="break-words" key={`${anchor.value}:${anchor.label}`}>
                  <span className="font-medium text-foreground">{anchor.value}</span>
                  {`: ${anchor.label}`}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    }
    case 'text':
      return (
        <Textarea
          aria-label={field.label}
          id={`${field.id}-value`}
          onChange={(event) =>
            setFeedback((current) =>
              current.map((entry) =>
                entry.id === field.id && entry.type === 'text'
                  ? {
                      ...entry,
                      value: event.target.value === '' ? undefined : event.target.value,
                      answerState: event.target.value === '' ? 'unanswered' : 'answered',
                    }
                  : entry,
              ),
            )
          }
          placeholder={
            isCoachNoteField(field)
              ? 'What should we remember next time? Add a carry-forward coaching or programming note.'
              : `Add your ${field.label.toLowerCase()} notes.`
          }
          value={field.value ?? ''}
        />
      );
    case 'yes_no':
      return (
        <div aria-label={`${field.label} response`} className="flex gap-2" role="group">
          <Button
            aria-pressed={field.value === true}
            className={getFeedbackOptionClassName(field.value === true)}
            onClick={() =>
              setFeedback((current) =>
                current.map((entry) =>
                  entry.id === field.id && entry.type === 'yes_no'
                    ? { ...entry, value: true }
                    : entry,
                ),
              )
            }
            type="button"
            variant="outline"
          >
            Yes
          </Button>
          <Button
            aria-pressed={field.value === false}
            className={getFeedbackOptionClassName(field.value === false)}
            onClick={() =>
              setFeedback((current) =>
                current.map((entry) =>
                  entry.id === field.id && entry.type === 'yes_no'
                    ? { ...entry, value: false }
                    : entry,
                ),
              )
            }
            type="button"
            variant="outline"
          >
            No
          </Button>
        </div>
      );
    case 'emoji':
      return (
        <div aria-label={`${field.label} options`} className="flex flex-wrap gap-2" role="group">
          {field.options.map((option) => {
            const isSelected = field.value === option;

            return (
              <Button
                aria-label={option}
                aria-pressed={isSelected}
                className={cn('min-w-11 px-3', getFeedbackOptionClassName(isSelected))}
                key={option}
                onClick={() =>
                  setFeedback((current) =>
                    current.map((entry) =>
                      entry.id === field.id && entry.type === 'emoji'
                        ? { ...entry, value: option }
                        : entry,
                    ),
                  )
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <span aria-hidden="true" className="text-lg leading-none">
                  {option}
                </span>
                <span className="sr-only">Option {option}</span>
              </Button>
            );
          })}
        </div>
      );
    case 'slider':
      return (
        <div className="space-y-2">
          <input
            aria-label={`${field.label} slider`}
            className="h-2 w-full cursor-pointer accent-[var(--color-accent-peach)]"
            max={field.max}
            min={field.min}
            onChange={(event) => {
              const nextValue = Number(event.target.value);

              setFeedback((current) =>
                current.map((entry) =>
                  entry.id === field.id && entry.type === 'slider'
                    ? { ...entry, value: Number.isNaN(nextValue) ? null : nextValue }
                    : entry,
                ),
              );
            }}
            step={field.step ?? 1}
            type="range"
            value={field.value ?? field.min}
          />
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{field.min}</span>
            <span className="font-medium text-foreground">{field.value ?? '-'}</span>
            <span>{field.max}</span>
          </div>
          {field.anchors?.length ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {field.anchors.map((anchor) => (
                <span className="break-words" key={`${anchor.value}:${anchor.label}`}>
                  <span className="font-medium text-foreground">{anchor.value}</span>
                  {`: ${anchor.label}`}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    case 'multi_select':
      return (
        <div aria-label={`${field.label} options`} className="flex flex-wrap gap-2" role="group">
          {field.options.map((option) => {
            const selectedValues = field.value ?? [];
            const isSelected = selectedValues.includes(option);

            return (
              <Button
                aria-pressed={isSelected}
                className={getFeedbackOptionClassName(isSelected)}
                key={option}
                onClick={() =>
                  setFeedback((current) =>
                    current.map((entry) => {
                      if (entry.id !== field.id || entry.type !== 'multi_select') {
                        return entry;
                      }

                      return {
                        ...entry,
                        value: (entry.value ?? []).includes(option)
                          ? (entry.value ?? []).filter((item) => item !== option)
                          : option === entry.exclusiveOption
                            ? [option]
                            : [
                                ...(entry.value ?? []).filter(
                                  (item) => item !== entry.exclusiveOption,
                                ),
                                option,
                              ],
                      };
                    }),
                  )
                }
                size="sm"
                type="button"
                variant="outline"
              >
                {option}
              </Button>
            );
          })}
        </div>
      );
    default:
      return null;
  }
}

function isCoachNoteField(field: ActiveWorkoutCustomFeedbackField) {
  const normalizedId = field.id.trim().toLowerCase();
  const normalizedLabel = field.label.trim().toLowerCase().replace(/\s+/g, ' ');

  return (
    normalizedId === 'coach-note' ||
    normalizedId === 'session-note' ||
    normalizedLabel === 'coach note'
  );
}

function getFeedbackOptionClassName(isSelected: boolean) {
  return cn(
    'border transition-all active:scale-[0.98]',
    isSelected
      ? 'border-[var(--color-accent-peach)] bg-[var(--color-accent-peach)] text-on-peach shadow-[0_0_0_1px_var(--color-accent-peach)] hover:bg-[var(--color-accent-peach)]/90 dark:border-[var(--color-accent-cream)] dark:bg-[var(--color-accent-cream)]/25 dark:text-[var(--color-accent-cream)] dark:shadow-[0_0_0_1px_var(--color-accent-cream)] dark:hover:bg-[var(--color-accent-cream)]/35'
      : 'border-border bg-background text-foreground hover:bg-accent/70 hover:text-accent-foreground',
  );
}

function RpeScaleHelp() {
  return (
    <div className="flex items-center">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Session RPE scale anchors"
              className="hidden h-9 w-9 p-0 text-muted sm:inline-flex"
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <CircleHelp className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            className="max-w-xs space-y-2 bg-card p-3 text-foreground shadow-xl ring-1 ring-border"
            side="top"
            sideOffset={8}
          >
            <p className="text-xs font-semibold tracking-[0.18em] uppercase text-muted">
              Session RPE Guide
            </p>
            <RpeScaleAnchorList />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog>
        <DialogTrigger asChild>
          <Button
            aria-label="Open Session RPE guide"
            className="h-9 w-9 p-0 text-muted sm:hidden"
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <CircleHelp className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="self-end rounded-t-2xl rounded-b-none border-b-0 p-5 sm:self-center sm:rounded-lg sm:border-b sm:p-6">
          <DialogHeader>
            <DialogTitle>Session RPE Guide</DialogTitle>
            <DialogDescription className="sr-only">
              This guide explains the Rate of Perceived Exertion scale so you can score your session
              consistently.
            </DialogDescription>
          </DialogHeader>
          <RpeScaleAnchorList />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RpeScaleAnchorList() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">Below 6: Very light effort or warm-up pace.</p>
      <ul className="space-y-2 text-sm text-muted">
        {RPE_SCALE_ANCHORS.map((anchor) => (
          <li className="flex gap-2" key={anchor.rating}>
            <span className="font-semibold text-foreground">{anchor.rating}</span>
            <span>{anchor.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
