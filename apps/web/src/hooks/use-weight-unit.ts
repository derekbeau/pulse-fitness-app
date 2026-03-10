import { formatWeight as formatWeightWithUnit, getWeightLabel, type WeightUnit } from '@pulse/shared';

import { useUser } from './use-user';

type UseWeightUnitResult = {
  formatWeight: (value: number) => string;
  weightLabel: string;
  weightUnit: WeightUnit;
};

export function useWeightUnit(): UseWeightUnitResult {
  const { data: user } = useUser();
  const weightUnit = user?.weightUnit ?? 'lbs';

  return {
    formatWeight: (value: number) => formatWeightWithUnit(value, weightUnit),
    weightLabel: getWeightLabel(weightUnit),
    weightUnit,
  };
}
