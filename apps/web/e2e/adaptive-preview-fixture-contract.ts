import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Readiness = {
  completeNutritionDaysLogged: number;
  completeNutritionDaysUsable: number;
  completeNutritionDaysBeforeWeightTrend: number;
  completeNutritionDaysPendingCutoff: number;
  weighInsLogged: number;
  weighInsUsable: number;
  weighInsPendingCutoff: number;
  analysisEndDate: string;
  pendingCutoffDate: string;
};

export type AdaptivePreviewFixtureContract = {
  version: number;
  anchorDate: string;
  seedNow: string;
  serverNow: string;
  timeZone: string;
  readiness: { learning: Readiness; updating: Readiness };
  weeklyReview: {
    fixture: string;
    reviewLocalDate: string;
    analysisStart: string;
    analysisEnd: string;
    headline: string;
    clarificationCount: number;
    lowDay: {
      localDate: string;
      calories: number;
      state: string;
      label: string;
      reasonCode: string;
    };
    initialContextCount: number;
  };
  dataQuality: {
    range: { startDate: string; endDate: string };
    contextDate: string;
    context: {
      category: string;
      note: string;
      provenanceType: string;
      provenanceLabel: string;
      revision: number;
    };
    days: Array<{
      date: string;
      nutritionQuality: string;
      nutritionEvidence: string;
      weightEvidence: string;
      workoutState?: string;
    }>;
  };
  energyBalance: {
    fixture: string;
    range: {
      preset: string;
      startDate: string;
      endDate: string;
      aggregation: string;
      calendarDays: number;
    };
    predictedModeledDays: number;
    observedTrendStartDate: string;
    observedTrendEndDate: string;
    predictedWeightChangeKg: number;
    observedTrendWeightChangeKg: number;
    completeNutritionDays: number;
    excludedNutritionDays: number;
    endingObservation: {
      date: string;
      intakeKcal: number;
      targetKcal: number;
      expenditureKcal: number;
    };
  };
  trajectory: {
    fixture: string;
    goalStartDate: string;
    goalType: string;
    targetWeightKg: number;
    startAdaptiveTrendWeightKg: number;
    currentDate: string;
    currentAdaptiveTrendWeightKg: number;
    latestScaleWeightKg: number;
    selectedRateKgPerWeek: number;
    actualRateKgPerWeek: number;
    actualRateObservationCount: number;
    actualRateSpanDays: number;
    paceState: string;
    selectedPoint: {
      date: string;
      section: string;
      evidenceState: string;
      adaptiveStrategyTrendWeightKg: number;
      scaleWeightKg: number;
    };
  };
  workoutProgression: {
    fixture: string;
    scheduledDate: string;
    historyDate: string;
    exercise: string;
    decision: string;
    confidence: string;
    priorTargetWeights: number[];
    completedWeights: number[];
    completedReps: number[];
    completedRpe: number[];
    recommendedTargetWeights: number[];
    acceptedTargetWeights: number[];
    historyLabel: string;
  };
};

export const adaptivePreviewFixtureContract = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../../scripts/adaptive-preview-fixture-contract.v1.json'),
    'utf8',
  ),
) as AdaptivePreviewFixtureContract;
