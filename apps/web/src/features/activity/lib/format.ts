export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}min`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes} min`;
}
