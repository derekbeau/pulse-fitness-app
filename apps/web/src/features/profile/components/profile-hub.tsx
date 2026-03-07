import { BookOpen, Heart, Settings, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ProfileDestination = {
  description: string;
  href: string;
  icon: LucideIcon;
  summary: string;
  title: string;
};

const profileDestinations: ProfileDestination[] = [
  {
    description: 'Inventory across every gym setup and storage spot.',
    href: '/profile/equipment',
    icon: Wrench,
    summary: '2 locations, 32 total items',
    title: 'Equipment',
  },
  {
    description: 'Track injuries, recovery notes, and active protocols.',
    href: '/profile/injuries',
    icon: Heart,
    summary: '1 active condition',
    title: 'Health Tracking',
  },
  {
    description: 'Books, programs, and coaching references to revisit.',
    href: '/profile/resources',
    icon: BookOpen,
    summary: '8 resources',
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

const mockProfile = {
  displayName: 'Jordan Lee',
  initials: 'JL',
  memberSince: 'March 2024',
};

export function ProfileHub() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-10">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Profile hub</p>
        <h1 className="text-3xl font-semibold text-primary">Profile</h1>
        <p className="max-w-3xl text-sm text-muted">
          Keep your training context organized, from equipment inventory to health notes and saved
          resources.
        </p>
      </header>

      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-sm">
        <CardContent className="flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-full bg-[var(--color-accent-mint)] text-2xl font-semibold text-on-mint shadow-sm">
              {mockProfile.initials}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Member since
              </p>
              <h2 className="text-2xl font-semibold text-foreground">{mockProfile.displayName}</h2>
              <p className="text-sm text-muted-foreground">{mockProfile.memberSince}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-secondary/45 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Household
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">Two-person Pulse account</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-foreground">Quick access</h2>
            <p className="text-sm text-muted-foreground">
              Jump into the profile areas that shape setup, recovery, and planning.
            </p>
          </div>
        </div>

        <div
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
          data-testid="profile-quick-access-grid"
        >
          {profileDestinations.map((destination) => {
            const Icon = destination.icon;

            return (
              <Link className="block cursor-pointer" key={destination.href} to={destination.href}>
                <Card
                  className={cn(
                    'h-full gap-4 border-border/70 bg-card/90 transition-all duration-200 hover:-translate-y-1 hover:border-primary/45 hover:bg-secondary/40 hover:shadow-lg focus-within:border-primary/55 focus-within:ring-2 focus-within:ring-primary/20',
                    destination.title === 'Health Tracking' &&
                      'hover:border-rose-400/45 focus-within:border-rose-400/55',
                  )}
                >
                  <CardHeader className="gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-primary">
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
