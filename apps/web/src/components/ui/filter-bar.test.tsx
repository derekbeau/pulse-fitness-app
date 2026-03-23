import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FilterBar } from './filter-bar';

describe('FilterBar', () => {
  it('renders controls, children, and className', () => {
    const { container } = render(
      <FilterBar
        className="custom-filter-bar"
        perPageControl={<div>Per page</div>}
        searchControl={<div>Search</div>}
        sortControl={<div>Sort</div>}
        viewToggle={<div>View</div>}
      >
        <div>Extra child</div>
      </FilterBar>,
    );

    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('Sort')).toBeInTheDocument();
    expect(screen.getByText('Per page')).toBeInTheDocument();
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('Extra child')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('custom-filter-bar');
  });
});
