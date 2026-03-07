import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { sidebarNavItems } from '@/components/layout/nav-items';

export function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-[17rem] shrink-0 flex-col border-r border-border/60 bg-card md:flex">
      <div className="px-6 py-7">
        <p
          className="text-2xl font-extrabold tracking-tight text-primary"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Pulse
        </p>
      </div>
      <div className="mx-4 mb-2 border-t border-border/40" />
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2" aria-label="Desktop navigation">
        {sidebarNavItems.map((item) => {
          const Icon = item.icon;

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
    </aside>
  );
}
