import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Input } from './input';

describe('Input', () => {
  it('keeps number input value unchanged when wheel fires while focused', () => {
    render(<Input type="number" defaultValue={10} />);

    const input = screen.getByRole('spinbutton');
    input.focus();
    expect(input).toHaveFocus();

    fireEvent.wheel(input);

    expect(input).toHaveValue(10);
  });

  it('does not change text input value or focus on wheel', () => {
    render(<Input type="text" defaultValue="hello" />);

    const input = screen.getByDisplayValue('hello');
    input.focus();
    expect(input).toHaveFocus();

    fireEvent.wheel(input);

    expect(input).toHaveValue('hello');
    expect(input).toHaveFocus();
  });

  it('calls caller supplied onWheel for number inputs', () => {
    const handleWheel = vi.fn();
    render(<Input type="number" onWheel={handleWheel} defaultValue={10} />);

    const input = screen.getByRole('spinbutton');
    fireEvent.wheel(input);

    expect(handleWheel).toHaveBeenCalledTimes(1);
  });
});
