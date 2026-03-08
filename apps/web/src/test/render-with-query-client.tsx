import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';

import { createAppQueryClient } from '@/lib/query-client';

export function renderWithQueryClient(element: ReactElement) {
  const queryClient = createAppQueryClient();

  return render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>);
}
