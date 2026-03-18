export function getSupersetAccentIndex(groupId: string, paletteSize: number) {
  if (paletteSize <= 0) {
    return 0;
  }

  let hash = 5381;
  for (const character of groupId) {
    hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
  }

  return hash % paletteSize;
}

export function getSupersetAccentClass(groupId: string, accentStyles: readonly string[]) {
  if (accentStyles.length === 0) {
    return '';
  }

  return accentStyles[getSupersetAccentIndex(groupId, accentStyles.length)] ?? accentStyles[0];
}
