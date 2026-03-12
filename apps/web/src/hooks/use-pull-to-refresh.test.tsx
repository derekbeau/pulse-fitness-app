import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePullToRefresh } from './use-pull-to-refresh';

type MatchMediaMock = {
  addEventListener: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  media: string;
  matches: boolean;
  onchange: ((event: MediaQueryListEvent) => void) | null;
  removeEventListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
};

const createTouchEvent = (type: string, y?: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    changedTouches: Array<{ clientY: number }>;
    touches: Array<{ clientY: number }>;
  };

  Object.defineProperty(event, 'touches', {
    configurable: true,
    value: y === undefined ? [] : [{ clientY: y }],
  });

  Object.defineProperty(event, 'changedTouches', {
    configurable: true,
    value: y === undefined ? [] : [{ clientY: y }],
  });

  return event;
};

const dispatchTouch = (type: 'touchstart' | 'touchmove' | 'touchend', y?: number) => {
  const event = createTouchEvent(type, y);
  window.dispatchEvent(event);
  return event;
};

const setupStandalone = (matches = true, iosStandalone = false) => {
  const mediaQueryMock: MatchMediaMock = {
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    media: '(display-mode: standalone)',
    matches,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  };

  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQueryMock));
  Object.defineProperty(window.navigator, 'standalone', {
    configurable: true,
    value: iosStandalone,
    writable: true,
  });

  return mediaQueryMock;
};

describe('usePullToRefresh', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
      writable: true,
    });
    document.documentElement.scrollTop = 0;
    setupStandalone(true, false);
  });

  it('does not activate outside standalone mode', () => {
    setupStandalone(false, false);
    const onRefresh = vi.fn();

    renderHook(() => usePullToRefresh({ onRefresh }));

    act(() => {
      dispatchTouch('touchstart', 0);
      dispatchTouch('touchmove', 120);
      dispatchTouch('touchend');
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('refreshes when released past threshold while at the top', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => usePullToRefresh({ onRefresh, threshold: 80 }));

    act(() => {
      dispatchTouch('touchstart', 10);
      dispatchTouch('touchmove', 120);
    });

    expect(result.current.pulling).toBe(true);
    expect(result.current.pullDistance).toBe(110);

    act(() => {
      dispatchTouch('touchend');
    });

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(result.current.refreshing).toBe(false);
      expect(result.current.pulling).toBe(false);
      expect(result.current.pullDistance).toBe(0);
    });
  });

  it('does not refresh if the page is not scrolled to top', () => {
    const onRefresh = vi.fn();
    window.scrollY = 20;
    document.documentElement.scrollTop = 20;

    renderHook(() => usePullToRefresh({ onRefresh, threshold: 80 }));

    act(() => {
      dispatchTouch('touchstart', 10);
      dispatchTouch('touchmove', 120);
      dispatchTouch('touchend');
    });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('keeps refreshing state true until async refresh completes', async () => {
    let resolveRefresh: (() => void) | undefined;
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const { result } = renderHook(() => usePullToRefresh({ onRefresh, threshold: 80 }));

    act(() => {
      dispatchTouch('touchstart', 0);
      dispatchTouch('touchmove', 100);
      dispatchTouch('touchend');
    });

    await waitFor(() => {
      expect(result.current.refreshing).toBe(true);
    });

    act(() => {
      resolveRefresh?.();
    });

    await waitFor(() => {
      expect(result.current.refreshing).toBe(false);
    });
  });
});
