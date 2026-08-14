import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdaptiveSetupForm } from './adaptive-setup-form';

const mocks = vi.hoisted(() => ({
  putProgram: vi.fn(),
  useLatestWeight: vi.fn(),
}));

vi.mock('../api/adaptive-nutrition', () => ({
  usePutAdaptiveNutritionProgram: () => ({
    isPending: false,
    mutateAsync: mocks.putProgram,
  }),
}));

vi.mock('@/features/weight/api/weight', () => ({
  useLatestWeight: mocks.useLatestWeight,
}));

vi.mock('@/hooks/use-weight-unit', () => ({
  useWeightUnit: () => ({ weightUnit: 'lbs' }),
}));

describe('AdaptiveSetupForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-13T16:00:00.000Z'));
    mocks.useLatestWeight.mockReturnValue({ data: null, isLoading: false });
    mocks.putProgram.mockResolvedValue({ id: 'program-1' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('submits manual setup with an entered pound weight and maintenance rate', async () => {
    render(<AdaptiveSetupForm currentTarget={null} />);

    fireEvent.change(screen.getByLabelText('Starting equation'), {
      target: { value: 'manual_tdee' },
    });
    fireEvent.change(screen.getByLabelText('Starting TDEE (kcal/day)'), {
      target: { value: '2450' },
    });
    fireEvent.change(screen.getByLabelText('Current weight (lbs)'), {
      target: { value: '180' },
    });
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'maintain' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview starting targets' }));

    await waitFor(() => expect(mocks.putProgram).toHaveBeenCalledTimes(1));
    expect(mocks.putProgram).toHaveBeenCalledWith(
      expect.objectContaining({
        activityLevel: null,
        birthDate: null,
        currentWeight: { unit: 'lbs', weight: 180 },
        goalRatePctPerWeek: 0,
        goalType: 'maintain',
        heightCm: null,
        manualBaselineTdeeKcal: 2450,
        rebaseline: false,
        rmrEquation: 'manual_tdee',
        supersedePending: false,
        targetWeightKg: null,
      }),
    );
  });

  it('offers a recent saved kg entry while converting entered-weight defaults to pounds', () => {
    mocks.useLatestWeight.mockReturnValue({
      data: { date: '2026-08-10', unit: 'kg', weight: 80 },
      isLoading: false,
    });
    render(<AdaptiveSetupForm currentTarget={null} />);

    expect(screen.getByRole('button', { name: /Use 80 kg from/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Protein (g/day)')).toHaveValue(145);
    fireEvent.click(screen.getByRole('button', { name: 'Enter a current weight' }));
    expect(
      (screen.getByLabelText('Current weight (lbs)') as HTMLInputElement).valueAsNumber,
    ).toBeCloseTo(176.37, 2);
  });

  it('compares a saved kg weight with a pound target in canonical kilograms', async () => {
    mocks.useLatestWeight.mockReturnValue({
      data: { date: '2026-08-10', unit: 'kg', weight: 80 },
      isLoading: false,
    });
    render(<AdaptiveSetupForm currentTarget={null} />);

    fireEvent.change(screen.getByLabelText('Starting equation'), {
      target: { value: 'manual_tdee' },
    });
    fireEvent.change(screen.getByLabelText('Starting TDEE (kcal/day)'), {
      target: { value: '2450' },
    });
    fireEvent.change(screen.getByLabelText('Target weight (lbs)'), {
      target: { value: '170' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview starting targets' }));

    await waitFor(() => expect(mocks.putProgram).toHaveBeenCalledTimes(1));
    expect(mocks.putProgram).toHaveBeenCalledWith(
      expect.objectContaining({
        currentWeight: null,
        targetWeightKg: expect.closeTo(77.1107, 4),
      }),
    );
  });

  it('rejects an old saved weight and a loss target above current weight', async () => {
    mocks.useLatestWeight.mockReturnValue({
      data: { date: '2026-08-01', unit: 'lbs', weight: 180 },
      isLoading: false,
    });
    render(<AdaptiveSetupForm currentTarget={null} />);

    expect(screen.getByText(/more than seven days old/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Starting equation'), {
      target: { value: 'manual_tdee' },
    });
    fireEvent.change(screen.getByLabelText('Starting TDEE (kcal/day)'), {
      target: { value: '2450' },
    });
    fireEvent.change(screen.getByLabelText('Target weight (lbs)'), {
      target: { value: '185' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview starting targets' }));

    expect(
      await screen.findByText('Loss target must be below your current weight'),
    ).toBeInTheDocument();
    expect(mocks.putProgram).not.toHaveBeenCalled();
  });
});
