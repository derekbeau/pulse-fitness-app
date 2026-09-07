import type { ExerciseTrackingType } from '@pulse/shared';

export type EffortFacts = {
  rir?: number | null;
  rpe?: number | null;
};

export type EffortPresentation = {
  displayText: string | null;
  rawRir: number | null;
  rawRpe: number | null;
  provenance: 'native' | 'derived' | 'missing' | 'unsupported';
  isLowerBound: boolean;
  detail: string;
};

export function isResistanceEffort(trackingType: ExerciseTrackingType) {
  return ['weight_reps', 'bodyweight_reps', 'reps_only'].includes(trackingType);
}

/** Presentation only. Never use the derived value for writes, evidence, or policy evaluation. */
export function formatEffort(
  facts: EffortFacts,
  trackingType: ExerciseTrackingType,
): EffortPresentation {
  const rawRir = facts.rir ?? null;
  const rawRpe = facts.rpe ?? null;
  const rawDetail = `Stored RIR: ${rawRir ?? 'not logged'}; stored RPE: ${rawRpe ?? 'not logged'}. Raw values unchanged.`;
  const base = { rawRir, rawRpe, isLowerBound: false };

  if (rawRir === null && rawRpe === null) {
    return {
      ...base,
      displayText: null,
      provenance: 'missing',
      detail: 'Effort not logged. No estimate.',
    };
  }

  if (!isResistanceEffort(trackingType)) {
    return {
      ...base,
      displayText: [
        rawRir !== null ? `${rawRir === 5 ? '5+' : rawRir} RIR` : null,
        rawRpe !== null ? `RPE ${rawRpe}` : null,
      ]
        .filter(Boolean)
        .join(' / '),
      provenance: 'native',
      isLowerBound: rawRir === 5,
      detail: rawDetail,
    };
  }

  if (rawRir !== null) {
    const supported = Number.isInteger(rawRir) && rawRir >= 0 && rawRir <= 5;
    return {
      ...base,
      displayText: supported
        ? `${rawRir === 5 ? '5+' : rawRir} RIR`
        : `Stored RIR ${rawRir} (unsupported)`,
      provenance: supported ? 'native' : 'unsupported',
      isLowerBound: rawRir === 5,
      detail: `${supported ? 'Native RIR takes display precedence.' : 'Unsupported stored RIR; no conversion.'} ${rawRir === 5 ? '5+ means five or more repetitions remained, not exactly five. ' : ''}${rawDetail}`,
    };
  }

  if (rawRpe !== null && Number.isInteger(rawRpe) && rawRpe >= 1 && rawRpe <= 10) {
    const derived = 10 - rawRpe;
    const isLowerBound = derived >= 5;
    return {
      ...base,
      displayText: `≈ ${isLowerBound ? '5+' : derived} RIR`,
      provenance: 'derived',
      isLowerBound,
      detail: `Derived approximately from stored RPE ${rawRpe} using RIR ≈ 10 − RPE; raw value unchanged. ${isLowerBound ? '5+ is the five-or-more bucket, not an exact estimate. ' : ''}${rawDetail}`,
    };
  }

  return {
    ...base,
    displayText: `RPE ${rawRpe} (unsupported)`,
    provenance: 'unsupported',
    detail: `Stored RPE is outside the supported integer range 1–10. No RIR conversion. ${rawDetail}`,
  };
}
