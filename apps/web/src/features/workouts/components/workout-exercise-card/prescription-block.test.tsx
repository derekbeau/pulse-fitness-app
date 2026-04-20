import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PrescriptionBlock } from './prescription-block';

describe('PrescriptionBlock', () => {
  it('formats weight-reps prescriptions and tempo/rest details', () => {
    render(
      <PrescriptionBlock
        repsMax={10}
        repsMin={8}
        restSeconds={90}
        setTargets={[
          { setNumber: 1, targetWeight: 50 },
          { setNumber: 2, targetWeight: 50 },
        ]}
        sets={3}
        tempo="3110"
        trackingType="weight_reps"
        weightUnit="lbs"
      />,
    );

    expect(screen.getByText('3 x 50 lbs')).toBeInTheDocument();
    expect(screen.getByText('Tempo: 3-1-1-0 • Rest: 90s')).toBeInTheDocument();
  });

  it('formats time-based prescriptions with set breakdown', () => {
    render(
      <PrescriptionBlock
        repsMax={null}
        repsMin={null}
        restSeconds={45}
        setTargets={[
          { setNumber: 1, targetSeconds: 30 },
          { setNumber: 2, targetSeconds: 45 },
        ]}
        sets={2}
        tempo={null}
        trackingType="seconds_only"
        weightUnit="lbs"
      />,
    );

    expect(screen.getByText('2 x 30 sec')).toBeInTheDocument();
    expect(screen.getByText('Set 1: 30 sec • Set 2: 45 sec')).toBeInTheDocument();
  });

  it('formats distance-based prescriptions', () => {
    render(
      <PrescriptionBlock
        repsMax={null}
        repsMin={null}
        restSeconds={60}
        setTargets={[{ setNumber: 1, targetDistance: 0.4 }]}
        sets={3}
        tempo={null}
        trackingType="distance"
        weightUnit="kg"
      />,
    );

    expect(screen.getByText('3 x 0.4 km')).toBeInTheDocument();
  });
});
