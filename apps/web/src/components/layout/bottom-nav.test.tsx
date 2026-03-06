import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BottomNav } from '@/components/layout/bottom-nav';

function renderBottomNav(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BottomNav />
      <Routes>
        <Route element={<h1>Dashboard Route</h1>} path="/" />
        <Route element={<h1>Workouts Route</h1>} path="/workouts" />
        <Route element={<h1>Nutrition Route</h1>} path="/nutrition" />
        <Route element={<h1>Habits Route</h1>} path="/habits" />
        <Route element={<h1>Foods Route</h1>} path="/foods" />
        <Route element={<h1>Settings Route</h1>} path="/settings" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BottomNav', () => {
  it('opens the More menu with Foods and Settings links', () => {
    renderBottomNav('/');

    fireEvent.click(screen.getByRole('button', { name: 'More' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Foods' })).toHaveAttribute('href', '/foods');
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('highlights More on nested routes and navigates from the dropdown', () => {
    renderBottomNav('/foods');

    const moreButton = screen.getByRole('button', { name: 'More' });

    expect(moreButton).toHaveClass('bg-primary');

    fireEvent.click(moreButton);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));

    expect(screen.getByRole('heading', { name: 'Settings Route' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
