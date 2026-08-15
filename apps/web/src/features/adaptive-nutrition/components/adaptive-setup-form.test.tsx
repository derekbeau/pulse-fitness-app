import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { NutritionTarget } from '@pulse/shared';
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

  it('submits manual setup exactly once with an entered pound weight and maintenance rate', async () => {
    render(<AdaptiveSetupForm currentTarget={null} />);
    fillManualBaseline(2450, 180);
    selectChoice('Goal direction', 'Maintain');

    expect(screen.getByTestId('setup-projection')).toHaveTextContent('Maintain around 180 lbs');
    expect(screen.getByTestId('setup-projection')).toHaveTextContent('2,450');
    expect(mocks.putProgram).not.toHaveBeenCalled();

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
        userCalorieFloorKcal: undefined,
      }),
    );
    expect(screen.getByText(/do not change until you review it/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use these targets' })).not.toBeInTheDocument();
  });

  it('offers a recent saved kg entry while converting entered-weight defaults and protein presets', () => {
    mocks.useLatestWeight.mockReturnValue({
      data: { date: '2026-08-10', unit: 'kg', weight: 80 },
      isLoading: false,
    });
    render(<AdaptiveSetupForm currentTarget={null} />);

    expect(screen.getByRole('button', { name: /Use 80 kg from/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const proteinGroup = screen.getByRole('radiogroup', { name: 'Protein target' });
    expect(within(proteinGroup).getByRole('radio', { name: /Recommended/ })).toBeChecked();
    expect(within(proteinGroup).getByText(/145 g\/day/)).toBeInTheDocument();

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

    chooseManualTdee(2450);
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
    chooseManualTdee(2450);
    fireEvent.change(screen.getByLabelText('Target weight (lbs)'), {
      target: { value: '185' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview starting targets' }));

    expect(
      await screen.findByText('Loss target must be below your current weight'),
    ).toBeInTheDocument();
    expect(mocks.putProgram).not.toHaveBeenCalled();
  });

  it('updates a recommended gain projection live without mutating', () => {
    render(<AdaptiveSetupForm currentTarget={null} />);
    fillManualBaseline(2450, 177.2);
    selectChoice('Goal direction', 'Gain weight');
    fireEvent.change(screen.getByLabelText('Target weight (lbs)'), {
      target: { value: '185' },
    });
    selectChoice('Weekly goal rate', 'Faster');

    const projection = screen.getByTestId('setup-projection');
    expect(projection).toHaveTextContent('Gain to 185 lbs');
    expect(projection).toHaveTextContent('About 13 weeks');
    expect(projection).toHaveTextContent('0.62 lb/wk');
    expect(projection).toHaveTextContent('0.65 lb/wk');
    expect(projection).toHaveTextContent('2.69 lb/mo');
    expect(projection).toHaveTextContent('Faster · Recommended');
    expect(mocks.putProgram).not.toHaveBeenCalled();
  });

  it('explains a custom gain rate outside the recommended band without blocking it', () => {
    render(<AdaptiveSetupForm currentTarget={null} />);
    fillManualBaseline(2450, 177.2);
    selectChoice('Goal direction', 'Gain weight');
    fireEvent.change(screen.getByLabelText('Target weight (lbs)'), {
      target: { value: '185' },
    });
    selectChoice('Weekly goal rate', 'Custom');
    fireEvent.change(screen.getByLabelText('Custom rate (% body weight/week)'), {
      target: { value: '0.45' },
    });

    expect(screen.getByTestId('setup-projection')).toHaveTextContent(
      /allowed but outside Pulse’s recommended gain range/i,
    );
    expect(screen.getByRole('img', { name: /Recommended 0.10 to 0.35 percent/ })).toBeVisible();
    expect(mocks.putProgram).not.toHaveBeenCalled();
  });

  it('updates protein and fat/carbohydrate results from accessible presets', () => {
    render(<AdaptiveSetupForm currentTarget={null} />);
    fillManualBaseline(2450, 176.37);
    selectChoice('Goal direction', 'Gain weight');
    fireEvent.change(screen.getByLabelText('Target weight (lbs)'), {
      target: { value: '185' },
    });
    selectChoice('Protein target', 'High');
    selectChoice('Fat and carbohydrate preference', 'Higher fat');

    const projection = screen.getByTestId('setup-projection');
    expect(projection).toHaveTextContent(/Protein175 g · 2\.19 g\/kg · 0\.99 g\/lb/);
    expect(projection).toHaveTextContent(/Fat105 g/);
    expect(projection).toHaveTextContent(/Carbohydrate256 g/);
    expect(mocks.putProgram).not.toHaveBeenCalled();
  });

  it('preserves an existing non-preset protein target as Custom', () => {
    mocks.useLatestWeight.mockReturnValue({
      data: { date: '2026-08-10', unit: 'kg', weight: 80 },
      isLoading: false,
    });
    render(<AdaptiveSetupForm currentTarget={nutritionTarget({ protein: 167 })} />);

    const proteinGroup = screen.getByRole('radiogroup', { name: 'Protein target' });
    expect(within(proteinGroup).getByRole('radio', { name: /Custom/ })).toBeChecked();
    expect(screen.getByLabelText('Custom protein (g/day)')).toHaveValue(167);
  });

  it('removes stale numbers when a valid target becomes directionally invalid', () => {
    render(<AdaptiveSetupForm currentTarget={null} />);
    fillManualBaseline(2450, 177.2);
    selectChoice('Goal direction', 'Gain weight');
    const target = screen.getByLabelText('Target weight (lbs)');
    fireEvent.change(target, { target: { value: '185' } });
    expect(screen.getByTestId('setup-projection')).toHaveTextContent(/About \d+ weeks/);

    fireEvent.change(target, { target: { value: '170' } });
    expect(screen.queryByTestId('setup-projection')).not.toBeInTheDocument();
    expect(
      screen.getByText('Choose a gain target above your starting weight.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/About \d+ weeks/)).not.toBeInTheDocument();
  });

  it('discloses loss floor and deficit guardrails in the live plan', () => {
    render(<AdaptiveSetupForm currentTarget={null} />);
    fillManualBaseline(2000, 220.46);
    fireEvent.change(screen.getByLabelText('Target weight (lbs)'), {
      target: { value: '176.37' },
    });
    selectChoice('Weekly goal rate', 'Custom');
    fireEvent.change(screen.getByLabelText('Custom rate (% body weight/week)'), {
      target: { value: '1' },
    });
    fireEvent.click(screen.getByText('Advanced calorie floor'));
    fireEvent.change(screen.getByLabelText('Optional calorie floor (kcal/day)'), {
      target: { value: '1200' },
    });

    const projection = screen.getByTestId('setup-projection');
    expect(projection).toHaveTextContent(/calorie floor limits this starting target/i);
    expect(projection).toHaveTextContent(/maximum-deficit guardrail/i);
    expect(projection).toHaveTextContent('1,500');
  });

  it('exposes named radio groups and focusable preset controls for keyboard users', () => {
    render(<AdaptiveSetupForm currentTarget={null} />);

    for (const label of [
      'Goal direction',
      'Weekly goal rate',
      'Protein target',
      'Fat and carbohydrate preference',
    ]) {
      expect(screen.getByRole('radiogroup', { name: label })).toBeVisible();
    }
    const gain = within(screen.getByRole('radiogroup', { name: 'Goal direction' })).getByRole(
      'radio',
      { name: /Gain weight/ },
    );
    gain.focus();
    expect(gain).toHaveFocus();
    fireEvent.click(gain);
    expect(gain).toBeChecked();
  });
});

function chooseManualTdee(tdee: number) {
  fireEvent.change(screen.getByLabelText('Starting equation'), {
    target: { value: 'manual_tdee' },
  });
  fireEvent.change(screen.getByLabelText('Starting TDEE (kcal/day)'), {
    target: { value: String(tdee) },
  });
}

function fillManualBaseline(tdee: number, weight: number) {
  chooseManualTdee(tdee);
  fireEvent.change(screen.getByLabelText('Current weight (lbs)'), {
    target: { value: String(weight) },
  });
}

function selectChoice(groupName: string, choiceName: string) {
  const group = screen.getByRole('radiogroup', { name: groupName });
  fireEvent.click(within(group).getByRole('radio', { name: new RegExp(choiceName, 'i') }));
}

function nutritionTarget(overrides: Partial<NutritionTarget> = {}): NutritionTarget {
  return {
    adaptiveCheckInId: null,
    calories: 2500,
    carbs: 280,
    createdAt: 1,
    effectiveDate: '2026-08-01',
    fat: 80,
    id: 'target-1',
    macroCalories: 2500,
    protein: 160,
    source: 'manual',
    updatedAt: 1,
    ...overrides,
  };
}
