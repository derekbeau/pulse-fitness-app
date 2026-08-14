import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TrendSparkline, type TrendSparklinePlotDatum } from './trend-sparkline';

const plotData: TrendSparklinePlotDatum[] = [
  { date: '2026-03-06', value: 175.6, trend: 175.6 },
  { date: '2026-03-07', value: 175.2, trend: 175.4 },
];

describe('TrendSparkline responsive initialization', () => {
  it('mounts again after in-app navigation without an invalid-size Recharts warning', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const renderSparkline = () =>
      render(
        <StrictMode>
          <TrendSparkline
            changePercent={-0.4}
            color="#3B82F6"
            currentValue="175.4 lbs"
            data={plotData}
            label="Weight Trend"
          />
        </StrictMode>,
      );

    try {
      const firstVisit = renderSparkline();
      firstVisit.unmount();
      const returnVisit = renderSparkline();
      returnVisit.unmount();

      const invalidSizeWarnings = warnSpy.mock.calls.filter(([message]) =>
        String(message).includes('width(-1) and height(-1) of chart should be greater than 0'),
      );
      expect(invalidSizeWarnings).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
