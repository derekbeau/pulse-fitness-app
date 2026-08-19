import { useState } from 'react';
import {
  addCalendarDays,
  type AdaptiveReviewActionInput,
  type AdaptiveReviewTargetProposal,
  type AdaptiveWeeklyReview,
} from '@pulse/shared';
import {
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Gauge,
  History,
  MessageCircleQuestion,
  Pencil,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api-client';

import {
  formatAdaptiveCalories,
  formatAdaptiveDate,
  formatAdaptiveWeight,
  formatAdaptiveWeightChange,
  formatAdaptiveWeightDelta,
} from '../lib/format-adaptive-nutrition';

type ReviewActionHandler = (input: AdaptiveReviewActionInput) => Promise<void>;
type ReviewActionResultHandler = (input: AdaptiveReviewActionInput) => Promise<boolean>;
type DeferCondition = Extract<AdaptiveReviewActionInput, { type: 'defer' }>['condition'];
type DeferEvidence = Extract<DeferCondition, { kind: 'until_evidence' }>['evidence'];

const deferEvidenceOptions: Array<{ label: string; value: DeferEvidence }> = [
  { label: 'Next complete nutrition day', value: 'next_complete_nutrition_day' },
  { label: 'Next weigh-in', value: 'next_weigh_in' },
  { label: 'Nutrition eligibility restored', value: 'nutrition_eligibility_restored' },
  { label: 'Weight freshness restored', value: 'weight_freshness_restored' },
];

const outcomeCopy = {
  keep: 'Keep',
  adjust: 'Adjust',
  defer: 'Defer',
  clarify: 'Clarify',
  goal_review: 'Goal review',
  training_review: 'Training review',
} as const;

const stateCopy = {
  pending: 'Ready for your decision',
  awaiting_clarification: 'Awaiting clarification',
  deferred: 'Deferred',
  accepted: 'Accepted',
  declined: 'Declined',
  superseded: 'Superseded',
  stale: 'Needs refresh',
} as const;

export function WeeklyDecisionBrief({
  isPending,
  onAction,
  onRefresh,
  review,
}: {
  isPending: boolean;
  onAction: ReviewActionHandler;
  onRefresh?: () => Promise<void>;
  review: AdaptiveWeeklyReview;
}) {
  const recommendation = review.snapshot.modules.find((module) => module.kind === 'recommendation');
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [sameDateConflict, setSameDateConflict] = useState(false);
  const serverStale = review.state === 'stale';
  const staleMessage =
    'A source record changed after this review was prepared. Refresh the review before making a plan decision.';

  if (!recommendation || recommendation.kind !== 'recommendation') return null;

  const run = async (input: AdaptiveReviewActionInput) => {
    setError(null);
    try {
      await onAction(input);
      setSameDateConflict(false);
      return true;
    } catch (cause) {
      const isStale = cause instanceof ApiError && cause.code === 'ADAPTIVE_REVIEW_STALE';
      const isSameDateConflict =
        cause instanceof ApiError && cause.code === 'SAME_DATE_TARGET_EXISTS';
      setStale(isStale);
      setSameDateConflict(isSameDateConflict);
      setError(
        isStale
          ? staleMessage
          : isSameDateConflict
            ? 'A nutrition target already exists for this date. Review it before explicitly replacing it with this accepted proposal.'
            : cause instanceof Error
              ? cause.message
              : 'The review action could not be saved.',
      );
      return false;
    }
  };
  const refresh = async () => {
    if (!onRefresh) return;
    try {
      await onRefresh();
      setStale(false);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The review could not be refreshed.');
    }
  };

  return (
    <article
      aria-labelledby={`weekly-review-${review.id}`}
      aria-busy={isPending}
      className="min-w-0 overflow-hidden rounded-[1.75rem] border border-primary/25 bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-primary)_11%,var(--color-card)),var(--color-card)_48%)] shadow-[0_24px_80px_-52px_var(--color-primary)]"
      data-slot="weekly-decision-review"
    >
      <div className="border-b border-border/60 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1.5 rounded-full px-3 py-1">
              <Sparkles aria-hidden="true" className="size-3.5" />
              Weekly decision review
            </Badge>
            <Badge className="rounded-full" variant="outline">
              {stateCopy[review.state]}
            </Badge>
          </div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Bot aria-hidden="true" className="size-3.5" />
            Agent-prepared · You approve
          </p>
        </div>

        <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              What changed
            </p>
            <h2
              className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl"
              id={`weekly-review-${review.id}`}
            >
              {recommendation.headline}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {recommendation.explanation}
            </p>
          </div>
          <div className="flex min-w-36 items-center gap-3 rounded-2xl border border-border/70 bg-background/55 px-4 py-3">
            <Gauge aria-hidden="true" className="size-5 text-primary" />
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Confidence
              </p>
              <p className="mt-0.5 text-sm font-semibold">
                {review.snapshot.confidenceLabel ?? 'Developing'}
                {review.snapshot.confidenceScore === null
                  ? ''
                  : ` · ${Math.round(review.snapshot.confidenceScore * 100)}%`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 px-5 py-5 sm:px-7 sm:py-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(17rem,0.85fr)]">
        <div className="min-w-0 space-y-5">
          <section aria-labelledby={`review-targets-${review.id}`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold" id={`review-targets-${review.id}`}>
                Current → proposed targets
              </h3>
              <Badge variant="outline">{outcomeCopy[recommendation.outcome]}</Badge>
            </div>
            <TargetComparison
              current={recommendation.currentTarget}
              proposed={review.effectiveProposal}
            />
          </section>

          <section
            aria-labelledby={`review-why-${review.id}`}
            className="rounded-2xl border border-border/70 bg-background/45 p-4"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
              <h3 className="text-sm font-semibold" id={`review-why-${review.id}`}>
                Why Pulse recommends this
              </h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {review.snapshot.summary}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {recommendation.causalBreakdown.includedNutritionDates.length} nutrition days and{' '}
              {recommendation.causalBreakdown.includedWeightDates.length} weigh-ins were included;
              excluded and cutoff records remain visible in the full evidence.
            </p>
          </section>
        </div>

        <div className="min-w-0 space-y-3 rounded-2xl border border-border/70 bg-background/45 p-4 sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Your decision
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Nothing changes by opening this review. Accept is the only action that applies a
              nutrition plan.
            </p>
          </div>
          <ReviewActions
            disabled={
              isPending ||
              stale ||
              serverStale ||
              sameDateConflict ||
              review.availableActions.length === 0
            }
            onAction={run}
            review={review}
            error={error}
          />
          {error || serverStale ? (
            <div
              className="rounded-xl border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive"
              role="alert"
            >
              <p>{error ?? staleMessage}</p>
              {stale || serverStale ? (
                <Button
                  className="mt-3 min-h-11"
                  disabled={isPending || !onRefresh}
                  onClick={() => void refresh()}
                  type="button"
                  variant="outline"
                >
                  Refresh review
                </Button>
              ) : sameDateConflict ? (
                <Button
                  className="mt-3 min-h-11"
                  disabled={isPending}
                  onClick={() =>
                    void run({
                      type: 'accept',
                      expectedFingerprint: review.sourceFingerprint,
                      expectedActionSequence: review.actionSequence,
                      replaceSameDateTarget: true,
                    })
                  }
                  type="button"
                  variant="destructive"
                >
                  Replace today’s target
                </Button>
              ) : null}
            </div>
          ) : null}
          <Button asChild className="min-h-11 w-full justify-between" variant="ghost">
            <Link to={`/nutrition/reviews/${review.id}`}>
              Review all evidence
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {isPending ? 'Saving weekly review action' : ''}
      </p>
    </article>
  );
}

function TargetComparison({
  current,
  proposed,
}: {
  current: AdaptiveReviewTargetProposal | null;
  proposed: AdaptiveReviewTargetProposal | null;
}) {
  const rows = [
    ['Calories', current?.calories, proposed?.calories, 'kcal'],
    ['Protein', current?.protein, proposed?.protein, 'g'],
    ['Carbohydrates', current?.carbs, proposed?.carbs, 'g'],
    ['Fat', current?.fat, proposed?.fat, 'g'],
  ] as const;
  return (
    <dl className="mt-3 grid min-w-0 gap-2" aria-label="Current and proposed nutrition targets">
      {rows.map(([label, before, after, unit]) => {
        const effective = after ?? before;
        const delta = before === undefined || effective === undefined ? null : effective - before;
        return (
          <div
            className="grid min-w-0 grid-cols-[minmax(6.5rem,1fr)_minmax(0,0.8fr)_auto_minmax(0,0.8fr)] items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-sm"
            key={label}
          >
            <dt className="truncate font-medium">{label}</dt>
            <dd className="text-right text-muted-foreground">
              {before === undefined ? '—' : `${Math.round(before)} ${unit}`}
              <span className="sr-only"> current</span>
            </dd>
            <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
            <dd className="text-right font-semibold">
              {effective === undefined ? '—' : `${Math.round(effective)} ${unit}`}
              {delta === null || delta === 0 ? null : (
                <span className="ml-1 text-xs text-primary">
                  ({delta > 0 ? '+' : ''}
                  {Math.round(delta)})
                </span>
              )}
              <span className="sr-only"> proposed</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function ReviewActions({
  disabled,
  error,
  onAction,
  review,
}: {
  disabled: boolean;
  error: string | null;
  onAction: ReviewActionResultHandler;
  review: AdaptiveWeeklyReview;
}) {
  const expected = {
    expectedFingerprint: review.sourceFingerprint,
    expectedActionSequence: review.actionSequence,
  };
  const can = (type: AdaptiveWeeklyReview['availableActions'][number]) =>
    review.availableActions.includes(type);
  const acceptLabel = review.effectiveProposal
    ? 'Accept and apply targets'
    : 'Accept and keep current plan';

  return (
    <div className="grid gap-2" aria-label="Weekly review actions">
      <Button
        className="min-h-11 w-full"
        disabled={disabled || !can('accept')}
        onClick={() => void onAction({ type: 'accept', ...expected })}
        type="button"
      >
        <Check aria-hidden="true" />
        {acceptLabel}
      </Button>
      <EditProposalDialog
        disabled={disabled || !can('edit')}
        error={error}
        onAction={onAction}
        review={review}
      />
      <DeferReviewDialog
        disabled={disabled || !can('defer')}
        error={error}
        onAction={onAction}
        review={review}
      />
      <AskAgentDialog
        disabled={disabled || !can('ask_agent')}
        error={error}
        onAction={onAction}
        review={review}
      />
      <DeclineDialog
        disabled={disabled || !can('decline')}
        error={error}
        onAction={onAction}
        review={review}
      />
    </div>
  );
}

function EditProposalDialog({
  disabled,
  error,
  onAction,
  review,
}: {
  disabled: boolean;
  error: string | null;
  onAction: ReviewActionResultHandler;
  review: AdaptiveWeeklyReview;
}) {
  const proposal = review.effectiveProposal;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(proposal);
  const [reason, setReason] = useState('User-adjusted within the review guardrails.');
  const [submitting, setSubmitting] = useState(false);
  if (!proposal) return null;

  const submit = async () => {
    if (!values) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      const saved = await onAction({
        type: 'edit',
        expectedFingerprint: review.sourceFingerprint,
        expectedActionSequence: review.actionSequence,
        proposal: values,
        reason,
      });
      if (saved) setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-11 w-full" disabled={disabled} type="button" variant="outline">
          <Pencil aria-hidden="true" />
          Edit proposal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit this proposal</DialogTitle>
          <DialogDescription>
            Saving an edit does not apply it. Pulse validates the safety floor, ±500 kcal review
            bound, protein bound, and macro-calorie identity on the server.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="review-calories">Calories</Label>
          <Input
            id="review-calories"
            min={1200}
            onChange={(event) => {
              const calories = Number(event.target.value);
              setValues((current) =>
                current
                  ? {
                      ...current,
                      calories,
                      carbs: proposal.carbs + (calories - proposal.calories) / 4,
                    }
                  : current,
              );
            }}
            step={4}
            type="number"
            value={values?.calories ?? ''}
          />
          <p className="text-xs text-muted-foreground">
            Protein and fat stay fixed; Pulse reconciles the calorie difference through
            carbohydrates.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="review-edit-reason">Why you changed it</Label>
          <Textarea
            id="review-edit-reason"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </div>
        <DialogActionError error={error} />
        <DialogFooter showCloseButton>
          <Button
            className="min-h-11"
            disabled={submitting}
            onClick={() => void submit()}
            type="button"
          >
            {submitting ? 'Saving edited proposal…' : 'Save edited proposal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeferReviewDialog({
  disabled,
  error,
  onAction,
  review,
}: {
  disabled: boolean;
  error: string | null;
  onAction: ReviewActionResultHandler;
  review: AdaptiveWeeklyReview;
}) {
  const [open, setOpen] = useState(false);
  const firstReturnDate = addCalendarDays(review.snapshot.reviewLocalDate, 1);
  const [mode, setMode] = useState<DeferCondition['kind']>('until_date');
  const [date, setDate] = useState(firstReturnDate);
  const [evidence, setEvidence] = useState<DeferEvidence | ''>('');
  const [reason, setReason] = useState('Wait for the next planned evidence point.');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const submit = async () => {
    if (submitting) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setValidationError('Add a reason for deferring this review.');
      return;
    }
    if (mode === 'until_date' && (!date || date < firstReturnDate)) {
      setValidationError(`Choose ${formatAdaptiveDate(firstReturnDate)} or a later date.`);
      return;
    }
    if (mode === 'until_evidence' && !evidence) {
      setValidationError('Choose the evidence that should return this review.');
      return;
    }
    const condition: DeferCondition =
      mode === 'until_date'
        ? { kind: 'until_date', localDate: date }
        : {
            kind: 'until_evidence',
            evidence: evidence as DeferEvidence,
            baselineFingerprint: review.sourceFingerprint,
          };
    setValidationError(null);
    setSubmitting(true);
    try {
      const saved = await onAction({
        type: 'defer',
        expectedFingerprint: review.sourceFingerprint,
        expectedActionSequence: review.actionSequence,
        condition,
        reason: trimmedReason,
      });
      if (saved) setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-11 w-full" disabled={disabled} type="button" variant="outline">
          <CalendarClock aria-hidden="true" />
          Defer review
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Defer this review</DialogTitle>
          <DialogDescription>
            The current plan stays unchanged. Return this same review on a program-local date or
            when selected evidence arrives; Pulse does not create duplicate reminders.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm font-medium">Return this review</p>
          <RadioGroup
            aria-describedby="review-defer-mode-help"
            aria-label="Review return condition"
            className="grid gap-2 sm:grid-cols-2"
            onValueChange={(value) => {
              if (value === 'until_date' || value === 'until_evidence') {
                setMode(value);
                setValidationError(null);
              }
            }}
            value={mode}
          >
            <Label
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border/80 p-3"
              htmlFor="review-defer-until-date"
            >
              <RadioGroupItem
                disabled={submitting}
                id="review-defer-until-date"
                value="until_date"
              />
              <span>On a date</span>
            </Label>
            <Label
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border/80 p-3"
              htmlFor="review-defer-until-evidence"
            >
              <RadioGroupItem
                disabled={submitting}
                id="review-defer-until-evidence"
                value="until_evidence"
              />
              <span>When evidence arrives</span>
            </Label>
          </RadioGroup>
          <p className="text-xs text-muted-foreground" id="review-defer-mode-help">
            Evidence-based deferrals return only after the selected source condition changes from
            the evidence saved with this review.
          </p>
        </div>
        {mode === 'until_date' ? (
          <div className="space-y-1.5">
            <Label htmlFor="review-defer-date">Return on</Label>
            <Input
              aria-describedby={validationError ? 'review-defer-validation' : undefined}
              aria-invalid={Boolean(validationError && (!date || date < firstReturnDate))}
              id="review-defer-date"
              className="min-h-11"
              disabled={submitting}
              min={firstReturnDate}
              onChange={(event) => {
                setDate(event.target.value);
                setValidationError(null);
              }}
              type="date"
              value={date}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">Evidence trigger</p>
            <RadioGroup
              aria-describedby={validationError ? 'review-defer-validation' : undefined}
              aria-invalid={Boolean(validationError && !evidence)}
              aria-label="Evidence trigger"
              className="grid gap-2"
              onValueChange={(value) => {
                setEvidence(value as DeferEvidence);
                setValidationError(null);
              }}
              value={evidence}
            >
              {deferEvidenceOptions.map((option) => {
                const id = `review-defer-evidence-${option.value}`;
                return (
                  <Label
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border/80 p-3"
                    htmlFor={id}
                    key={option.value}
                  >
                    <RadioGroupItem disabled={submitting} id={id} value={option.value} />
                    <span>{option.label}</span>
                  </Label>
                );
              })}
            </RadioGroup>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="review-defer-reason">Reason</Label>
          <Textarea
            aria-describedby={validationError ? 'review-defer-validation' : undefined}
            disabled={submitting}
            id="review-defer-reason"
            onChange={(event) => {
              setReason(event.target.value);
              setValidationError(null);
            }}
            value={reason}
          />
        </div>
        {validationError ? (
          <p
            className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive"
            id="review-defer-validation"
            role="alert"
          >
            {validationError}
          </p>
        ) : null}
        <DialogActionError error={error} />
        <DialogFooter showCloseButton>
          <Button
            className="min-h-11"
            disabled={submitting}
            onClick={() => void submit()}
            type="button"
          >
            {submitting ? 'Deferring review…' : 'Defer without changing plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AskAgentDialog({
  disabled,
  error,
  onAction,
  review,
}: {
  disabled: boolean;
  error: string | null;
  onAction: ReviewActionResultHandler;
  review: AdaptiveWeeklyReview;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('What should I understand before deciding?');
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const saved = await onAction({
        type: 'ask_agent',
        expectedActionSequence: review.actionSequence,
        question,
      });
      if (saved) setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-11 w-full" disabled={disabled} type="button" variant="outline">
          <MessageCircleQuestion aria-hidden="true" />
          Ask your agent
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save a question for your agent</DialogTitle>
          <DialogDescription>
            This creates one bounded question on the review for a connected AgentToken client. It is
            not a live chat and does not change your plan.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="review-question">Question</Label>
          <Textarea
            id="review-question"
            onChange={(event) => setQuestion(event.target.value)}
            value={question}
          />
        </div>
        <DialogActionError error={error} />
        <DialogFooter showCloseButton>
          <Button
            className="min-h-11"
            disabled={submitting}
            onClick={() => void submit()}
            type="button"
          >
            {submitting ? 'Saving question…' : 'Save question'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeclineDialog({
  disabled,
  error,
  onAction,
  review,
}: {
  disabled: boolean;
  error: string | null;
  onAction: ReviewActionResultHandler;
  review: AdaptiveWeeklyReview;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const saved = await onAction({
        type: 'decline',
        expectedFingerprint: review.sourceFingerprint,
        expectedActionSequence: review.actionSequence,
        reason: 'User declined this recommendation and kept the current plan.',
      });
      if (saved) setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="min-h-11 w-full" disabled={disabled} type="button" variant="ghost">
          <X aria-hidden="true" />
          Decline recommendation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keep the current plan?</DialogTitle>
          <DialogDescription>
            Pulse will preserve this evidence and your decision in history. It will not repeat the
            same recommendation for this weekly cycle.
          </DialogDescription>
        </DialogHeader>
        <DialogActionError error={error} />
        <DialogFooter showCloseButton>
          <Button
            className="min-h-11"
            disabled={submitting}
            onClick={() => void submit()}
            type="button"
            variant="destructive"
          >
            {submitting ? 'Declining recommendation…' : 'Decline and keep current'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogActionError({ error }: { error: string | null }) {
  return error ? (
    <p
      className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive"
      role="alert"
    >
      {error}
    </p>
  ) : null;
}

export function WeeklyReviewEvidence({ review }: { review: AdaptiveWeeklyReview }) {
  return (
    <article aria-labelledby={`review-evidence-${review.id}`} className="min-w-0 space-y-5">
      <header className="rounded-[1.75rem] border border-primary/20 bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{stateCopy[review.state]}</Badge>
          <Badge variant="outline">Immutable review · v{review.snapshot.version}</Badge>
        </div>
        <h2 className="mt-4 text-2xl font-semibold sm:text-3xl" id={`review-evidence-${review.id}`}>
          {review.snapshot.headline}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          {review.snapshot.summary}
        </p>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Review date" value={formatAdaptiveDate(review.snapshot.reviewLocalDate)} />
          <Meta
            label="Evidence window"
            value={`${formatAdaptiveDate(review.snapshot.analysisStart)} – ${formatAdaptiveDate(review.snapshot.analysisEnd)}`}
          />
          <Meta label="Time zone" value={review.snapshot.timeZone} />
          <Meta label="Fingerprint" value={`${review.sourceFingerprint.slice(0, 12)}…`} />
        </dl>
      </header>

      <div className="space-y-4" data-slot="weekly-review-modules">
        {review.snapshot.modules.map((module, index) => (
          <ReviewModule
            key={module.kind}
            analysisEnd={review.snapshot.analysisEnd}
            module={module}
            order={index + 1}
            reviewId={review.id}
            weightUnit={review.snapshot.weightUnit}
          />
        ))}
      </div>

      {review.snapshot.contexts.length ? <ReviewContexts review={review} /> : null}

      <ReviewHistory review={review} />
    </article>
  );
}

function ReviewContexts({ review }: { review: AdaptiveWeeklyReview }) {
  return (
    <section
      aria-labelledby={`review-contexts-${review.id}`}
      className="rounded-2xl border bg-card p-5 sm:p-6"
    >
      <h2 className="font-semibold" id={`review-contexts-${review.id}`}>
        Context records
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        These bounded notes can explain evidence or prevent a redundant question. They never
        override logged values, status, exclusions, or calculations.
      </p>
      <ul className="mt-4 space-y-3">
        {review.snapshot.contexts.map((context) => (
          <li className="rounded-xl border border-border/70 p-4 text-sm" key={context.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{context.category.replaceAll('_', ' ')}</p>
              <Badge variant="outline">
                {context.provenance.label} · {context.provenance.type.replaceAll('_', ' ')}
              </Badge>
            </div>
            <p className="mt-2 text-muted-foreground">{context.note}</p>
            {context.resolution ? (
              <p className="mt-2 font-medium">Resolution: {context.resolution}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReviewModule({
  analysisEnd,
  module,
  order,
  reviewId,
  weightUnit,
}: {
  analysisEnd: string;
  module: AdaptiveWeeklyReview['snapshot']['modules'][number];
  order: number;
  reviewId: string;
  weightUnit: 'kg' | 'lbs';
}) {
  const id = `review-${reviewId}-${module.kind}`;
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {order}
        </span>
        <h2 className="text-lg font-semibold" id={id}>
          {module.title}
        </h2>
      </div>
      <div className="mt-5">
        {module.kind === 'data_quality' ? <DataQualityModule module={module} /> : null}
        {module.kind === 'outcome' ? (
          <OutcomeModule module={module} weightUnit={weightUnit} />
        ) : null}
        {module.kind === 'energy' ? (
          <EnergyModule analysisEnd={analysisEnd} module={module} />
        ) : null}
        {module.kind === 'training_recovery' ? <TrainingModule module={module} /> : null}
        {module.kind === 'recommendation' ? <RecommendationModule module={module} /> : null}
      </div>
    </section>
  );
}

function DataQualityModule({
  module,
}: {
  module: Extract<AdaptiveWeeklyReview['snapshot']['modules'][number], { kind: 'data_quality' }>;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">{module.summary}</p>
      <ul className="space-y-2">
        {module.evidence.map((item, index) => (
          <li
            className="rounded-xl border border-border/70 p-4"
            key={`${item.localDate}-${item.id}-${index}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{item.label}</p>
              <Badge variant="outline">{item.state.replaceAll('_', ' ')}</Badge>
            </div>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {formatAdaptiveDate(item.localDate)} · {item.reasonCodes.join(', ')}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
            {item.resolution ? (
              <p className="mt-2 text-sm font-medium">Resolution: {item.resolution}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {module.requiresClarification ? (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Resolution paths</p>
          <p className="mt-1 text-muted-foreground">
            Ask your connected agent to confirm the complete log, mark the source record partial, or
            attach bounded context. Quantitative eligibility changes only when the source status
            changes.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {module.resolutionOptions.map((option) => (
              <Badge key={option} variant="outline">
                {option.replaceAll('_', ' ')}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OutcomeModule({
  module,
  weightUnit,
}: {
  module: Extract<AdaptiveWeeklyReview['snapshot']['modules'][number], { kind: 'outcome' }>;
  weightUnit: 'kg' | 'lbs';
}) {
  const goalLabel =
    module.goalType === 'lose'
      ? 'Loss goal'
      : module.goalType === 'gain'
        ? 'Gain goal'
        : 'Maintenance goal';
  return (
    <div className="space-y-4">
      <Badge variant="outline">{goalLabel}</Badge>
      <p className="text-sm leading-6 text-muted-foreground">{module.summary}</p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Scale weight"
          value={formatAdaptiveWeight(module.scaleWeightKg, weightUnit)}
        />
        <Metric
          label="Trend Weight"
          value={formatAdaptiveWeight(module.trendWeightKg, weightUnit)}
        />
        <Metric
          label="Trend change"
          value={formatAdaptiveWeightDelta(module.trendChangeKg, weightUnit)}
        />
        <Metric
          label="Actual / selected rate"
          value={`${formatAdaptiveWeightChange(module.actualRateKgPerWeek, weightUnit)} / ${formatAdaptiveWeightChange(module.desiredRateKgPerWeek, weightUnit)}`}
        />
      </dl>
      <p className="rounded-xl border border-border/70 p-3 text-sm text-muted-foreground">
        {module.scaleNoiseExplanation}
      </p>
    </div>
  );
}

function EnergyModule({
  analysisEnd,
  module,
}: {
  analysisEnd: string;
  module: Extract<AdaptiveWeeklyReview['snapshot']['modules'][number], { kind: 'energy' }>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{module.state.replaceAll('_', ' ')}</Badge>
        <span className="text-sm text-muted-foreground">{module.completeDays} complete days</span>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Average intake" value={formatAdaptiveCalories(module.averageIntakeKcal)} />
        <Metric label="Average target" value={formatAdaptiveCalories(module.averageTargetKcal)} />
        <Metric
          label="Adaptive expenditure"
          value={formatAdaptiveCalories(module.averageExpenditureKcal)}
        />
        <Metric
          label="Intake vs target"
          value={formatSignedCalories(module.intakeMinusTargetKcal)}
        />
        <Metric
          label="Intake vs expenditure"
          value={formatSignedCalories(module.intakeMinusExpenditureKcal)}
        />
      </dl>
      <p className="text-sm leading-6 text-muted-foreground">{module.summary}</p>
      <Button asChild className="min-h-11" variant="outline">
        <Link to={`/nutrition/energy-balance?end=${analysisEnd}`}>Open Energy Balance</Link>
      </Button>
    </div>
  );
}

function TrainingModule({
  module,
}: {
  module: Extract<
    AdaptiveWeeklyReview['snapshot']['modules'][number],
    { kind: 'training_recovery' }
  >;
}) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Scheduled" value={String(module.scheduledCount)} />
        <Metric label="Completed" value={String(module.completedCount)} />
        <Metric label="Moved" value={String(module.movedCount)} />
        <Metric label="Skipped / cancelled" value={String(module.skippedCount)} />
      </dl>
      <p className="text-sm leading-6 text-muted-foreground">{module.summary}</p>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">Performance: {module.performanceTrend}</Badge>
        <Badge variant="outline">
          Pain / illness: {module.painOrIllnessPresent ? 'recorded' : 'not recorded'}
        </Badge>
        <Badge variant="outline">Nutrition causal rule: not applied</Badge>
      </div>
      {module.evidence.length ? (
        <ul className="space-y-2">
          {module.evidence.map((item, index) => (
            <li
              className="rounded-xl border border-border/70 p-3 text-sm"
              key={`${item.id}-${index}`}
            >
              <p className="font-medium">{item.label}</p>
              <p className="mt-1 text-muted-foreground">{item.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RecommendationModule({
  module,
}: {
  module: Extract<AdaptiveWeeklyReview['snapshot']['modules'][number], { kind: 'recommendation' }>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{outcomeCopy[module.outcome]}</Badge>
        <p className="font-semibold">{module.headline}</p>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{module.explanation}</p>
      <TargetComparison current={module.currentTarget} proposed={module.proposedTarget} />
      <details className="rounded-xl border border-border/70 p-4">
        <summary className="cursor-pointer font-medium">Structured causal breakdown</summary>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Metric
            label="Prior expenditure"
            value={formatAdaptiveCalories(module.causalBreakdown.priorExpenditureKcal)}
          />
          <Metric
            label="Observed expenditure"
            value={formatAdaptiveCalories(module.causalBreakdown.observedExpenditureKcal)}
          />
          <Metric
            label="Proposed expenditure"
            value={formatAdaptiveCalories(module.causalBreakdown.proposedExpenditureKcal)}
          />
          <Metric
            label="Trend-rate energy contribution"
            value={formatSignedCalories(module.causalBreakdown.observedTrendContributionKcal)}
          />
          <Metric
            label="Goal-rate contribution"
            value={formatSignedCalories(module.causalBreakdown.goalRateContributionKcal)}
          />
          <Metric
            label="Requested adjustment"
            value={formatSignedCalories(module.causalBreakdown.requestedAdjustmentKcal)}
          />
          <Metric
            label="Applied adjustment"
            value={formatSignedCalories(module.causalBreakdown.appliedAdjustmentKcal)}
          />
          <Metric
            label="Smoothing / cap effect"
            value={formatSignedCalories(module.causalBreakdown.smoothingOrCapKcal)}
          />
          <Metric
            label="Loss deficit guardrail"
            value={formatAdaptiveCalories(module.causalBreakdown.deficitLimitKcal)}
          />
          <Metric
            label="Safety floor"
            value={formatAdaptiveCalories(module.causalBreakdown.safetyFloorKcal)}
          />
          <Metric
            label="Confidence"
            value={
              module.causalBreakdown.confidenceLabel === null
                ? 'Developing'
                : `${module.causalBreakdown.confidenceLabel} · ${Math.round((module.causalBreakdown.confidenceScore ?? 0) * 100)}%`
            }
          />
        </dl>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <EvidenceList
            empty="No nutrition dates were included."
            items={module.causalBreakdown.includedNutritionDates}
            label="Included nutrition dates"
          />
          <EvidenceList
            empty="No nutrition dates were excluded."
            items={module.causalBreakdown.excludedNutrition.map(
              (item) => `${item.localDate} · ${item.reasonCodes.join(', ')}`,
            )}
            label="Excluded nutrition"
          />
          <EvidenceList
            empty="No weigh-in dates were included."
            items={module.causalBreakdown.includedWeightDates}
            label="Included weigh-in dates"
          />
          <EvidenceList
            empty="No weigh-ins were excluded."
            items={module.causalBreakdown.excludedWeight.map(
              (item) => `${item.localDate} · ${item.reasonCodes.join(', ')}`,
            )}
            label="Excluded weigh-ins"
          />
          <EvidenceList
            empty="No readiness warnings."
            items={module.causalBreakdown.readinessReasonCodes}
            label="Readiness reasons"
          />
        </div>
      </details>
    </div>
  );
}

function ReviewHistory({ review }: { review: AdaptiveWeeklyReview }) {
  return (
    <section
      aria-labelledby={`review-history-${review.id}`}
      className="rounded-2xl border bg-card p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <History aria-hidden="true" className="size-4 text-primary" />
        <h2 className="font-semibold" id={`review-history-${review.id}`}>
          Decision history
        </h2>
      </div>
      {review.actions.length ? (
        <ol className="mt-4 space-y-3">
          {review.actions.map((action) => (
            <li className="rounded-xl border border-border/70 p-3 text-sm" key={action.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{action.type.replaceAll('_', ' ')}</p>
                <span className="text-xs text-muted-foreground">
                  {action.actor.label} ·{' '}
                  {formatReviewActionDate(action.createdAt, review.snapshot.timeZone)}
                </span>
              </div>
              <ActionDetail action={action} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No decision has been recorded yet.</p>
      )}
    </section>
  );
}

function formatReviewActionDate(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone,
    timeZoneName: 'short',
    year: 'numeric',
  }).format(new Date(timestamp));
}

function ActionDetail({ action }: { action: AdaptiveWeeklyReview['actions'][number] }) {
  const payload = action.payload;
  const detail =
    typeof payload.reason === 'string'
      ? payload.reason
      : typeof payload.question === 'string'
        ? payload.question
        : typeof payload.answer === 'string'
          ? payload.answer
          : null;
  const condition =
    payload.condition && typeof payload.condition === 'object'
      ? (payload.condition as Record<string, unknown>)
      : null;
  const proposal =
    payload.proposal && typeof payload.proposal === 'object'
      ? (payload.proposal as Record<string, unknown>)
      : payload.appliedProposal && typeof payload.appliedProposal === 'object'
        ? (payload.appliedProposal as Record<string, unknown>)
        : null;
  const acceptedKeep = action.type === 'accept' && payload.appliedProposal === null;
  return detail || condition || proposal || acceptedKeep ? (
    <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
      {detail ? <p>{detail}</p> : null}
      {condition ? (
        <p>
          Return condition: {String(condition.kind).replaceAll('_', ' ')}
          {typeof condition.localDate === 'string'
            ? ` · ${formatAdaptiveDate(condition.localDate)}`
            : ''}
          {typeof condition.evidence === 'string'
            ? ` · ${condition.evidence.replaceAll('_', ' ')}`
            : ''}
        </p>
      ) : null}
      {proposal ? (
        <p>
          {payload.proposal ? 'Edited' : 'Applied'} proposal:{' '}
          {formatAdaptiveCalories(Number(proposal.calories))} · {String(proposal.protein)}g protein
          · {String(proposal.carbs)}g carbs · {String(proposal.fat)}g fat
        </p>
      ) : null}
      {acceptedKeep ? (
        <p>Accepted the recommendation to keep the current plan; no target was applied.</p>
      ) : null}
    </div>
  ) : null;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}

function EvidenceList({ empty, items, label }: { empty: string; items: string[]; label: string }) {
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      {items.length ? (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function formatSignedCalories(value: number | null) {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.round(Math.abs(value)).toLocaleString()} kcal`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

export function WeeklyReviewLoading() {
  return (
    <Card aria-live="polite" role="status">
      <CardHeader>
        <div className="flex items-center gap-2 font-semibold">
          <ClipboardCheck aria-hidden="true" className="size-4 animate-pulse" />
          Loading weekly review
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Pulse is loading the saved decision snapshot. Your current plan remains unchanged.
      </CardContent>
    </Card>
  );
}

export function WeeklyReviewError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="border-destructive/30" role="alert">
      <CardHeader className="flex-row items-center gap-2 font-semibold">
        <CircleAlert aria-hidden="true" className="size-4 text-destructive" />
        Weekly review unavailable
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>Pulse could not load the review. No targets or decisions were changed.</p>
        <Button className="min-h-11" onClick={onRetry} type="button" variant="outline">
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
