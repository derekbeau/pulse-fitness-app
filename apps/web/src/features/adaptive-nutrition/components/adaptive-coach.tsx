import { CalendarCheck2, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';

import {
  useAcceptAdaptiveNutritionCheckIn,
  useAdaptiveNutritionCheckIn,
  useAdaptiveNutritionState,
  useDeclineAdaptiveNutritionCheckIn,
  usePreviewAdaptiveNutritionCheckIn,
  usePutAdaptiveNutritionProgram,
} from '../api/adaptive-nutrition';
import { AdaptiveSetupForm } from './adaptive-setup-form';
import { AlgorithmStatusCard } from './algorithm-status-card';
import { CheckInComparison } from './check-in-comparison';
import { CheckInHistory } from './check-in-history';
import { GoalCard } from './goal-card';
import { GoalCompletionDialog } from './goal-completion-dialog';
import { GoalEditorDialog } from './goal-editor-dialog';
import { GoalHistory } from './goal-history';

export function AdaptiveCoach() {
  const stateQuery = useAdaptiveNutritionState();
  const previewMutation = usePreviewAdaptiveNutritionCheckIn();
  const acceptMutation = useAcceptAdaptiveNutritionCheckIn();
  const declineMutation = useDeclineAdaptiveNutritionCheckIn();
  const programMutation = usePutAdaptiveNutritionProgram();
  const [includeToday, setIncludeToday] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [staleCheckInId, setStaleCheckInId] = useState<string | null>(null);
  const [goalEditorMode, setGoalEditorMode] = useState<'edit' | 'new' | null>(null);
  const [completionOpen, setCompletionOpen] = useState(false);
  const editGoalButtonRef = useRef<HTMLButtonElement>(null);
  const startNewGoalButtonRef = useRef<HTMLButtonElement>(null);
  const reviewCompletionButtonRef = useRef<HTMLButtonElement>(null);
  const lastGoalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { confirm, dialog } = useConfirmation();
  const pendingId = stateQuery.data?.pendingCheckIn?.id ?? null;
  const pendingDetailQuery = useAdaptiveNutritionCheckIn(pendingId, pendingId !== null);

  if (stateQuery.isLoading) {
    return <CoachSkeleton />;
  }

  if (stateQuery.isError || !stateQuery.data) {
    return (
      <Card className="gap-4 py-5">
        <CardHeader className="px-5 sm:px-6">
          <CardTitle>
            <h2>Unable to load Nutrition Coach</h2>
          </CardTitle>
          <CardDescription>
            {stateQuery.error instanceof Error
              ? stateQuery.error.message
              : 'The coaching state could not be loaded.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 sm:px-6">
          <Button onClick={() => void stateQuery.refetch()} type="button" variant="outline">
            <RefreshCw aria-hidden="true" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const state = stateQuery.data;

  const requestPreview = async (kind: 'manual' | 'weekly') => {
    setActionError(null);
    setActionMessage('');
    try {
      const checkIn = await previewMutation.mutateAsync({
        includeToday: kind === 'manual' ? includeToday : false,
        kind,
      });
      setStaleCheckInId(null);
      setActionMessage(
        checkIn.status === 'held'
          ? 'Check-in complete. Pulse kept your current estimate because the data did not support an update.'
          : 'Recommendation ready for review.',
      );
    } catch (error) {
      setActionError(getActionError(error, 'Unable to create a check-in.'));
    }
  };

  const accept = async (replaceSameDateTarget: boolean) => {
    if (!pendingId) return;
    setActionError(null);
    try {
      const result = await acceptMutation.mutateAsync({
        id: pendingId,
        input: { replaceSameDateTarget },
      });
      setStaleCheckInId(null);
      setActionMessage(
        result.checkIn.calculationSnapshot.goal?.goalReached
          ? 'Targets accepted. Your goal range is reached; review goal completion before moving to maintenance.'
          : 'Targets accepted and applied from today.',
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CHECKIN_STALE') {
        setStaleCheckInId(pendingId);
        setActionError(
          'This recommendation is out of date because its source data changed. Refresh it before accepting.',
        );
        return;
      }
      if (
        error instanceof ApiError &&
        error.code === 'SAME_DATE_TARGET_EXISTS' &&
        !replaceSameDateTarget
      ) {
        openReplacementConfirmation();
        return;
      }
      setActionError(getActionError(error, 'Unable to accept this recommendation.'));
    }
  };

  const openReplacementConfirmation = () => {
    confirm({
      title: 'Replace today’s nutrition target?',
      description:
        'A target already exists for this date. Replacing it keeps the previous values inside this check-in’s immutable audit snapshot.',
      confirmLabel: 'Replace target',
      variant: 'default',
      onConfirm: () => accept(true),
    });
  };

  const handleAccept = () => {
    if (pendingDetailQuery.data?.reasonCodes.includes('SAME_DATE_TARGET_EXISTS')) {
      openReplacementConfirmation();
      return;
    }
    void accept(false);
  };

  const handleDecline = async () => {
    if (!pendingId) return;
    setActionError(null);
    try {
      await declineMutation.mutateAsync(pendingId);
      setStaleCheckInId(null);
      setActionMessage('Current targets kept. The recommendation remains in your history.');
    } catch (error) {
      setActionError(getActionError(error, 'Unable to keep the current targets.'));
    }
  };

  const handleRefreshStale = async () => {
    if (pendingDetailQuery.data?.kind === 'baseline') {
      setActionError(null);
      setActionMessage('');
      try {
        const program = state.program;
        if (!program) {
          setActionError(
            'The baseline program could not be loaded. Refresh the page and try again.',
          );
          return;
        }
        await programMutation.mutateAsync({
          status: program.status,
          timeZone: program.timeZone,
          heightCm: program.heightCm,
          birthDate: program.birthDate,
          rmrEquation: program.rmrEquation,
          activityLevel: program.activityLevel,
          manualBaselineTdeeKcal: program.manualBaselineTdeeKcal,
          goalType: program.goalType,
          targetWeightKg: program.targetWeightKg,
          goalRatePctPerWeek: program.goalRatePctPerWeek,
          proteinGrams: program.proteinGrams,
          fatAllocationPct: program.fatAllocationPct,
          userCalorieFloorKcal: program.userCalorieFloorKcal,
          currentWeight: null,
          rebaseline: true,
          supersedePending: true,
        });
        setStaleCheckInId(null);
        setActionMessage('Baseline refreshed with the latest source data.');
      } catch (error) {
        setActionError(getActionError(error, 'Unable to refresh the baseline.'));
      }
      return;
    }
    const kind = pendingDetailQuery.data?.kind === 'weekly' ? 'weekly' : 'manual';
    await requestPreview(kind);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {state.state === 'setup_required' ? (
        <AdaptiveSetupForm currentTarget={state.currentTarget} />
      ) : (
        <>
          <AlgorithmStatusCard state={state} />

          <GoalCard
            goal={state.activeGoal}
            goalActionRequired={state.goalActionRequired}
            editButtonRef={editGoalButtonRef}
            onEdit={() => {
              lastGoalTriggerRef.current = editGoalButtonRef.current;
              setGoalEditorMode('edit');
            }}
            onReviewCompletion={() => setCompletionOpen(true)}
            onStartNew={() => {
              lastGoalTriggerRef.current = startNewGoalButtonRef.current;
              setGoalEditorMode('new');
            }}
            progress={state.goalProgress}
            reviewCompletionButtonRef={reviewCompletionButtonRef}
            startNewButtonRef={startNewGoalButtonRef}
          />

          {actionMessage ? (
            <div
              aria-live="polite"
              className="flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3 text-sm"
              role="status"
            >
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-emerald-500"
              />
              <p>{actionMessage}</p>
            </div>
          ) : null}

          {state.pendingCheckIn ? (
            pendingDetailQuery.isLoading ? (
              <Skeleton className="h-96 rounded-2xl" />
            ) : pendingDetailQuery.isError || !pendingDetailQuery.data ? (
              <p
                className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
                role="alert"
              >
                Unable to load the pending recommendation details.
              </p>
            ) : (
              <CheckInComparison
                checkIn={pendingDetailQuery.data}
                errorMessage={actionError}
                isAccepting={acceptMutation.isPending}
                isDeclining={declineMutation.isPending}
                isRefreshing={previewMutation.isPending || programMutation.isPending}
                onAccept={handleAccept}
                onDecline={() => void handleDecline()}
                onRefresh={
                  staleCheckInId === pendingId ? () => void handleRefreshStale() : undefined
                }
              />
            )
          ) : (
            <CheckInActions
              actionError={actionError}
              checkInDue={state.checkInDue}
              includeToday={includeToday}
              isPending={previewMutation.isPending}
              onIncludeTodayChange={setIncludeToday}
              onPreview={requestPreview}
            />
          )}

          {state.activeGoal ? <GoalHistory activeGoalId={state.activeGoal.id} /> : null}

          <CheckInHistory />

          {state.program ? (
            <>
              <GoalEditorDialog
                activeGoal={state.activeGoal}
                fallbackGoalType={state.program.goalType}
                fallbackGoalWeightKg={state.program.targetWeightKg}
                mode={goalEditorMode ?? 'new'}
                onOpenChange={(open) => {
                  if (!open) {
                    setGoalEditorMode(null);
                    queueMicrotask(() => lastGoalTriggerRef.current?.focus());
                  }
                }}
                onSaved={(message) => {
                  setActionError(null);
                  setActionMessage(message);
                }}
                open={goalEditorMode !== null}
                pendingRecommendation={state.pendingCheckIn}
                progress={state.goalProgress}
              />
              {state.activeGoal ? (
                <GoalCompletionDialog
                  checkIn={state.latestAcceptedCheckIn}
                  goal={state.activeGoal}
                  onCompleted={(message) => {
                    setActionError(null);
                    setActionMessage(message);
                  }}
                  onOpenChange={(open) => {
                    setCompletionOpen(open);
                  }}
                  onRefresh={async () => {
                    await stateQuery.refetch();
                  }}
                  open={completionOpen}
                  progress={state.goalProgress}
                  revisionId={state.goalProgress?.goalRevisionId ?? null}
                  triggerRef={reviewCompletionButtonRef}
                />
              ) : null}
            </>
          ) : null}
        </>
      )}
      {dialog}
    </div>
  );
}

function CheckInActions({
  actionError,
  checkInDue,
  includeToday,
  isPending,
  onIncludeTodayChange,
  onPreview,
}: {
  actionError: string | null;
  checkInDue: boolean;
  includeToday: boolean;
  isPending: boolean;
  onIncludeTodayChange: (checked: boolean) => void;
  onPreview: (kind: 'manual' | 'weekly') => Promise<void>;
}) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="gap-2 px-5 sm:px-6">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles aria-hidden="true" className="size-4" />
          <CardTitle>
            <h2>Ready when you are</h2>
          </CardTitle>
        </div>
        <CardDescription>
          A check-in reads your current complete days and weight trend. It never changes targets by
          itself.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5 sm:px-6">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3">
          <Checkbox
            aria-describedby="include-today-help"
            checked={includeToday}
            className="mt-0.5"
            onCheckedChange={(checked) => onIncludeTodayChange(checked === true)}
          />
          <span>
            <span className="block text-sm font-medium">Include today in a manual check-in</span>
            <span className="mt-1 block text-xs text-muted-foreground" id="include-today-help">
              Today contributes only when it is explicitly marked Complete in the Log tab.
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-2 sm:flex-row">
          {checkInDue ? (
            <Button disabled={isPending} onClick={() => void onPreview('weekly')} type="button">
              <CalendarCheck2 aria-hidden="true" />
              {isPending ? 'Checking in…' : 'Start weekly check-in'}
            </Button>
          ) : null}
          <Button
            disabled={isPending}
            onClick={() => void onPreview('manual')}
            type="button"
            variant={checkInDue ? 'outline' : 'default'}
          >
            <Sparkles aria-hidden="true" />
            {isPending ? 'Checking in…' : 'Check in now'}
          </Button>
        </div>

        {actionError ? (
          <p className="text-sm text-destructive" role="alert">
            {actionError}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CoachSkeleton() {
  return (
    <div aria-label="Loading Nutrition Coach" className="space-y-4">
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="h-56 rounded-2xl" />
    </div>
  );
}

function getActionError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
