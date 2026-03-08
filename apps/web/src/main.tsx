import { StrictMode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import { ThemeProvider } from '@/components/theme-provider';
import { createAppQueryClient } from '@/lib/query-client';
import { useAuthStore } from '@/store/auth-store';
import './styles/globals.css';

const rootElement = document.getElementById('root');
const queryClient = createAppQueryClient();

if (!rootElement) {
  throw new Error('Failed to find the root element');
}

useAuthStore.getState().hydrate();

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
