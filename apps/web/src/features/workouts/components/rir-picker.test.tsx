import { useState } from 'react';
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

function ControlledPicker({ initialValue = null }: { initialValue?: number | null }) {
  const [value, setValue] = useState(initialValue);
  return <RirPicker onChange={setValue} setNumber={1} value={value} />;
}

describe('closed RIR trigger', () => {
  it.each([0, 1, 2, 3, 4, 5])('consumes digit %i once without opening or moving focus', (value) => {
    const onChange = vi.fn();
    const parentShortcut = vi.fn();
    const submit = vi.fn();
    render(
      <form onKeyDown={parentShortcut} onSubmit={submit}>
        <RirPicker onChange={onChange} setNumber={1} value={4} />
        <button type="submit">Next</button>
      </form>,
    );
    const trigger = screen.getByRole('button', { name: /RIR for set 1/u });
    trigger.focus();
    expect(fireEvent.keyDown(trigger, { key: `${value}`, code: `Digit${value}` })).toBe(false);
    expect(onChange.mock.calls).toEqual([[value]]);
    expect(parentShortcut).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(trigger).toHaveAccessibleDescription('Type 0–5 to set RIR; 5 means 5 or more.');
  });

  it('replaces a value with zero and keypad 5+ while retaining the same trigger', () => {
    render(<ControlledPicker initialValue={4} />);
    const trigger = screen.getByRole('button', { name: /RIR for set 1/u });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: '0' });
    expect(trigger).toHaveAccessibleName('RIR for set 1: 0 repetitions in reserve');
    fireEvent.keyDown(trigger, { key: '5', code: 'Numpad5' });
    expect(trigger).toHaveAccessibleName('RIR for set 1: 5 or more repetitions in reserve');
    expect(trigger).toHaveTextContent('5+ RIR');
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it.each([
    { key: '6' },
    { key: '7' },
    { key: '8' },
    { key: '9' },
    { key: '22' },
    { key: '2', shiftKey: true },
    { key: '2', ctrlKey: true },
    { key: '2', altKey: true },
    { key: '2', metaKey: true },
    { key: '2', repeat: true },
    { key: '2', isComposing: true },
    { key: '2', modifierAltGraph: true },
  ])('leaves rejected key $key untouched: %j', (init) => {
    const onChange = vi.fn();
    const parentShortcut = vi.fn();
    render(
      <div onKeyDown={parentShortcut}>
        <RirPicker onChange={onChange} setNumber={1} value={null} />
      </div>,
    );
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    if ('modifierAltGraph' in init) {
      Object.defineProperty(event, 'getModifierState', {
        value: (key: string) => key === 'AltGraph',
      });
    }
    fireEvent(screen.getByRole('button', { name: /RIR for set 1/u }), event);
    expect(onChange).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(parentShortcut).toHaveBeenCalledOnce();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('rejects disabled triggers and a picker disabled while already open', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <RirPicker disabled onChange={onChange} setNumber={1} value={null} />,
    );
    const trigger = screen.getByRole('button', { name: /RIR for set 1/u });
    fireEvent.keyDown(trigger, { key: '2' });
    expect(onChange).not.toHaveBeenCalled();
    rerender(<RirPicker onChange={onChange} setNumber={1} value={null} />);
    fireEvent.click(trigger);
    rerender(<RirPicker disabled onChange={onChange} setNumber={1} value={null} />);
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: '2' });
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'End' });
    fireEvent.click(screen.getByRole('radio', { name: '2 repetitions in reserve' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    'duration',
    'weight_seconds',
    'reps_seconds',
    'seconds_only',
    'distance',
    'cardio',
  ] as const)(
    'cannot select RIR for unsupported %s even if a caller requests the picker',
    (trackingType) => {
      const onChange = vi.fn();
      render(
        <RirPicker onChange={onChange} setNumber={1} trackingType={trackingType} value={null} />,
      );
      expect(screen.queryByRole('button', { name: /RIR for set/u })).not.toBeInTheDocument();
      fireEvent.keyDown(document.body, { key: '2' });
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it('preserves digits in sibling weight, reps, and notes fields', () => {
    const onChange = vi.fn();
    render(
      <>
        <input aria-label="Weight" />
        <input aria-label="Reps" />
        <textarea aria-label="Notes" />
        <RirPicker onChange={onChange} setNumber={1} value={null} />
      </>,
    );
    for (const label of ['Weight', 'Reps', 'Notes']) {
      const input = screen.getByLabelText(label);
      input.focus();
      expect(fireEvent.keyDown(input, { key: '2' })).toBe(true);
      fireEvent.change(input, { target: { value: '205' } });
      expect(input).toHaveValue('205');
      expect(input).toHaveFocus();
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps open-group navigation and explicit Clear intact', () => {
    render(<ControlledPicker initialValue={2} />);
    fireEvent.click(screen.getByRole('button', { name: /RIR for set 1/u }));
    const group = screen.getByRole('radiogroup');
    for (const [key, label] of [
      ['ArrowRight', '3 repetitions in reserve'],
      ['ArrowDown', '4 repetitions in reserve'],
      ['ArrowLeft', '3 repetitions in reserve'],
      ['ArrowUp', '2 repetitions in reserve'],
      ['End', '5 or more repetitions in reserve'],
      ['Home', 'Clear repetitions in reserve'],
    ]) {
      fireEvent.keyDown(group, { key });
      const option = screen.getByRole('radio', { name: label });
      expect(option).toHaveAttribute('aria-checked', 'true');
      expect(option).toHaveFocus();
      expect(group).toBeVisible();
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Clear repetitions in reserve' }));
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /RIR for set 1/u })).toHaveAccessibleName(
      'RIR for set 1: No repetitions in reserve logged',
    );
  });

  it('consumes an open radio digit before it bubbles to a parent shortcut', () => {
    const onChange = vi.fn();
    const parentShortcut = vi.fn();
    render(
      <div onKeyDown={parentShortcut}>
        <RirPicker onChange={onChange} setNumber={1} value={null} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /RIR for set 1/u }));
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Clear repetitions in reserve' }), {
      key: '2',
    });
    expect(onChange.mock.calls).toEqual([[2]]);
    expect(parentShortcut).not.toHaveBeenCalled();
  });
});
