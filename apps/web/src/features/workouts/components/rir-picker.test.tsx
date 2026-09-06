import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RirPicker } from './rir-picker';

describe('RirPicker numeric shortcuts', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([0, 1, 2, 3, 4, 5])(
    'selects %i exactly once, closes, and restores trigger focus',
    (value) => {
      vi.useFakeTimers();
      const onChange = vi.fn();
      render(<RirPicker onChange={onChange} setNumber={2} value={null} />);

      const trigger = screen.getByRole('button', {
        name: 'RIR for set 2: No repetitions in reserve logged',
      });
      fireEvent.click(trigger);
      const group = screen.getByRole('radiogroup', { name: 'RIR selection for set 2' });
      screen.getByRole('radio', { name: 'Clear repetitions in reserve' }).focus();

      fireEvent.keyDown(group, { code: `Digit${value}`, key: `${value}` });

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(value);
      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
      act(() => vi.runAllTimers());
      expect(trigger).toHaveFocus();
    },
  );

  it('treats a keypad-produced digit key as the same shortcut and preserves the 5+ bucket', () => {
    const onChange = vi.fn();
    render(<RirPicker onChange={onChange} setNumber={1} value={null} />);

    fireEvent.click(screen.getByRole('button', { name: /RIR for set 1/u }));
    fireEvent.keyDown(screen.getByRole('radiogroup'), { code: 'Numpad5', key: '5' });

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it.each([
    { altKey: true, label: 'Alt' },
    { ctrlKey: true, label: 'Control' },
    { metaKey: true, label: 'Meta' },
    { shiftKey: true, label: 'Shift' },
    { label: 'repeat', repeat: true },
  ])('ignores $label digit events without closing', (eventInit) => {
    const onChange = vi.fn();
    render(<RirPicker onChange={onChange} setNumber={1} value={null} />);

    fireEvent.click(screen.getByRole('button', { name: /RIR for set 1/u }));
    const group = screen.getByRole('radiogroup');
    fireEvent.keyDown(group, { ...eventInit, key: '3' });

    expect(onChange).not.toHaveBeenCalled();
    expect(group).toBeVisible();
  });

  it('ignores composing and AltGraph digit events without closing', () => {
    const onChange = vi.fn();
    render(<RirPicker onChange={onChange} setNumber={1} value={null} />);

    fireEvent.click(screen.getByRole('button', { name: /RIR for set 1/u }));
    const group = screen.getByRole('radiogroup');
    const composingEvent = new KeyboardEvent('keydown', { bubbles: true, key: '3' });
    Object.defineProperty(composingEvent, 'isComposing', { value: true });
    fireEvent(group, composingEvent);

    const altGraphEvent = new KeyboardEvent('keydown', { bubbles: true, key: '3' });
    Object.defineProperty(altGraphEvent, 'getModifierState', {
      value: (modifier: string) => modifier === 'AltGraph',
    });
    fireEvent(group, altGraphEvent);

    expect(onChange).not.toHaveBeenCalled();
    expect(group).toBeVisible();
  });

  it('does not intercept weight or reps digits outside the picker content', () => {
    const onChange = vi.fn();
    render(<RirPicker onChange={onChange} setNumber={1} value={null} />);
    fireEvent.click(screen.getByRole('button', { name: /RIR for set 1/u }));

    const outside = document.createElement('input');
    document.body.append(outside);
    outside.focus();
    fireEvent.keyDown(outside, { key: '1' });
    fireEvent.keyDown(outside, { key: '5' });
    fireEvent.keyDown(outside, { key: '5' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radiogroup')).toBeVisible();
    outside.remove();
  });
});
