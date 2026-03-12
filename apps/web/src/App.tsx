import { Suspense, lazy, type ReactNode, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Toaster } from 'sonner';
import { GuestRoute } from '@/components/auth/guest-route';
import { AuthRouteLoader } from '@/components/auth/auth-route-loader';
import { PageSkeleton } from '@/components/skeletons';
import { ErrorBoundary } from '@/components/error-boundary';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { AppLayout } from '@/components/layout/app-layout';
import { createAppQueryClient } from '@/lib/query-client';

// Page modules use named exports, so each lazy import maps a named export to `default`.
const ActivityPage = lazy(async () => {
  const module = await import('./pages/activity');
  return { default: module.ActivityPage };
});

const ActiveWorkoutPage = lazy(async () => {
  const module = await import('./pages/active-workout');
  return { default: module.ActiveWorkoutPage };
});

const DashboardPage = lazy(async () => {
  const module = await import('./pages/dashboard');
  return { default: module.DashboardPage };
});

const DesignSystemPage = lazy(async () => {
  const module = await import('./pages/design-system');
  return { default: module.DesignSystemPage };
});

const EquipmentRoutePage = lazy(async () => {
  const module = await import('./pages/equipment');
  return { default: module.EquipmentRoutePage };
});

const FoodsPage = lazy(async () => {
  const module = await import('./pages/foods');
  return { default: module.FoodsPage };
});

const HabitsPage = lazy(async () => {
  const module = await import('./pages/habits');
  return { default: module.HabitsPage };
});

const InjuriesPage = lazy(async () => {
  const module = await import('./pages/injuries');
  return { default: module.InjuriesPage };
});

const InjuryDetailPage = lazy(async () => {
  const module = await import('./pages/injury-detail');
  return { default: module.InjuryDetailPage };
});

const JournalEntryPage = lazy(async () => {
  const module = await import('./pages/journal-entry');
  return { default: module.JournalEntryPage };
});

const JournalPage = lazy(async () => {
  const module = await import('./pages/journal');
  return { default: module.JournalPage };
});

const LoginPage = lazy(async () => {
  const module = await import('./pages/login');
  return { default: module.LoginPage };
});

const NutritionPage = lazy(async () => {
  const module = await import('./pages/nutrition');
  return { default: module.NutritionPage };
});

const ProfilePage = lazy(async () => {
  const module = await import('./pages/profile');
  return { default: module.ProfilePage };
});

const RegisterPage = lazy(async () => {
  const module = await import('./pages/register');
  return { default: module.RegisterPage };
});

const ResourceDetailPage = lazy(async () => {
  const module = await import('./pages/resource-detail');
  return { default: module.ResourceDetailPage };
});

const ResourcesPage = lazy(async () => {
  const module = await import('./pages/resources');
  return { default: module.ResourcesPage };
});

const SettingsPage = lazy(async () => {
  const module = await import('./pages/settings');
  return { default: module.SettingsPage };
});

const WorkoutsPage = lazy(async () => {
  const module = await import('./pages/workouts');
  return { default: module.WorkoutsPage };
});

const WeightHistoryPage = lazy(async () => {
  const module = await import('./pages/weight-history');
  return { default: module.WeightHistoryPage };
});

const WorkoutSessionDetailPage = lazy(async () => {
  const module = await import('./pages/workout-session-detail');
  return { default: module.WorkoutSessionDetailPage };
});

const WorkoutTemplateDetailPage = lazy(async () => {
  const module = await import('./pages/workout-template-detail');
  return { default: module.WorkoutTemplateDetailPage };
});

function renderWithPageFallback(element: ReactNode) {
  return <Suspense fallback={<PageSkeleton />}>{element}</Suspense>;
}

function renderWithAuthFallback(element: ReactNode) {
  return <Suspense fallback={<AuthRouteLoader />}>{element}</Suspense>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        element={
          <GuestRoute>
            {renderWithAuthFallback(<LoginPage />)}
          </GuestRoute>
        }
        path="/login"
      />
      <Route
        element={
          <GuestRoute>
            {renderWithAuthFallback(<RegisterPage />)}
          </GuestRoute>
        }
        path="/register"
      />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
        path="/"
      >
        <Route element={renderWithPageFallback(<DashboardPage />)} index />
        <Route element={renderWithPageFallback(<DesignSystemPage />)} path="design-system" />
        <Route element={renderWithPageFallback(<WorkoutsPage />)} path="workouts" />
        <Route element={renderWithPageFallback(<ActiveWorkoutPage />)} path="workouts/active" />
        <Route
          element={renderWithPageFallback(<WorkoutSessionDetailPage />)}
          path="workouts/session/:sessionId"
        />
        <Route
          element={renderWithPageFallback(<WorkoutTemplateDetailPage />)}
          path="workouts/template/:templateId"
        />
        <Route element={renderWithPageFallback(<NutritionPage />)} path="nutrition" />
        <Route element={renderWithPageFallback(<HabitsPage />)} path="habits" />
        <Route element={renderWithPageFallback(<ActivityPage />)} path="activity" />
        <Route element={renderWithPageFallback(<FoodsPage />)} path="foods" />
        <Route element={renderWithPageFallback(<JournalPage />)} path="journal" />
        <Route element={renderWithPageFallback(<JournalEntryPage />)} path="journal/:entryId" />
        <Route element={renderWithPageFallback(<WeightHistoryPage />)} path="weight" />
        <Route element={renderWithPageFallback(<ProfilePage />)} path="profile" />
        <Route
          element={renderWithPageFallback(<EquipmentRoutePage />)}
          path="profile/equipment"
        />
        <Route element={renderWithPageFallback(<InjuriesPage />)} path="profile/injuries" />
        <Route
          element={renderWithPageFallback(<InjuryDetailPage />)}
          path="profile/injuries/:conditionId"
        />
        <Route element={renderWithPageFallback(<ResourcesPage />)} path="profile/resources" />
        <Route
          element={renderWithPageFallback(<ResourceDetailPage />)}
          path="profile/resources/:resourceId"
        />
        <Route element={renderWithPageFallback(<SettingsPage />)} path="settings" />
      </Route>
    </Routes>
  );
}

function App() {
  const [queryClient] = useState(() => createAppQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
      <Toaster closeButton position="top-center" richColors />
    </QueryClientProvider>
  );
}

export default App;
