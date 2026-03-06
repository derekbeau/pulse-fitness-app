import { useLayoutEffect, type ReactNode } from 'react';
import { ThemeContext } from '@/components/theme-context';
import { applyThemeClass, useTheme } from '@/hooks/useTheme';

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const themeState = useTheme();

  useLayoutEffect(() => {
    applyThemeClass(themeState.theme);
  }, [themeState.theme]);

  return <ThemeContext.Provider value={themeState}>{children}</ThemeContext.Provider>;
}
