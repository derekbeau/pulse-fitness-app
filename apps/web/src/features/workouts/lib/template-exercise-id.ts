const TEMPLATE_EXERCISE_ELEMENT_ID_PREFIX = 'template-exercise-';

export function getTemplateExerciseElementId(templateExerciseId: string) {
  return `${TEMPLATE_EXERCISE_ELEMENT_ID_PREFIX}${templateExerciseId}`;
}
