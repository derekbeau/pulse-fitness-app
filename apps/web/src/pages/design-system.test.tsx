import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/theme-provider';
import { THEME_STORAGE_KEY } from '@/hooks/useTheme';
import { DesignSystemPage } from '@/pages/design-system';

const TOKEN_INPUTS: Record<string, string> = {
  '--color-background': '#101010',
  '--color-foreground': '#efefef',
  '--color-card': '#202020',
  '--color-primary': '#3366cc',
  '--color-secondary': '#223344',
  '--color-accent-cream': '#f4d488',
  '--color-accent-pink': '#e99bb5',
  '--color-accent-mint': '#8be3cc',
  '--color-muted': '#778899',
  '--color-border': 'rgb(16, 32, 48)',
};

const EXPECTED_TOKEN_VALUES: Record<string, string> = {
  '--color-background': '#101010',
  '--color-foreground': '#EFEFEF',
  '--color-card': '#202020',
  '--color-primary': '#3366CC',
  '--color-secondary': '#223344',
  '--color-accent-cream': '#F4D488',
  '--color-accent-pink': '#E99BB5',
  '--color-accent-mint': '#8BE3CC',
  '--color-muted': '#778899',
  '--color-border': '#102030',
};

const createMediaQueryList = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }) as unknown as MediaQueryList;

const mockMatchMedia = () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => createMediaQueryList(query)),
  );
};

function renderDesignSystemPage() {
  return render(
    <ThemeProvider>
      <DesignSystemPage />
    </ThemeProvider>,
  );
}

describe('DesignSystemPage', () => {
  beforeEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.remove('theme-midnight');
    mockMatchMedia();

    Object.entries(TOKEN_INPUTS).forEach(([token, value]) => {
      document.documentElement.style.setProperty(token, value);
    });
  });

  afterEach(() => {
    Object.keys(TOKEN_INPUTS).forEach((token) => {
      document.documentElement.style.removeProperty(token);
    });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('switches themes live using light, dark, and midnight controls', () => {
    renderDesignSystemPage();

    expect(document.documentElement.classList.contains('dark')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(false);
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    fireEvent.click(screen.getByRole('button', { name: 'Midnight' }));

    expect(document.documentElement.classList.contains('theme-midnight')).toBe(true);
    expect(screen.getByRole('button', { name: 'Midnight' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('midnight');

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('theme-midnight')).toBe(false);
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('renders token swatches with resolved hex values for each design token', async () => {
    renderDesignSystemPage();

    expect(screen.getByRole('heading', { name: 'Color Swatches' })).toBeInTheDocument();

    for (const [token, value] of Object.entries(EXPECTED_TOKEN_VALUES)) {
      expect(screen.getByText(token)).toBeInTheDocument();
      expect(await screen.findByText(value)).toBeInTheDocument();
    }
  });

  it('opens the dialog sample from the dialog trigger button', () => {
    renderDesignSystemPage();

    fireEvent.click(screen.getByRole('button', { name: 'Open Dialog' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sample Dialog' })).toBeInTheDocument();
  });
});
