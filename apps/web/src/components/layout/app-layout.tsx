import type { PropsWithChildren } from 'react';
import { BottomNav } from '@/components/layout/bottom-nav';
import { Sidebar } from '@/components/layout/sidebar';

export function AppLayout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-screen-2xl">
        <Sidebar />
        <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-8 md:pt-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
