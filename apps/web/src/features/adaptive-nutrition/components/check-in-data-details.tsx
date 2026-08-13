import type { AdaptiveCheckInDetail } from '@pulse/shared';
import { ChevronDown } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { useWeightUnit } from '@/hooks/use-weight-unit';

import {
  adaptiveReasonCopy,
  formatAdaptiveCalories,
  formatAdaptiveDate,
  formatAdaptivePercent,
  formatAdaptiveWeight,
  formatAdaptiveWeightChange,
  getConfidenceTone,
} from '../lib/format-adaptive-nutrition';

export function CheckInDataDetails({ checkIn }: { checkIn: AdaptiveCheckInDetail }) {
  const { weightUnit } = useWeightUnit();
  const calculation = checkIn.calculationSnapshot;
  const usedNutritionDates = checkIn.inputSnapshot.nutritionDays
    .filter(
      (day) =>
        day.status === 'complete' &&
        day.itemCount > 0 &&
        day.calories > 0 &&
        !calculation.excludedNutritionDates.includes(day.date),
    )
    .map((day) => day.date);
  const interpolatedDays = Math.max(0, calculation.trendPointCount - calculation.actualWeightCount);

  return (
    <details className="group rounded-xl border border-border/70 bg-muted/10">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
        How Pulse calculated this
        <ChevronDown
          aria-hidden="true"
          className="size-4 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-5 border-t border-border/70 px-4 py-4">
        {checkIn.kind === 'baseline' ? <BaselineSetupDetails checkIn={checkIn} /> : null}

        <section aria-labelledby={`check-in-summary-${checkIn.id}`} className="space-y-3">
          <h3 className="font-semibold" id={`check-in-summary-${checkIn.id}`}>
            Calculation summary
          </h3>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <DetailValue
              label="Analysis range"
              value={`${formatAdaptiveDate(checkIn.analysisStart)} – ${formatAdaptiveDate(checkIn.analysisEnd)}`}
            />
            <DetailValue
              label="Average logged calories"
              value={formatAdaptiveCalories(calculation.averageDailyIntakeKcal)}
            />
            <DetailValue
              label="Weigh-ins"
              value={`${calculation.actualWeightCount} actual · ${interpolatedDays} interpolated days`}
            />
            <DetailValue
              label="Trend weight"
              value={formatAdaptiveWeight(calculation.latestTrendWeightKg, weightUnit)}
            />
            <DetailValue
              label="Trend change"
              value={formatAdaptiveWeightChange(
                calculation.weightTrendKgPerDay == null
                  ? null
                  : calculation.weightTrendKgPerDay * 7,
                weightUnit,
              )}
            />
            <DetailValue
              label="Goal rate"
              value={`${Math.abs(checkIn.inputSnapshot.program.goalRatePctPerWeek)}% body weight/week`}
            />
          </dl>
        </section>

        {calculation.confidence ? (
          <section aria-labelledby={`check-in-confidence-${checkIn.id}`} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold" id={`check-in-confidence-${checkIn.id}`}>
                Confidence
              </h3>
              <Badge className={getConfidenceTone(calculation.confidence.label)} variant="outline">
                {calculation.confidence.label} ·{' '}
                {formatAdaptivePercent(calculation.confidence.score)}
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <DetailValue
                label="Nutrition coverage"
                value={formatAdaptivePercent(calculation.confidence.nutritionCoverage)}
              />
              <DetailValue
                label="Weight frequency"
                value={formatAdaptivePercent(calculation.confidence.weightFrequency)}
              />
              <DetailValue
                label="Weight span"
                value={formatAdaptivePercent(calculation.confidence.spanScore)}
              />
              <DetailValue
                label="Weight recency"
                value={formatAdaptivePercent(calculation.confidence.recencyScore)}
              />
            </dl>
          </section>
        ) : null}

        <DateList
          dates={usedNutritionDates}
          emptyLabel="No complete nutrition dates were eligible."
          heading="Complete dates used"
        />
        <DateList
          dates={calculation.excludedNutritionDates}
          emptyLabel="No nutrition dates were excluded."
          heading="Excluded dates"
        />

        {checkIn.reasonCodes.length ? (
          <section aria-labelledby={`check-in-guardrails-${checkIn.id}`} className="space-y-2">
            <h3 className="font-semibold" id={`check-in-guardrails-${checkIn.id}`}>
              Holds, warnings, and guardrails
            </h3>
            <ul className="space-y-2">
              {checkIn.reasonCodes.map((code) => (
                <li className="rounded-lg border border-border/60 p-3" key={code}>
                  <p className="text-sm font-medium">{adaptiveReasonCopy[code].label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {adaptiveReasonCopy[code].action}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="text-sm leading-relaxed text-muted-foreground">{buildExplanation(checkIn)}</p>
      </div>
    </details>
  );
}

function BaselineSetupDetails({ checkIn }: { checkIn: AdaptiveCheckInDetail }) {
  const program = checkIn.inputSnapshot.program;
  const isManual = program.rmrEquation === 'manual_tdee';

  return (
    <section
      aria-labelledby={`baseline-setup-${checkIn.id}`}
      className="space-y-3 rounded-xl border border-border/70 bg-background/50 p-3"
    >
      <h3 className="font-semibold" id={`baseline-setup-${checkIn.id}`}>
        Starting estimate details
      </h3>
      {isManual ? (
        <p className="text-sm text-muted-foreground">
          Starting expenditure was entered manually, so no Estimated RMR or activity multiplier was
          used.
        </p>
      ) : (
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <DetailValue
            label="Estimated RMR"
            value={formatAdaptiveCalories(program.estimatedRmrKcal)}
          />
          <DetailValue
            label="Activity multiplier"
            value={
              program.activityMultiplier == null
                ? 'Unavailable'
                : String(program.activityMultiplier)
            }
          />
        </dl>
      )}
      <p className="text-sm leading-relaxed text-muted-foreground">
        Personalization generally requires multiple weeks of complete nutrition and weight data.
      </p>
    </section>
  );
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/70 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function DateList({
  dates,
  emptyLabel,
  heading,
}: {
  dates: string[];
  emptyLabel: string;
  heading: string;
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{heading}</h3>
      {dates.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {dates.map((date) => (
            <li className="rounded-full border border-border/70 px-2.5 py-1 text-xs" key={date}>
              {formatAdaptiveDate(date)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </section>
  );
}

function buildExplanation(checkIn: AdaptiveCheckInDetail) {
  const calculation = checkIn.calculationSnapshot;
  if (calculation.state === 'baseline') {
    return 'This starting estimate uses your setup profile and activity selection. It remains a prior—not a measured metabolism value—until complete nutrition and weight-trend data support personalization.';
  }
  if (calculation.state === 'learning') {
    return 'Pulse excluded incomplete days and held the starting estimate because the recent data did not meet every eligibility threshold.';
  }
  if (calculation.state === 'holding') {
    return 'Pulse kept the previous Adaptive TDEE rather than inventing an update from insufficient, stale, suspect, or implausible data.';
  }
  return 'Pulse compared average intake with the direction of your smoothed weight trend, blended the observed expenditure toward the prior according to confidence, and then applied the documented goal and safety guardrails.';
}
