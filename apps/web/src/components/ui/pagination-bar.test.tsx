import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PaginationBar } from './pagination-bar';

describe('PaginationBar', () => {
  it('navigates pages with previous and next buttons', () => {
    const handlePageChange = vi.fn();

    render(<PaginationBar onPageChange={handlePageChange} page={2} totalPages={5} />);

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(handlePageChange).toHaveBeenNthCalledWith(1, 1);
    expect(handlePageChange).toHaveBeenNthCalledWith(2, 3);
    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();
  });

  it('disables navigation at pagination bounds', () => {
    render(<PaginationBar onPageChange={() => {}} page={1} totalPages={1} />);

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});
