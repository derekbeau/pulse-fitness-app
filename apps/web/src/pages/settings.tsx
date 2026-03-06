import { HabitSettings } from '@/features/habits';

export function SettingsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-semibold text-primary">Settings</h1>
      <p className="max-w-3xl text-sm text-muted">
        Configure the routines that feed the dashboard streak widgets. This prototype keeps all
        habit changes in local state so the interaction can be refined before wiring the API.
      </p>
      <HabitSettings />
    </section>
  );
}
