import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ChartAnnotationLayer,
  ChartDataTable,
  ChartFrame,
  ChartLegend,
  ChartPointDetail,
  ChartRangeControl,
  ChartState,
  ChartSummary,
  ChartTooltip,
  formatChartAxisDate,
  formatChartDate,
} from '.';

describe('Pulse chart primitives', () => {
  it('renders one labeled frame with compositional controls and content', () => {
    render(
      <ChartFrame
        controls={<button type="button">Control</button>}
        description="Exact chart description"
        title="Progress"
      >
        <div>Visual</div>
      </ChartFrame>,
    );

    expect(screen.getByRole('figure', { name: 'Progress' })).toHaveAccessibleDescription(
      'Exact chart description',
    );
    expect(screen.getByRole('button', { name: 'Control' })).toBeInTheDocument();
  });

  it('uses 44px pressed range buttons and announces the selected window', () => {
    const onChange = vi.fn();
    render(
      <ChartRangeControl
        label="Chart range"
        onChange={onChange}
        options={[
          { value: '1w', label: '1W' },
          { value: '1m', label: '1M' },
        ]}
        statusText="1M · Jul 24–Aug 22 · 12 observations"
        value="1m"
      />,
    );

    expect(screen.getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '1M' })).toHaveClass('min-h-11', 'min-w-11');
    fireEvent.click(screen.getByRole('button', { name: '1W' }));
    expect(onChange).toHaveBeenCalledWith('1w');
    expect(screen.getByText(/12 observations/)).toHaveAttribute('aria-live', 'polite');
  });

  it('renders semantic summary facts and honest unavailable tooltip values', () => {
    render(
      <>
        <ChartSummary
          items={[{ label: 'Average', value: '2,100 kcal', detail: '12 logged days' }]}
          label="Selected range summary"
        />
        <ChartTooltip
          date="Aug 22, 2026"
          rows={[
            { label: 'Calories', value: '2,100 kcal' },
            { label: 'Protein', value: null },
          ]}
        />
      </>,
    );

    expect(screen.getByLabelText('Selected range summary')).toHaveTextContent(
      'Average2,100 kcal12 logged days',
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent('Protein Not available');
  });

  it('renders non-color legend labels and selectable annotation text', () => {
    const onSelect = vi.fn();
    render(
      <>
        <ChartLegend
          items={[
            { color: '#fff', label: 'Scale', style: 'dot' },
            { color: '#fff', label: 'Trend', style: 'line' },
            { color: '#fff', label: 'Goal', style: 'dashed' },
          ]}
        />
        <ChartAnnotationLayer
          annotations={[{ id: 'event-1', date: '2026-08-22', label: 'Goal revised' }]}
          formatDate={formatChartDate}
          onSelect={onSelect}
        />
      </>,
    );

    expect(screen.getByLabelText('Chart legend')).toHaveTextContent('ScaleTrendGoal');
    fireEvent.click(screen.getByRole('button', { name: 'Aug 22, 2026 · Goal revised' }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'event-1', date: '2026-08-22' }),
    );
  });

  it('keeps persistent details and exact rows keyboard-operable', () => {
    const onSelect = vi.fn();
    render(
      <>
        <ChartPointDetail>Aug 22 · Calories 2,100 kcal</ChartPointDetail>
        <ChartDataTable
          caption="Exact nutrition chart values"
          columns={[
            {
              key: 'date',
              header: 'Date',
              render: (row: { date: string; value: number }) => row.date,
            },
            { key: 'value', header: 'Calories', render: (row) => `${row.value} kcal` },
          ]}
          getRowKey={(row) => row.date}
          onSelectRow={onSelect}
          rows={[{ date: '2026-08-22', value: 2100 }]}
          selectionLabel={(row) => `Inspect ${row.date}`}
        />
      </>,
    );

    expect(screen.getByLabelText('Selected chart point')).toHaveAttribute('aria-live', 'polite');
    fireEvent.click(screen.getByText('View exact chart values'));
    fireEvent.click(screen.getByRole('button', { name: 'Inspect 2026-08-22: 2026-08-22' }));
    expect(onSelect).toHaveBeenCalledWith({ date: '2026-08-22', value: 2100 });
    expect(screen.getByRole('columnheader', { name: 'Calories' })).toHaveAttribute('scope', 'col');
  });

  it('standardizes loading and retryable error semantics', () => {
    const retry = vi.fn();
    const { rerender } = render(
      <ChartState description="Loading exact values." kind="loading" title="Loading chart" />,
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');

    rerender(
      <ChartState
        description="Your data is safe."
        kind="error"
        onAction={retry}
        title="Chart could not be loaded"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('Your data is safe.');
  });

  it('formats date-only keys without ambient-zone interpretation', () => {
    expect(formatChartDate('2026-03-08')).toBe('Mar 8, 2026');
    expect(formatChartAxisDate('2026-11-01')).toBe('Nov 1');
  });
});
