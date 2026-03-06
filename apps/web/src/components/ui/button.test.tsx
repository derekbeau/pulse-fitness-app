import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('applies cursor-pointer to button elements', () => {
    render(<Button type="button">Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('cursor-pointer');
  });

  it('keeps cursor-pointer when rendered as a link', () => {
    render(
      <Button asChild>
        <a href="/dashboard">Open Dashboard</a>
      </Button>
    );

    expect(screen.getByRole('link', { name: 'Open Dashboard' })).toHaveClass('cursor-pointer');
  });
});
