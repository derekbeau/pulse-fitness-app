import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';

import { createAppQueryClient } from '@/lib/query-client';

export function renderWithQueryClient(
  element: ReactElement,
  options?: {
    queryClient?: QueryClient;
  },
) {
  const queryClient = options?.queryClient ?? createAppQueryClient();
  if (!options?.queryClient) {
    queryClient.clear();
  }

  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}
