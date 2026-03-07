import { useState } from 'react';
import { NavLink } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { sidebarNavItems } from '@/components/layout/nav-items';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function getInitialCollapsed() {
  try {
    return localStorage.getItem('pulse-sidebar-collapsed') === 'true';
  } catch {
    return false;
  }
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;

      try {
        localStorage.setItem('pulse-sidebar-collapsed', String(next));
      } catch {
        // ignore
      }

      return next;
    });
  }

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 md:flex',
        collapsed ? 'w-[4.5rem]' : 'w-64',
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-6">
        {collapsed ? (
          <p className="w-full text-center text-2xl font-semibold tracking-tight text-primary">P</p>
        ) : (
          <p className="px-2 text-2xl font-semibold tracking-tight text-primary">Pulse</p>
        )}
      </div>

      <TooltipProvider delayDuration={0}>
        <nav
          className={cn('flex flex-1 flex-col gap-1 overflow-y-auto py-4', collapsed ? 'items-center' : 'px-4')}
          aria-label="Desktop navigation"
        >
          {sidebarNavItems.map((item) => {
            const Icon = item.icon;

            if (collapsed) {
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>
                    <NavLink
                      className="block"
                      end={item.end}
                      to={item.to}
                    >
                      {({ isActive }) => (
                        <span
                          className={cn(
                            'flex size-10 items-center justify-center rounded-lg transition-colors',
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted hover:bg-secondary hover:text-foreground',
                          )}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                      )}
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return (
              <NavLink
                key={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted hover:bg-secondary hover:text-foreground',
                  )
                }
                end={item.end}
                to={item.to}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </TooltipProvider>

      <div className={cn('flex border-t border-border py-3', collapsed ? 'justify-center' : 'px-4')}>
        <button
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex cursor-pointer items-center rounded-lg text-sm font-medium text-muted transition-colors hover:bg-secondary hover:text-foreground',
            collapsed ? 'size-10 justify-center' : 'min-h-10 w-full gap-3 px-3 py-2',
          )}
          onClick={toggleCollapsed}
          type="button"
        >
          {collapsed ? (
            <ChevronRight className="size-4" aria-hidden="true" />
          ) : (
            <>
              <ChevronLeft className="size-4" aria-hidden="true" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
