import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Apple,
  Dumbbell,
  Ellipsis,
  NotebookPen,
  LayoutDashboard,
  ListChecks,
  Settings,
  UtensilsCrossed,
} from 'lucide-react';

export type NavItem = {
  icon: LucideIcon;
  label: string;
  to: string;
  end?: boolean;
};

export const primaryNavItems: NavItem[] = [
  {
    end: true,
    icon: LayoutDashboard,
    label: 'Dashboard',
    to: '/',
  },
  {
    icon: Dumbbell,
    label: 'Workouts',
    to: '/workouts',
  },
  {
    icon: UtensilsCrossed,
    label: 'Nutrition',
    to: '/nutrition',
  },
  {
    icon: ListChecks,
    label: 'Habits',
    to: '/habits',
  },
];

export const moreNavItems: NavItem[] = [
  {
    icon: Activity,
    label: 'Activity',
    to: '/activity',
  },
  {
    icon: Apple,
    label: 'Foods',
    to: '/foods',
  },
  {
    icon: NotebookPen,
    label: 'Journal',
    to: '/journal',
  },
  {
    icon: Settings,
    label: 'Settings',
    to: '/settings',
  },
];

export const sidebarNavItems = [...primaryNavItems, ...moreNavItems];

export const moreNavIcon = Ellipsis;
