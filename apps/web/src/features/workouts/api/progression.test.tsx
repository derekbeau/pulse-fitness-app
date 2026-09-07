import { act, renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@/lib/api-client';
import { useWorkoutProgressionPreview } from './progression';
vi.mock('@/lib/api-client', () => ({ apiRequest: vi.fn() }));
describe('progression POST request budget', () => {
  it.each([false, true])(
    'remount/focus/reconnect does not repeat a preview (failure=%s)',
    async (failure) => {
      vi.mocked(apiRequest).mockReset();
      if (failure) vi.mocked(apiRequest).mockRejectedValue(new Error('Server failure'));
      else vi.mocked(apiRequest).mockResolvedValue({ recommendations: [] });
      const client = new QueryClient();
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      const first = renderHook(() => useWorkoutProgressionPreview('schedule-1'), { wrapper });
      await waitFor(() => expect(first.result.current.fetchStatus).toBe('idle'));
      expect(apiRequest).toHaveBeenCalledTimes(1);
      first.unmount();
      const second = renderHook(() => useWorkoutProgressionPreview('schedule-1'), { wrapper });
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
        onlineManager.setOnline(false);
        onlineManager.setOnline(true);
      });
      expect(apiRequest).toHaveBeenCalledTimes(1);
      await act(async () => {
        await second.result.current.refetch();
      });
      expect(apiRequest).toHaveBeenCalledTimes(2);
      second.unmount();
      client.clear();
      focusManager.setFocused(undefined);
    },
  );
});
