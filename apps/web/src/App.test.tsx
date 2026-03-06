import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';

const routes = [
  { heading: 'Dashboard', path: '/' },
  { heading: 'Workouts', path: '/workouts' },
  { heading: 'Nutrition', path: '/nutrition' },
  { heading: 'Habits', path: '/habits' },
  { heading: 'Foods', path: '/foods' },
  { heading: 'Settings', path: '/settings' },
] as const;

describe('App', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it.each(routes)('renders $heading page for $path', ({ heading, path }) => {
    window.history.pushState({}, '', path);

    render(<App />);

    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('renders navigation links for all app routes', () => {
    render(<App />);

    routes.forEach(({ heading, path }) => {
      const links = screen.getAllByRole('link', {
        name: new RegExp(`^${heading}$`, 'i'),
      });

      expect(links.some((link) => link.getAttribute('href') === path)).toBe(true);
    });
  });
});
