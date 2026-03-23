import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ViewToggle, type ViewToggleMode } from './view-toggle';

describe('ViewToggle', () => {
  it('toggles between card and table views', () => {
    const handleChange = vi.fn();

    render(<ViewToggle onChange={handleChange} view="card" />);

    fireEvent.click(screen.getByRole('button', { name: 'Table view' }));

    expect(handleChange).toHaveBeenCalledWith('table');
  });

  it('loads and persists view preference via localStorage', () => {
    const storageKey = 'foods-view-preference';
    window.localStorage.setItem(storageKey, 'table');

    function TestHarness() {
      const [view, setView] = useState<ViewToggleMode>('card');

      return <ViewToggle onChange={setView} storageKey={storageKey} view={view} />;
    }

    render(<TestHarness />);

    expect(screen.getByRole('button', { name: 'Table view' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Card view' }));

    expect(window.localStorage.getItem(storageKey)).toBe('card');
  });
});
