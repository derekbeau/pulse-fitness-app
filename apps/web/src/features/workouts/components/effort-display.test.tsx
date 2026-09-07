import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formatEffort } from '../lib/effort';
import { EffortValue, HistoryEffortDetails } from './effort-display';

describe('Effort provenance disclosure', () => {
  it.each([0, 4, 5])(
    'exposes native RIR %i through a focusable button and restores focus on Escape',
    async (rir) => {
      render(
        <EffortValue effort={formatEffort({ rir, rpe: null }, 'weight_reps')} label="Set 1" />,
      );
      const trigger = screen.getByRole('button', { name: 'Effort details: Set 1' });
      trigger.focus();
      expect(trigger).toHaveFocus();
      fireEvent.click(trigger);
      const dialog = await screen.findByRole('dialog', { name: 'Effort details' });
      expect(dialog).toHaveTextContent(`Stored RIR: ${rir}; stored RPE: not logged`);
      if (rir === 5)
        expect(dialog).toHaveTextContent('five or more repetitions remained, not exactly five');
      fireEvent.keyDown(dialog, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    },
  );
  it('shows original RPE and mixed per-set provenance on click without hover', () => {
    render(
      <HistoryEffortDetails
        sets={[
          { rir: 4, setNumber: 2 },
          { rpe: 8, setNumber: 3 },
          { rpe: 1, setNumber: 4 },
          { rir: null, rpe: null, setNumber: 5 },
        ]}
        trackingType="weight_reps"
        label="Sep 4 history"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Effort details: Sep 4 history' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(4);
    expect(dialog).toHaveTextContent('Set 3 · ≈ 2 RIR');
    expect(dialog).toHaveTextContent('Derived approximately from stored RPE 8');
    expect(dialog).toHaveTextContent('Set 4 · ≈ 5+ RIR');
    expect(dialog).toHaveTextContent('Set 5Effort not logged. No estimate.');
  });
  it('adds no empty disclosure or non-resistance control', () => {
    render(
      <>
        <HistoryEffortDetails sets={[{}]} trackingType="weight_reps" label="Missing" />
        <HistoryEffortDetails sets={[{ rpe: 8 }]} trackingType="duration" label="Duration" />
      </>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
