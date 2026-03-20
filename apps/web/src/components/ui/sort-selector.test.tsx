import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SortSelector, type SortOption } from './sort-selector';

const options: SortOption[] = [
  { value: 'name-asc', label: 'Name (A-Z)', direction: 'asc' },
  { value: 'name-desc', label: 'Name (Z-A)', direction: 'desc' },
  { value: 'newest', label: 'Newest first', direction: 'desc' },
];

describe('SortSelector', () => {
  it('renders provided options', () => {
    render(<SortSelector options={options} value="name-asc" onChange={() => {}} />);

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Sort' }), {
      key: 'ArrowDown',
    });

    expect(screen.getAllByText('Name (A-Z)')).toHaveLength(2);
    expect(screen.getByText('Name (Z-A)')).toBeInTheDocument();
    expect(screen.getByText('Newest first')).toBeInTheDocument();
  });

  it('fires onChange with the selected value', () => {
    const handleChange = vi.fn();
    render(<SortSelector options={options} value="name-asc" onChange={handleChange} />);

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Sort' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(screen.getByText('Newest first'));

    expect(handleChange).toHaveBeenCalledWith('newest');
  });
});
