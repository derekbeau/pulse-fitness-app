import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';

import { cn } from '@/lib/utils';
import { sidebarNavItems } from '@/components/layout/nav-items';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { useUser } from '@/hooks/use-user';
import { useAuthStore } from '@/store/auth-store';

function getInitialCollapsed() {
  try {
    return localStorage.getItem('pulse-sidebar-collapsed') === 'true';
  } catch {
    return false;
  }
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { confirm, dialog } = useConfirmation();
  const { data: user } = useUser();
  const displayName = user?.name?.trim() || user?.username || 'Account';
  const subtitle = user?.name ? `@${user.username}` : 'Signed in';
  const avatarLabel = displayName.charAt(0).toUpperCase();

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

  function handleLogout() {
    confirm({
      title: 'Sign out?',
      description: "You'll need to sign in again to continue.",
      confirmLabel: 'Sign out',
      variant: 'default',
      onConfirm: () => {
        logout();
        navigate('/login', { replace: true });
      },
    });
  }

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border/60 bg-card transition-[width] duration-200 md:flex',
        collapsed ? 'w-[4.5rem]' : 'w-[17rem]',
      )}
    >
      <TooltipProvider delayDuration={0}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-6">
            {collapsed ? (
              <p className="w-full text-center text-2xl font-extrabold tracking-tight text-primary font-display">
                P
              </p>
            ) : (
              <p className="px-2 text-2xl font-extrabold tracking-tight text-primary font-display">
                Pulse
              </p>
            )}
            <button
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-secondary hover:text-foreground"
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
                              'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl transition-colors',
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
                      'flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200',
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

          <div
            className={cn(
              'border-t border-border/40 py-4',
              collapsed ? 'flex items-center justify-center px-2' : 'space-y-3 px-3',
            )}
          >
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    aria-label={displayName}
                    className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    to="/profile"
                  >
                    {avatarLabel}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {displayName}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/70 px-3 py-2 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                to="/profile"
              >
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                  {avatarLabel}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
                </div>
              </Link>
            )}

            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label="Log out"
                    className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    onClick={handleLogout}
                    type="button"
                  >
                    <LogOut className="size-[18px]" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  Log out
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-foreground"
                onClick={handleLogout}
                type="button"
              >
                <LogOut className="size-[18px]" aria-hidden="true" />
                <span>Log out</span>
              </button>
            )}
          </div>
        </div>
      </TooltipProvider>
      {dialog}
    </aside>
  );
}
