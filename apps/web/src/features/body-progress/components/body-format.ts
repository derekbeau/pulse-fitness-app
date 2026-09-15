import type { BodyCheckInMeasurement, LengthUnit } from '@pulse/shared';

export const formatLength = (millimetres: number, unit: LengthUnit) =>
  `${(millimetres / (unit === 'cm' ? 10 : 25.4)).toFixed(1)} ${unit}`;

export const formatDateTime = (timestamp: number | null) =>
  timestamp === null
    ? 'Not recorded'
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(timestamp),
      );

export const qualityLabel: Record<BodyCheckInMeasurement['quality'], string> = {
  single_reading: 'Single reading · lower confidence',
  replicated: 'Replicated',
  needs_third_reading: 'Third reading needed',
  replicated_with_tiebreaker: 'Closest pair used',
  high_variance: 'High variance',
};

export const siteLabel = (
  measurement: Pick<BodyCheckInMeasurement, 'protocolName' | 'laterality'>,
) =>
  `${measurement.protocolName}${measurement.laterality === 'none' ? '' : ` · ${measurement.laterality}`}`;
