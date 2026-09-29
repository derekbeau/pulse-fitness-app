import type { SessionContextRuntime } from '@pulse/shared';

// #181 data bridge for #183. The preview card model is intentionally not a runtime type.
export const projectWhatMattersToday = (context: SessionContextRuntime) => ({
  localDate: context.localDate,
  focus: context.positiveFocus.map((capability) => ({
    id: capability.id,
    label: capability.label,
    provenance: capability.source.class,
    source: capability.source,
    currentRevisionId: capability.currentRevisionId,
    freshness:
      context.positiveFocusAttributions.find((item) => item.capabilityId === capability.id)
        ?.derivedFreshness ?? capability.source.freshness,
  })),
  cautions: context.relevantConcerns.map((concern) => ({
    id: concern.id,
    label: concern.label,
    symptomState: concern.symptomState,
    managementState: concern.managementState,
    provenance: concern.source.class,
    source: concern.source,
    currentRevisionId: concern.currentRevisionId,
  })),
  trackedIrrelevantConcerns: context.trackedIrrelevantConcerns.map((concern) => ({
    id: concern.id,
    label: concern.label,
    symptomState: concern.symptomState,
    managementState: concern.managementState,
    source: concern.source,
    currentRevisionId: concern.currentRevisionId,
  })),
  uncertainRelevanceConcerns: context.uncertainRelevanceConcerns.map((concern) => ({
    id: concern.id,
    label: concern.label,
    symptomState: concern.symptomState,
    managementState: concern.managementState,
    source: concern.source,
    currentRevisionId: concern.currentRevisionId,
  })),
  unknownSessionExerciseSetIds: context.unknownSessionExerciseSetIds,
  guidance: context.applicableGuidance.map((item) => ({
    id: item.id,
    text: item.text,
    provenance: item.source.class,
    source: item.source,
    currentRevisionId: item.currentRevisionId,
    freshness:
      context.guidanceFreshnessAttributions.find(
        (attribution) => attribution.guidanceId === item.id,
      )?.derivedFreshness ?? item.source.freshness,
  })),
  workload: context.workload,
  missingInputs: context.missingInputs,
  coOccurrences: context.coOccurrences,
});
