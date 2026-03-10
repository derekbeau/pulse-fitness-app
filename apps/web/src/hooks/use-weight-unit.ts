import { formatWeight as formatWeightWithUnit, type WeightUnit } from '@pulse/shared';

import { useUser } from './use-user';

export function useWeightUnit() {
  const { data: user } = useUser();
  const weightUnit: WeightUnit = user?.weightUnit ?? 'lbs';

  return {
    formatWeight: (value: number) => formatWeightWithUnit(value, weightUnit),
    weightUnit,
  };
}
