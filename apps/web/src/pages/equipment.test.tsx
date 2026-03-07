import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { EquipmentRoutePage } from '@/pages/equipment';

function renderEquipmentPage() {
  return render(
    <MemoryRouter>
      <EquipmentRoutePage />
    </MemoryRouter>,
  );
}

describe('EquipmentRoutePage', () => {
  it('renders the inventory summary and collapsed location cards', () => {
    renderEquipmentPage();

    expect(screen.getByRole('heading', { name: 'Equipment' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to Profile/i })).toHaveAttribute(
      'href',
      '/profile',
    );
    expect(screen.getByText('2 locations, 32 total items')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Home Gym/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: /Franklin Athletic Center/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText('Free Weights')).not.toBeInTheDocument();
  });

  it('reveals categorized equipment when a location card is expanded', () => {
    renderEquipmentPage();

    const homeGymToggle = screen.getByRole('button', { name: /Home Gym/i });
    fireEvent.click(homeGymToggle);

    expect(homeGymToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Free Weights')).toBeInTheDocument();
    expect(screen.getByText('Accessories')).toBeInTheDocument();
    expect(screen.getByText('Adjustable Dumbbells')).toBeInTheDocument();
    expect(screen.getByText('Pair covering 5-80 lbs.')).toBeInTheDocument();

    const franklinToggle = screen.getByRole('button', { name: /Franklin Athletic Center/i });
    fireEvent.click(franklinToggle);

    const franklinCard = franklinToggle.closest('[data-slot="card"]');
    expect(franklinCard).not.toBeNull();
    expect(within(franklinCard as HTMLElement).getByText('Machines')).toBeInTheDocument();
    expect(within(franklinCard as HTMLElement).getByText('Cable Stations')).toBeInTheDocument();
  });

  it('uses the responsive grid classes for the location layout', () => {
    renderEquipmentPage();

    expect(screen.getByTestId('equipment-location-grid')).toHaveClass('grid-cols-1');
    expect(screen.getByTestId('equipment-location-grid')).toHaveClass('lg:grid-cols-2');
  });
});
