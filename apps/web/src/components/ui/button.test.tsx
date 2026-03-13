import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('applies cursor-pointer to button elements', () => {
    render(<Button type="button">Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(
      'cursor-pointer',
      'min-h-[44px]',
      'min-w-[44px]',
    );
  });

  it('keeps cursor-pointer when rendered as a link', () => {
    render(
      <Button asChild>
        <a href="/dashboard">Open Dashboard</a>
      </Button>
    );

    expect(screen.getByRole('link', { name: 'Open Dashboard' })).toHaveClass('cursor-pointer');
  });

  it('keeps icon-size variants square by resetting base minimum dimensions', () => {
    render(
      <>
        <Button aria-label="Icon default" size="icon" type="button" />
        <Button aria-label="Icon xs" size="icon-xs" type="button" />
        <Button aria-label="Icon sm" size="icon-sm" type="button" />
        <Button aria-label="Icon lg" size="icon-lg" type="button" />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Icon default' })).toHaveClass(
      'size-9',
      'min-h-0',
      'min-w-0',
    );
    expect(screen.getByRole('button', { name: 'Icon xs' })).toHaveClass(
      'size-6',
      'min-h-0',
      'min-w-0',
    );
    expect(screen.getByRole('button', { name: 'Icon sm' })).toHaveClass(
      'size-8',
      'min-h-0',
      'min-w-0',
    );
    expect(screen.getByRole('button', { name: 'Icon lg' })).toHaveClass(
      'size-10',
      'min-h-0',
      'min-w-0',
    );
  });

  it('keeps outline buttons readable on dark surfaces during hover and active states', () => {
    render(
      <Button type="button" variant="outline">
        Reschedule
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Reschedule' })).toHaveClass(
      'text-foreground',
      'dark:hover:text-foreground',
      'active:text-accent-foreground',
      'dark:active:text-foreground',
    );
  });
});
