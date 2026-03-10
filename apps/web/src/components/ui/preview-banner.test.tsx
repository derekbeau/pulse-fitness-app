import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { PREVIEW_BANNER_DEFAULT_MESSAGE, PreviewBanner } from '@/components/ui/preview-banner';

describe('PreviewBanner', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('renders the default preview message', () => {
    render(<PreviewBanner />);

    expect(screen.getByText(PREVIEW_BANNER_DEFAULT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('renders a custom message when provided', () => {
    render(<PreviewBanner message="Custom preview text." />);

    expect(screen.getByText('Custom preview text.')).toBeInTheDocument();
  });

  it('hides the banner for the current session after dismissing', () => {
    render(<PreviewBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText(PREVIEW_BANNER_DEFAULT_MESSAGE)).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('pulse-preview-banner-dismissed')).toBe('true');
  });

  it('does not render when already dismissed in sessionStorage', () => {
    window.sessionStorage.setItem('pulse-preview-banner-dismissed', 'true');

    render(<PreviewBanner />);

    expect(screen.queryByText(PREVIEW_BANNER_DEFAULT_MESSAGE)).not.toBeInTheDocument();
  });
});
