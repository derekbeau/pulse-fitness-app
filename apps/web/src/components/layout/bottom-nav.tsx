import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { moreNavIcon, moreNavItems, primaryNavItems } from '@/components/layout/nav-items';

const moreRoutes = new Set(moreNavItems.map((item) => item.to));

export function BottomNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  const MoreIcon = moreNavIcon;
  const isMoreActive = moreRoutes.has(pathname);

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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-card/95 backdrop-blur-sm md:hidden">
      <nav
        aria-label="Mobile navigation"
        className="pointer-events-auto mx-auto grid w-full max-w-screen-sm grid-cols-5 gap-1 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2"
      >
        {primaryNavItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-lg px-1 py-1 text-[0.7rem] font-medium leading-tight transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
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
              'flex min-h-11 w-full cursor-pointer flex-col items-center justify-center rounded-lg px-1 py-1 text-[0.7rem] font-medium leading-tight transition-colors',
              isMoreActive
                ? 'bg-primary text-primary-foreground'
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
              className="absolute bottom-[calc(100%+0.5rem)] right-0 w-44 rounded-lg border border-border bg-card p-1 shadow-lg"
              role="menu"
            >
              {moreNavItems.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
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
            </div>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
