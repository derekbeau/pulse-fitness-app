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

  it('renders a responsive chart with event markers and hover details', () => {
    const { container } = render(
      <SeverityChart severityHistory={condition.severityHistory} timeline={condition.timeline} />,
    );

    expect(screen.getByText('Pain / Severity Over Time')).toBeInTheDocument();
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Pain / Severity Over Time chart' }),
    ).toBeInTheDocument();

    const eventMarkers = container.querySelectorAll('[data-slot="severity-event-marker"]');
    expect(eventMarkers).toHaveLength(1);

    fireEvent.focus(eventMarkers[0] as Element);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('Jan 5, 2025');
    expect(tooltip).toHaveTextContent('Pain spiked after a heavy pressing day.');
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
});
