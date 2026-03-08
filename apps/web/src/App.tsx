import { BrowserRouter, Route, Routes } from 'react-router';
import { AppLayout } from '@/components/layout/app-layout';
import { ActivityPage } from '@/pages/activity';
import { DashboardPage } from '@/pages/dashboard';
import { DesignSystemPage } from '@/pages/design-system';
import { EquipmentRoutePage } from '@/pages/equipment';
import { FoodsPage } from '@/pages/foods';
import { JournalEntryPage } from '@/pages/journal-entry';
import { HabitsPage } from '@/pages/habits';
import { InjuriesPage } from '@/pages/injuries';
import { InjuryDetailPage } from '@/pages/injury-detail';
import { JournalPage } from '@/pages/journal';
import { LoginPage } from '@/pages/login';
import { NutritionPage } from '@/pages/nutrition';
import { ProfilePage } from '@/pages/profile';
import { RegisterPage } from '@/pages/register';
import { ResourceDetailPage } from '@/pages/resource-detail';
import { ResourcesPage } from '@/pages/resources';
import { SettingsPage } from '@/pages/settings';
import { ActiveWorkoutPage } from '@/pages/active-workout';
import { WorkoutSessionDetailPage } from '@/pages/workout-session-detail';
import { WorkoutTemplateDetailPage } from '@/pages/workout-template-detail';
import { WorkoutsPage } from '@/pages/workouts';

function AppRoutes() {
  return (
    <Routes>
      <Route element={<LoginPage />} path="/login" />
      <Route element={<RegisterPage />} path="/register" />
      <Route element={<AppLayout />} path="/">
        <Route element={<DashboardPage />} index />
        <Route element={<DesignSystemPage />} path="design-system" />
        <Route element={<WorkoutsPage />} path="workouts" />
        <Route element={<ActiveWorkoutPage />} path="workouts/active" />
        <Route element={<WorkoutSessionDetailPage />} path="workouts/session/:sessionId" />
        <Route element={<WorkoutTemplateDetailPage />} path="workouts/template/:templateId" />
        <Route element={<NutritionPage />} path="nutrition" />
        <Route element={<HabitsPage />} path="habits" />
        <Route element={<ActivityPage />} path="activity" />
        <Route element={<FoodsPage />} path="foods" />
        <Route element={<JournalPage />} path="journal" />
        <Route element={<JournalEntryPage />} path="journal/:entryId" />
        <Route element={<ProfilePage />} path="profile" />
        <Route element={<EquipmentRoutePage />} path="profile/equipment" />
        <Route element={<InjuriesPage />} path="profile/injuries" />
        <Route element={<InjuryDetailPage />} path="profile/injuries/:conditionId" />
        <Route element={<ResourcesPage />} path="profile/resources" />
        <Route element={<ResourceDetailPage />} path="profile/resources/:resourceId" />
        <Route element={<SettingsPage />} path="settings" />
      </Route>
    </Routes>
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
