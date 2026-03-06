import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { Sidebar } from '@/components/layout/sidebar';

const navLinks = [
  { label: 'Dashboard', path: '/' },
  { label: 'Workouts', path: '/workouts' },
  { label: 'Nutrition', path: '/nutrition' },
  { label: 'Habits', path: '/habits' },
  { label: 'Foods', path: '/foods' },
  { label: 'Journal', path: '/journal' },
  { label: 'Settings', path: '/settings' },
] as const;

describe('Sidebar', () => {
  it('renders all nav links and highlights the active route', () => {
    render(
      <MemoryRouter initialEntries={['/nutrition']}>
        <Sidebar />
      </MemoryRouter>,
    );

    navLinks.forEach(({ label, path }) => {
      const link = screen.getByRole('link', { name: label });
      expect(link).toHaveAttribute('href', path);
      expect(link).toHaveClass('cursor-pointer');
    });

    const activeLink = screen.getByRole('link', { name: 'Nutrition' });

    expect(activeLink).toHaveAttribute('aria-current', 'page');
    expect(activeLink).toHaveClass('bg-primary');
  });
});
