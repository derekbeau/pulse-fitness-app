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
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border/60 bg-card transition-[width] duration-200 md:flex',
        collapsed ? 'w-[4.5rem]' : 'w-[17rem]',
      )}
    >
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-6">
        {collapsed ? (
          <p
            className="w-full text-center text-2xl font-extrabold tracking-tight text-primary"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            P
          </p>
        ) : (
          <p
            className="px-2 text-2xl font-extrabold tracking-tight text-primary"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Pulse
          </p>
        )}
        <button
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-secondary hover:text-foreground"
          onClick={toggleCollapsed}
          type="button"
        >
          {collapsed ? (
            <ChevronRight className="size-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <TooltipProvider delayDuration={0}>
        <nav
          className={cn(
            'flex flex-1 flex-col gap-1 overflow-y-auto py-4',
            collapsed ? 'items-center' : 'px-3',
          )}
          aria-label="Desktop navigation"
        >
          {sidebarNavItems.map((item) => {
            const Icon = item.icon;

            if (collapsed) {
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>
                    <NavLink className="block" end={item.end} to={item.to}>
                      {({ isActive }) => (
                        <span
                          className={cn(
                            'flex size-10 items-center justify-center rounded-xl transition-colors',
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                          )}
                        >
                          <Icon className="size-[18px]" aria-hidden="true" />
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
                    'flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )
                }
                end={item.end}
                to={item.to}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </TooltipProvider>
    </aside>
  );
}
