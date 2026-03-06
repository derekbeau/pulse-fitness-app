import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('combines class names and removes falsy values', () => {
    expect(cn('text-sm', '', null, undefined, 'font-medium')).toBe('text-sm font-medium');
  });

  it('merges conflicting tailwind classes by keeping the last class', () => {
    expect(cn('p-2', 'p-4', 'bg-primary', 'bg-secondary')).toBe('p-4 bg-secondary');
  });

  it('accepts array and object inputs from clsx', () => {
    expect(cn(['rounded-md', 'text-sm'], { hidden: false, flex: true })).toBe(
      'rounded-md text-sm flex',
    );
  });
});
