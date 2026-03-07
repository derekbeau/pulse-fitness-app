const INVALID_JSON_STRING_ARRAY_ERROR =
  'Expected a JSON-encoded array of strings for a text-backed array column.';

export function serializeJsonStringArray(values: readonly string[]): string {
  return JSON.stringify([...values]);
}

export function parseJsonStringArray(value: string | null | undefined): string[] {
  if (value == null) {
    return [];
  }

  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new TypeError(INVALID_JSON_STRING_ARRAY_ERROR);
  }

  return [...parsed];
}
