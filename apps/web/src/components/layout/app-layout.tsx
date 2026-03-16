import type { PropsWithChildren } from 'react';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet } from 'react-router';
import { BottomNav } from '@/components/layout/bottom-nav';
import { Sidebar } from '@/components/layout/sidebar';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { ActiveSessionResumeGate } from '@/components/workouts/active-session-resume-gate';

export function AppLayout({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const content = children ?? <Outlet />;

  const handleRefresh = useCallback(() => queryClient.invalidateQueries(), [queryClient]);

  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <PullToRefresh onRefresh={handleRefresh} />
      <ActiveSessionResumeGate />
      <div className="flex min-h-screen w-full max-w-screen-2xl">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-x-clip px-4 pb-24 pt-4 md:px-6 md:pb-8 md:pt-6">
          {content}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
