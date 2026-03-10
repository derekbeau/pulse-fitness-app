import type { PropsWithChildren } from 'react';
import { Outlet } from 'react-router';
import { BottomNav } from '@/components/layout/bottom-nav';
import { Sidebar } from '@/components/layout/sidebar';
import { ActiveSessionResumeGate } from '@/components/workouts/active-session-resume-gate';

export function AppLayout({ children }: PropsWithChildren) {
  const content = children ?? <Outlet />;

  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <ActiveSessionResumeGate />
      <div className="mx-auto flex min-h-screen w-full max-w-screen-2xl">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-x-clip px-4 pb-24 pt-20 md:px-8 md:pb-8 md:pt-8">
          {content}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
