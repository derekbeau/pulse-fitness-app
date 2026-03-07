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
        <Route element={<h1>Activity Route</h1>} path="/activity" />
        <Route element={<h1>Foods Route</h1>} path="/foods" />
        <Route element={<h1>Journal Route</h1>} path="/journal" />
        <Route element={<h1>Profile Route</h1>} path="/profile" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BottomNav', () => {
  it('opens the More menu with activity, foods, journal, and profile links', () => {
    renderBottomNav('/');

    const moreButton = screen.getByRole('button', { name: 'More' });
    expect(moreButton).toHaveClass('cursor-pointer');

    fireEvent.click(moreButton);

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('menuitem', { name: 'Activity' })).toHaveAttribute('href', '/activity');
    expect(screen.getByRole('menuitem', { name: 'Activity' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('menuitem', { name: 'Foods' })).toHaveAttribute('href', '/foods');
    expect(screen.getByRole('menuitem', { name: 'Foods' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('menuitem', { name: 'Journal' })).toHaveAttribute('href', '/journal');
    expect(screen.getByRole('menuitem', { name: 'Journal' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveClass('cursor-pointer');
  });

  it('highlights More on more-menu routes and navigates from the dropdown', () => {
    renderBottomNav('/foods');

    const moreButton = screen.getByRole('button', { name: 'More' });

    expect(moreButton).toHaveClass('bg-primary');

    fireEvent.click(moreButton);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profile' }));

    expect(screen.getByRole('heading', { name: 'Profile Route' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
