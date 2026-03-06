import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { ThemeProvider } from '@/components/theme-provider';

describe('App', () => {
  beforeEach(() => {
    window.localStorage.removeItem('pulse-theme');
    document.documentElement.classList.remove('dark');
  });

  it('renders the hello pulse heading and theme toggle', () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    expect(
      screen.getByRole('heading', {
        name: /hello pulse/i,
      }),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /switch to light theme/i })).toBeInTheDocument();
  });
});
