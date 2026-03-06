import { BrowserRouter, Route, Routes } from 'react-router';
import { AppLayout } from '@/components/layout/app-layout';
import { DashboardPage } from '@/pages/dashboard';
import { DesignSystemPage } from '@/pages/design-system';
import { FoodsPage } from '@/pages/foods';
import { HabitsPage } from '@/pages/habits';
import { NutritionPage } from '@/pages/nutrition';
import { SettingsPage } from '@/pages/settings';
import { WorkoutsPage } from '@/pages/workouts';

function AppRoutes() {
  return (
    <AppLayout>
      <Routes>
        <Route element={<DashboardPage />} path="/" />
        <Route element={<DesignSystemPage />} path="/design-system" />
        <Route element={<WorkoutsPage />} path="/workouts" />
        <Route element={<NutritionPage />} path="/nutrition" />
        <Route element={<HabitsPage />} path="/habits" />
        <Route element={<FoodsPage />} path="/foods" />
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
