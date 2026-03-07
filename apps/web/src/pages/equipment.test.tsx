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

function getLocationCard(name: string) {
  const toggle = screen.getByRole('button', { name: new RegExp(name, 'i') });
  const card = toggle.closest('[data-slot="card"]');

  if (!card) {
    throw new Error(`Expected a card for ${name}`);
  }

  return {
    toggle,
    card: card as HTMLElement,
  };
}

function selectEquipmentCategory(label: string) {
  const trigger = screen.getByRole('combobox', { name: 'Equipment category' });

  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('option', { name: label }));
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
    expect(screen.getByRole('button', { name: 'Add Location' })).toBeInTheDocument();
    expect(getLocationCard('Home Gym').toggle).toHaveAttribute('aria-expanded', 'false');
    expect(getLocationCard('Franklin Athletic Center').toggle).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByRole('heading', { name: 'Free Weights' })).not.toBeInTheDocument();
  });

  it('adds a new location from the dialog into local state', () => {
    renderEquipmentPage();

    fireEvent.click(screen.getByRole('button', { name: 'Add Location' }));

    expect(
      screen.getByRole('heading', { name: 'Add a new training location' }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Location name'), {
      target: { value: 'Travel Setup' },
    });
    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Hotel gym plan for short strength sessions.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create location' }));

    expect(screen.getByText('3 locations, 32 total items')).toBeInTheDocument();
    expect(getLocationCard('Travel Setup').toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Hotel gym plan for short strength sessions.')).toBeInTheDocument();
  });

  it('adds an item to the selected category within a location card', () => {
    renderEquipmentPage();

    const franklin = getLocationCard('Franklin Athletic Center');
    fireEvent.click(franklin.toggle);

    fireEvent.click(within(franklin.card).getByRole('button', { name: 'Add Item' }));

    fireEvent.change(screen.getByLabelText('Item name'), {
      target: { value: 'Assault Runner' },
    });
    selectEquipmentCategory('Cardio');
    fireEvent.change(screen.getByLabelText('Details'), {
      target: { value: 'Self-powered treadmill for intervals and sled-style pushes.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save item' }));

    expect(screen.getByText('2 locations, 33 total items')).toBeInTheDocument();
    expect(within(franklin.card).getByRole('heading', { name: 'Cardio' })).toBeInTheDocument();
    expect(within(franklin.card).getByText('Assault Runner')).toBeInTheDocument();
    expect(
      within(franklin.card).getByText(
        'Self-powered treadmill for intervals and sled-style pushes.',
      ),
    ).toBeInTheDocument();
  });

  it('supports inline editing for an equipment item name and details', () => {
    renderEquipmentPage();

    const homeGym = getLocationCard('Home Gym');
    fireEvent.click(homeGym.toggle);

    fireEvent.click(
      within(homeGym.card).getByRole('button', { name: 'Edit Adjustable Dumbbells' }),
    );

    fireEvent.change(screen.getByLabelText('Item name'), {
      target: { value: 'Competition Dumbbells' },
    });
    fireEvent.change(screen.getByLabelText('Details'), {
      target: { value: 'Pair covering 10-90 lbs.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(within(homeGym.card).getByText('Competition Dumbbells')).toBeInTheDocument();
    expect(within(homeGym.card).getByText('Pair covering 10-90 lbs.')).toBeInTheDocument();
    expect(within(homeGym.card).queryByText('Adjustable Dumbbells')).not.toBeInTheDocument();
  });

  it('confirms before removing an equipment item and updates local state', () => {
    renderEquipmentPage();

    const homeGym = getLocationCard('Home Gym');
    fireEvent.click(homeGym.toggle);

    fireEvent.click(within(homeGym.card).getByRole('button', { name: 'Remove Peloton Bike' }));

    expect(screen.getByRole('heading', { name: 'Remove Peloton Bike?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove item' }));

    expect(screen.getByText('2 locations, 31 total items')).toBeInTheDocument();
    expect(within(homeGym.card).queryByText('Peloton Bike')).not.toBeInTheDocument();
  });

  it('uses the responsive grid classes for the location layout', () => {
    renderEquipmentPage();

    expect(screen.getByTestId('equipment-location-grid')).toHaveClass('grid-cols-1');
    expect(screen.getByTestId('equipment-location-grid')).toHaveClass('lg:grid-cols-2');
  });
});
