export const calculateTrendChangePercent = (
  currentValue: number,
  previousValue: number,
): number => {
  if (previousValue <= 0) {
    return 0;
  }

  return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
};
