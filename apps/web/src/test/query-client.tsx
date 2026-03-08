import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { createAppQueryClient } from '@/lib/query-client';

export function createQueryClientWrapper() {
  window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');

  const queryClient = createAppQueryClient();
  queryClient.clear();

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, wrapper };
}
