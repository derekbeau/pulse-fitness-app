import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { moreNavIcon, moreNavItems, primaryNavItems } from '@/components/layout/nav-items';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { useAuthStore } from '@/store/auth-store';

const moreRoutes = new Set(moreNavItems.map((item) => item.to));

export function BottomNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout } = useAuthStore();
  const { confirm, dialog } = useConfirmation();

  const MoreIcon = moreNavIcon;
  const isMoreActive = moreRoutes.has(pathname);

  function handleLogout() {
    setMenuOpen(false);
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

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onMouseDown = (event: MouseEvent) => {
      if (!menuContainerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onMouseDown);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [menuOpen]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex border-t border-border/60 bg-card/90 backdrop-blur-xl md:hidden">
      <nav
        aria-label="Mobile navigation"
        className="pointer-events-auto mx-auto grid w-full max-w-screen-sm grid-cols-5 items-stretch gap-2 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2"
      >
        {primaryNavItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[44px] cursor-pointer flex-col items-center justify-center rounded-xl px-1 py-1 text-[0.7rem] font-medium leading-tight transition-all duration-200',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                    : 'text-muted hover:bg-secondary hover:text-foreground',
                )
              }
              end={item.end}
              onClick={() => setMenuOpen(false)}
              to={item.to}
            >
              <Icon aria-hidden="true" className="mb-1 size-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <div className="relative" ref={menuContainerRef}>
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className={cn(
              'flex min-h-[44px] w-full cursor-pointer flex-col items-center justify-center rounded-xl px-1 py-1 text-[0.7rem] font-medium leading-tight transition-all duration-200',
              isMoreActive
                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                : 'text-muted hover:bg-secondary hover:text-foreground',
            )}
            onClick={() => setMenuOpen((previousValue) => !previousValue)}
            type="button"
          >
            <MoreIcon aria-hidden="true" className="mb-1 size-4" />
            <span>More</span>
          </button>
          {menuOpen ? (
            <div
              className="absolute bottom-[calc(100%+0.5rem)] right-0 w-44 animate-slide-up rounded-xl border border-border/60 bg-card p-1.5 shadow-xl"
              role="menu"
            >
              {moreNavItems.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.to}
                  className={({ isActive }) =>
                    cn(
                        'flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-secondary',
                      )
                    }
                    onClick={() => setMenuOpen(false)}
                    role="menuitem"
                    to={item.to}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
              <button
                className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-secondary"
                onClick={handleLogout}
                role="menuitem"
                type="button"
              >
                <LogOut aria-hidden="true" className="size-4" />
                <span>Log out</span>
              </button>
            </div>
          ) : null}
        </div>
      </nav>
      {dialog}
    </div>
  );
}
