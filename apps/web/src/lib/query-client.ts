import { QueryClient } from '@tanstack/react-query';

let appQueryClient: QueryClient | null = null;

export function createAppQueryClient(): QueryClient {
  if (appQueryClient) {
    return appQueryClient;
  }

  appQueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return appQueryClient;
}
