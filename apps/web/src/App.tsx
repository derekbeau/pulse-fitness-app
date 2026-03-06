import { BrowserRouter, Route, Routes } from 'react-router';
import { AppLayout } from '@/components/layout/app-layout';
import { ActivityPage } from '@/pages/activity';
import { DashboardPage } from '@/pages/dashboard';
import { DesignSystemPage } from '@/pages/design-system';
import { FoodsPage } from '@/pages/foods';
import { HabitsPage } from '@/pages/habits';
import { JournalPage } from '@/pages/journal';
import { NutritionPage } from '@/pages/nutrition';
import { SettingsPage } from '@/pages/settings';
import { WorkoutTemplateDetailPage } from '@/pages/workout-template-detail';
import { WorkoutsPage } from '@/pages/workouts';

function AppRoutes() {
  return (
    <AppLayout>
      <Routes>
        <Route element={<DashboardPage />} path="/" />
        <Route element={<DesignSystemPage />} path="/design-system" />
        <Route element={<WorkoutsPage />} path="/workouts" />
        <Route element={<WorkoutTemplateDetailPage />} path="/workouts/template/:templateId" />
        <Route element={<NutritionPage />} path="/nutrition" />
        <Route element={<HabitsPage />} path="/habits" />
        <Route element={<ActivityPage />} path="/activity" />
        <Route element={<FoodsPage />} path="/foods" />
        <Route element={<JournalPage />} path="/journal" />
        <Route element={<SettingsPage />} path="/settings" />
      </Routes>
    </AppLayout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
