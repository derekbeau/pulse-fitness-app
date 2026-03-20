import { BookOpen, Heart, Settings, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/hooks/use-user';
import { cn } from '@/lib/utils';

type ProfileDestination = {
  accentClassName?: string;
  description: string;
  href: string;
  icon: LucideIcon;
  summary: string;
  title: string;
};

function getInitials(value: string) {
  const segments = value.trim().split(/\s+/).filter(Boolean);

  if (segments.length === 0) {
    return 'U';
  }

  if (segments.length === 1) {
    return segments[0].slice(0, 2).toUpperCase();
  }

  return `${segments[0][0] ?? ''}${segments[1][0] ?? ''}`.toUpperCase();
}

type ProfileHubProps = {
  equipmentSummary: string;
};

export function ProfileHub({ equipmentSummary }: ProfileHubProps) {
  const { data: user } = useUser();
  const displayName = user?.name?.trim() || user?.username || 'User';
  const initials = getInitials(displayName);
  const memberSince = user
    ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
        new Date(user.createdAt),
      )
    : '--';

  const profileDestinations: ProfileDestination[] = [
    {
      description: 'Inventory across every gym setup and storage spot.',
      href: '/profile/equipment',
      icon: Wrench,
      summary: equipmentSummary,
      title: 'Equipment',
    },
    {
      accentClassName: 'hover:border-rose-400/45 focus-within:border-rose-400/55',
      description: 'Track injuries, recovery notes, and active protocols.',
      href: '/profile/injuries',
      icon: Heart,
      summary: 'Coming soon',
      title: 'Health Tracking',
    },
    {
      description: 'Books, programs, and coaching references to revisit.',
      href: '/profile/resources',
      icon: BookOpen,
      summary: 'Coming soon',
      title: 'Resources',
    },
    {
      description: 'Theme, targets, and dashboard preferences.',
      href: '/settings',
      icon: Settings,
      summary: 'Theme, targets, dashboard',
      title: 'Settings',
    },
  ];

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-8">
      <PageHeader
        description="Keep your training context organized, from equipment inventory to health notes and saved resources."
        title="Profile"
      />

      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-sm">
        <CardContent className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-full bg-[var(--color-accent-mint)] text-xl font-semibold text-on-mint shadow-sm">
              {initials}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Member since
              </p>
              <h2 className="text-2xl font-semibold text-foreground">{displayName}</h2>
              <p className="text-sm text-muted-foreground">{memberSince}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-foreground">Quick access</h2>
            <p className="text-sm text-muted-foreground">
              Jump into the profile areas that shape setup, recovery, and planning.
            </p>
          </div>
        </div>

        <div
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          data-testid="profile-quick-access-grid"
        >
          {profileDestinations.map((destination) => {
            const Icon = destination.icon;

            return (
              <Link className="block cursor-pointer" key={destination.href} to={destination.href}>
                <Card
                  className={cn(
                    'h-full gap-3 border-border/70 bg-card/90 transition-all duration-200 hover:-translate-y-1 hover:border-primary/45 hover:bg-secondary/40 hover:shadow-lg focus-within:border-primary/55 focus-within:ring-2 focus-within:ring-primary/20',
                    destination.accentClassName,
                  )}
                >
                  <CardHeader className="gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary">
                        <Icon aria-hidden="true" className="size-5" />
                      </div>
                      <span className="rounded-full border border-border/70 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Open
                      </span>
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{destination.title}</CardTitle>
                      <CardDescription>{destination.description}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm font-medium text-foreground">{destination.summary}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
