const labels: Record<string, string> = {
  sleep: 'Sleep information not recorded',
  training_phase: 'Training phase not recorded',
  positive_focus: 'Positive focus not recorded',
  session_muscle_groups: 'Muscle groups missing for some session sets',
};

const referencedLabels: Record<string, string> = {
  workout_load_duration: 'Workout duration not recorded',
  activity_load_duration: 'Activity duration not recorded',
  linked_load_mismatch: 'Linked activity and workout dates do not match',
  guidance_for_concern: 'Guidance not recorded for a tracked concern',
};

export function describeMissingInput(input: string) {
  const separator = input.indexOf(':');
  const kind = separator === -1 ? input : input.slice(0, separator);
  return {
    label:
      labels[input] ??
      referencedLabels[kind] ??
      `Unrecognized missing input (${kind.replaceAll('_', ' ')})`,
    reference: separator === -1 ? null : input.slice(separator + 1),
    raw: input,
  };
}
