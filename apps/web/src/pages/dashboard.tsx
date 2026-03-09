import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarPicker } from '@/features/dashboard/components/calendar-picker';
import { HabitChain } from '@/features/dashboard/components/habit-chain';
import { MacroRings } from '@/features/dashboard/components/macro-rings';
import { RecentWorkouts } from '@/features/dashboard/components/recent-workouts';
import { SnapshotCards } from '@/features/dashboard/components/snapshot-cards';
import { getDashboardGreeting } from '@/features/dashboard/lib/greeting';
import { TrendSparklines } from '@/features/dashboard/components/trend-sparkline';
import { useHabits } from '@/features/habits/api/habits';
import { useLogWeight } from '@/features/weight/api/weight';
import { useDashboardSnapshot, dashboardSnapshotKeys } from '@/hooks/use-dashboard-snapshot';
import { useHabitChains } from '@/hooks/use-habit-chains';
import { addDays, getToday, toDateKey } from '@/lib/date';

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(() => getToday());
  const [weightInput, setWeightInput] = useState('');
  const [weightMessage, setWeightMessage] = useState('');
  const logWeightMutation = useLogWeight();
  const selectedDateKey = toDateKey(selectedDate);
  const habitRangeStart = toDateKey(addDays(selectedDate, -29));
  const greeting = getDashboardGreeting();

  const snapshotQuery = useDashboardSnapshot(selectedDateKey);
  const habitsQuery = useHabits();
  const habitChainEntriesQuery = useHabitChains(habitRangeStart, selectedDateKey);

  async function handleWeightSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedWeight = Number(weightInput);
    if (Number.isNaN(parsedWeight) || parsedWeight <= 0) {
      setWeightMessage('Enter a valid weight above 0.');
      return;
    }

    try {
      await logWeightMutation.mutateAsync({
        date: selectedDateKey,
        weight: parsedWeight,
      });
      await queryClient.invalidateQueries({ queryKey: dashboardSnapshotKeys.all });
      setWeightInput('');
      setWeightMessage('Weight entry saved.');
    } catch {
      setWeightMessage('Unable to save weight. Please try again.');
    }
  }

  return (
    <main className="flex w-full flex-col gap-8 py-6">
      <header className="animate-fade-in space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted sm:text-sm">
          {greeting}
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          Dashboard
        </h1>
      </header>

      <div
        className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(280px,320px)]"
        data-slot="dashboard-layout"
      >
        <div
          className="order-1 flex min-w-0 flex-col gap-6 md:order-1 xl:order-2"
          data-slot="dashboard-main-column"
        >
          <div className="order-1 md:order-3" data-slot="dashboard-calendar-panel">
            <CalendarPicker onDateSelect={setSelectedDate} selectedDate={selectedDate} />
          </div>

          <div className="order-2 md:order-1" data-slot="dashboard-snapshot-panel">
            <div className="flex flex-col gap-6">
              <SnapshotCards snapshot={snapshotQuery.data} />
              <Card data-qa="dashboard-log-weight-card" data-testid="dashboard-log-weight-card">
                <CardHeader className="space-y-1">
                  <CardTitle>Log Weight</CardTitle>
                  <CardDescription>Track your body weight for the selected day.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-3"
                    data-qa="dashboard-log-weight-form"
                    data-testid="dashboard-log-weight-form"
                    onSubmit={handleWeightSubmit}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="dashboard-weight-input">Weight (lbs)</Label>
                      <Input
                        aria-describedby="dashboard-weight-status"
                        data-qa="dashboard-weight-input"
                        data-testid="dashboard-weight-input"
                        id="dashboard-weight-input"
                        inputMode="decimal"
                        min="0.1"
                        name="weight"
                        onChange={(event) => {
                          setWeightInput(event.currentTarget.value);
                          setWeightMessage('');
                        }}
                        placeholder="e.g. 175.5"
                        step="0.1"
                        type="number"
                        value={weightInput}
                      />
                    </div>
                    <Button
                      data-qa="dashboard-save-weight"
                      data-testid="dashboard-save-weight"
                      id="dashboard-save-weight"
                      disabled={logWeightMutation.isPending}
                      type="submit"
                    >
                      {logWeightMutation.isPending ? 'Saving...' : 'Save Weight'}
                    </Button>
                    {weightMessage ? (
                      <p
                        className="text-sm text-muted-foreground"
                        id="dashboard-weight-status"
                        role="status"
                      >
                        {weightMessage}
                      </p>
                    ) : null}
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="order-3 md:order-2" data-slot="dashboard-macro-panel">
            <MacroRings snapshot={snapshotQuery.data} />
          </div>
        </div>

        <div
          className="order-2 flex min-w-0 flex-col gap-6 md:order-2 xl:order-1"
          data-slot="dashboard-sidebar-column"
        >
          <HabitChain
            endDate={selectedDateKey}
            habits={habitsQuery.data ?? []}
            entries={habitChainEntriesQuery.data ?? []}
          />
          <TrendSparklines endDate={selectedDateKey} />
        </div>

        <div
          className="order-3 min-w-0 md:col-start-2 xl:col-start-3"
          data-slot="dashboard-recent-workouts-column"
        >
          <RecentWorkouts />
        </div>
      </div>
    </main>
  );
}
