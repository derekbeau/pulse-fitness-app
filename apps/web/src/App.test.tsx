import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { ThemeProvider } from '@/components/theme-provider';

const pageRoutes = [
  { heading: 'Dashboard', path: '/' },
  { heading: 'Design System', path: '/design-system' },
  { heading: 'Workouts', path: '/workouts' },
  { heading: 'Upper Push', path: '/workouts/template/upper-push' },
  { heading: 'Nutrition', path: '/nutrition' },
  { heading: 'Habits', path: '/habits' },
  { heading: 'Activity', path: '/activity' },
  { heading: 'Foods', path: '/foods' },
  { heading: 'Journal', path: '/journal' },
  { heading: 'Settings', path: '/settings' },
] as const;

const navRoutes = [
  { heading: 'Dashboard', path: '/' },
  { heading: 'Workouts', path: '/workouts' },
  { heading: 'Nutrition', path: '/nutrition' },
  { heading: 'Habits', path: '/habits' },
  { heading: 'Activity', path: '/activity' },
  { heading: 'Foods', path: '/foods' },
  { heading: 'Journal', path: '/journal' },
  { heading: 'Settings', path: '/settings' },
] as const;

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    window.localStorage.removeItem('pulse-theme');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.remove('theme-midnight');
    window.history.pushState({}, '', '/');
  });

  it.each(pageRoutes)('renders $heading page for $path', ({ heading, path }) => {
    window.history.pushState({}, '', path);

    renderApp();

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('renders navigation links for all app routes', () => {
    renderApp();

    navRoutes.forEach(({ heading, path }) => {
      const links = screen.getAllByRole('link', {
        name: new RegExp(`^${heading}$`, 'i'),
      });

      expect(links.some((link) => link.getAttribute('href') === path)).toBe(true);
    });
  });
});
