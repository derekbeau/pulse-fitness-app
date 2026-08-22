import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { HealthCondition } from '../types';
import { SeverityChart } from './severity-chart';
import { buildSeverityChartData } from './severity-chart-data';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">
        {React.isValidElement(children)
          ? React.cloneElement(
              children as React.ReactElement<{ height?: number; width?: number }>,
              {
                height: 320,
                width: 640,
              },
            )
          : children}
      </div>
    ),
  };
});

describe('SeverityChart', () => {
  const condition: HealthCondition = {
    id: 'test-condition',
    bodyArea: 'Right Shoulder',
    description: 'Minimal inline fixture for the severity chart tests.',
    linkedJournalEntries: [],
    name: 'Test Condition',
    onsetDate: '2025-01-01',
    protocols: [],
    severityHistory: [
      { date: '2025-01-01', value: 6 },
      { date: '2025-01-10', value: 3 },
    ],
    status: 'active',
    timeline: [
      {
        id: 'shoulder-flare-2025-01-05',
        date: '2025-01-05',
        event: 'Pain spiked after a heavy pressing day.',
        type: 'flare',
        notes: 'Backed off pressing volume for the rest of the week.',
      },
    ],
  };

  it('renders a responsive chart with exact ordinary and event point inspection', () => {
    const { container } = render(
      <SeverityChart severityHistory={condition.severityHistory} timeline={condition.timeline} />,
    );

    expect(screen.getByText('Pain / Severity Over Time')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Pain / Severity Over Time chart' }),
    ).toBeInTheDocument();

    const severityMarkers = container.querySelectorAll('[data-slot="severity-point-marker"]');
    expect(severityMarkers).toHaveLength(3);
    fireEvent.focus(severityMarkers[0]?.querySelector('circle') as Element);
    expect(screen.getByLabelText('Selected chart point')).toHaveTextContent(
      'Jan 1, 2025Severity 6 of 10 · Recorded check-in',
    );

    const eventMarkers = container.querySelectorAll('[data-slot="severity-event-marker"]');
    expect(eventMarkers).toHaveLength(1);

    fireEvent.focus(eventMarkers[0] as Element);
    expect(screen.getByLabelText('Selected chart point')).toHaveTextContent('Jan 5, 2025');
    expect(screen.getByLabelText('Selected chart point')).toHaveTextContent(
      'Pain spiked after a heavy pressing day.',
    );

    const controlledId = screen.getByRole('button', { name: '3M' }).getAttribute('aria-controls');
    expect(controlledId).toBe('severity-chart-visual');
    expect(container.querySelectorAll(`#${controlledId}`)).toHaveLength(1);
    expect(new Set([...container.querySelectorAll('[id]')].map((node) => node.id)).size).toBe(
      container.querySelectorAll('[id]').length,
    );
  });

  it('shows a fallback when fewer than two severity data points are available', () => {
    render(
      <SeverityChart
        severityHistory={[condition.severityHistory[0]]}
        timeline={condition.timeline}
      />,
    );

    expect(screen.getByText('Not enough data to show a trend yet')).toBeInTheDocument();
    expect(screen.getByText(/severity of zero remains a valid observation/i)).toBeInTheDocument();
    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument();
  });

  it('keeps zero severity as a real exact observation', () => {
    render(
      <SeverityChart
        severityHistory={[
          { date: '2025-01-01', value: 2 },
          { date: '2025-01-10', value: 0 },
        ]}
        timeline={[]}
      />,
    );

    expect(screen.getByLabelText('Selected severity range summary')).toHaveTextContent(
      'Latest severity0 / 10',
    );
    fireEvent.click(screen.getByText('View exact chart values'));
    expect(screen.getByRole('cell', { name: '0 / 10' })).toBeInTheDocument();
  });

  it('labels event-only interpolation separately from recorded zero severity', () => {
    expect(
      buildSeverityChartData(
        [
          { date: '2025-01-01', value: 2 },
          { date: '2025-01-03', value: 0 },
        ],
        [
          {
            date: '2025-01-02',
            event: 'Treatment day',
            id: 'event-only',
            type: 'treatment',
          },
        ],
      ),
    ).toEqual([
      expect.objectContaining({ date: '2025-01-01', observed: true, value: 2 }),
      expect.objectContaining({ date: '2025-01-02', observed: false, value: 1 }),
      expect.objectContaining({ date: '2025-01-03', observed: true, value: 0 }),
    ]);
  });

  it('keeps event-only severity unavailable without inventing a zero', () => {
    const event = {
      date: '2025-01-02',
      event: 'Treatment day',
      id: 'event-only',
      type: 'treatment' as const,
    };
    expect(buildSeverityChartData([], [event])).toEqual([
      expect.objectContaining({ date: '2025-01-02', observed: false, value: null }),
    ]);

    render(<SeverityChart severityHistory={[]} timeline={[event]} />);
    fireEvent.click(screen.getByText('View exact chart values'));
    const row = screen.getByRole('row', { name: /Jan 2, 2025/ });
    expect(row).toHaveTextContent('Not available');
    expect(row).not.toHaveTextContent('0 / 10');
  });

  it('uses one real observation as a modeled basis while preserving observed zero', () => {
    expect(
      buildSeverityChartData(
        [{ date: '2025-01-01', value: 4 }],
        [{ date: '2025-01-02', event: 'Treatment', id: 'event', type: 'treatment' }],
      ),
    ).toEqual([
      expect.objectContaining({ date: '2025-01-01', observed: true, value: 4 }),
      expect.objectContaining({ date: '2025-01-02', observed: false, value: 4 }),
    ]);
    expect(buildSeverityChartData([{ date: '2025-01-01', value: 0 }], [])).toEqual([
      expect.objectContaining({ observed: true, value: 0 }),
    ]);
  });
});
