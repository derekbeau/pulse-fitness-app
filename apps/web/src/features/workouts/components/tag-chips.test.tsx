import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TagChips } from './tag-chips';

describe('TagChips', () => {
  it('renders tag chips with formatted labels', () => {
    render(<TagChips tags={['upper-body', 'strength']} />);

    expect(screen.getByText('Upper Body')).toBeInTheDocument();
    expect(screen.getByText('Strength')).toBeInTheDocument();
  });

  it('renders nothing when no tags are provided', () => {
    const { container } = render(<TagChips tags={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
