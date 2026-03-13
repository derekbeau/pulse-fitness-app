import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedCallback } from './use-debounced-callback';

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays callback execution until the debounce window elapses', async () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    act(() => {
      result.current.run('value-1');
    });

    expect(callback).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(callback).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(callback).toHaveBeenCalledWith('value-1');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('flushes pending callback execution immediately', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    act(() => {
      result.current.run('value-1');
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      result.current.flush();
    });
    expect(callback).toHaveBeenCalledWith('value-1');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cancels pending invocation on unmount', async () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(callback, 500));

    act(() => {
      result.current.run('value-1');
    });

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("doesn't invoke callback for duplicate values", async () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));

    act(() => {
      result.current.run({ value: 100 });
      result.current.run({ value: 100 });
      result.current.run({ value: 100 });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ value: 100 });

    act(() => {
      result.current.run({ value: 100 });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not deduplicate non-serializable argument payloads', async () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(callback, 500));
    const first: { value: string; self?: unknown } = { value: 'first' };
    const second: { value: string; self?: unknown } = { value: 'second' };
    first.self = first;
    second.self = second;

    act(() => {
      result.current.run(first);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    act(() => {
      result.current.run(second);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, first);
    expect(callback).toHaveBeenNthCalledWith(2, second);
  });
});
