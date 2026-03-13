export const TEMPLATE_TAG_LIMIT = 20;

export const TEMPLATE_TAG_SUGGESTIONS = [
  'home gym',
  'full gym',
  'rehab',
  'upper',
  'lower',
  'push',
  'pull',
  'hypertrophy',
  'strength',
  'deload',
  'shoulder-safe',
  'tendon',
] as const;

export function normalizeTemplateTag(tag: string) {
  return tag.trim().toLowerCase();
}

export function normalizeTemplateTags(tags: string[], max = TEMPLATE_TAG_LIMIT) {
  const next: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const normalized = normalizeTemplateTag(tag);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    next.push(normalized);

    if (next.length >= max) {
      break;
    }
  }

  return next;
}

export function appendTemplateTags(
  existingTags: string[],
  rawTags: string,
  max = TEMPLATE_TAG_LIMIT,
) {
  const parsedTags = rawTags.split(',');
  return normalizeTemplateTags([...existingTags, ...parsedTags], max);
}
