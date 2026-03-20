import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PerPageSelector } from './per-page-selector';

describe('PerPageSelector', () => {
  it('renders 10, 25, and 50 options', () => {
    render(<PerPageSelector onChange={() => {}} value={25} />);

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Items per page' }), {
      key: 'ArrowDown',
    });

    expect(screen.getAllByText('10 / page')).toHaveLength(1);
    expect(screen.getAllByText('25 / page').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('50 / page')).toHaveLength(1);
  });

  it('calls onChange with the selected page size', () => {
    const handleChange = vi.fn();
    render(<PerPageSelector onChange={handleChange} value={25} />);

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Items per page' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(screen.getByText('50 / page'));

    expect(handleChange).toHaveBeenCalledWith(50);
  });
});
