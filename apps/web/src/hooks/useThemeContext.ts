import { useContext } from 'react';
import { ThemeContext } from '@/components/theme-context';
import type { UseThemeReturn } from '@/hooks/useTheme';

export function useThemeContext(): UseThemeReturn {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }

  return context;
}
