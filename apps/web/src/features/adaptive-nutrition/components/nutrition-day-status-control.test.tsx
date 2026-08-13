import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NutritionDayStatusControl } from './nutrition-day-status-control';

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('@/features/nutrition/api/nutrition', () => ({
  useUpdateNutritionStatus: () => ({
    error: null,
    isError: false,
    isPending: false,
    mutateAsync: mocks.mutateAsync,
  }),
}));

describe('NutritionDayStatusControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutateAsync.mockResolvedValue({ status: 'complete' });
  });

  it('disables status choices until the day has a nutrition log', () => {
    render(<NutritionDayStatusControl date="2026-08-13" isToday status={null} />);
    expect(screen.getByRole('button', { name: /Unknown/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Partial/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Complete/ })).toBeDisabled();
    expect(screen.getByText(/Log at least one meal/)).toBeInTheDocument();
  });

  it('updates a past day directly and exposes text state in addition to color', async () => {
    render(<NutritionDayStatusControl date="2026-08-12" isToday={false} status="unknown" />);
    expect(screen.getByText('unknown')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unknown/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Partial/ }));
    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({ date: '2026-08-12', status: 'partial' }),
    );
  });

  it('requires explicit confirmation before marking today complete', async () => {
    render(<NutritionDayStatusControl date="2026-08-13" isToday status="partial" />);
    fireEvent.click(screen.getByRole('button', { name: /Complete/ }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }));
    await waitFor(() =>
      expect(mocks.mutateAsync).toHaveBeenCalledWith({ date: '2026-08-13', status: 'complete' }),
    );
  });
});
