import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { sidebarNavItems } from '@/components/layout/nav-items';

export function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="border-b border-border px-6 py-6">
        <p className="text-2xl font-semibold tracking-tight text-primary">Pulse</p>
      </div>
      <nav className="flex flex-1 flex-col gap-2 px-4 py-4" aria-label="Desktop navigation">
        {sidebarNavItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
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
    </aside>
  );
}
