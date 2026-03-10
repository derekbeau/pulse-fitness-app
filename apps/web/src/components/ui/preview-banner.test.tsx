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
    expect(screen.getByRole('button', { name: 'Dismiss preview banner' })).toBeInTheDocument();
  });

  it('renders a custom message when provided', () => {
    render(<PreviewBanner message="Custom preview text." />);

    expect(screen.getByText('Custom preview text.')).toBeInTheDocument();
  });

  it('hides the banner for the current session after dismissing', () => {
    render(<PreviewBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss preview banner' }));

    expect(screen.queryByText(PREVIEW_BANNER_DEFAULT_MESSAGE)).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem('pulse-preview-banner-dismissed')).toBe('true');
  });

  it('does not render when already dismissed in sessionStorage', () => {
    window.sessionStorage.setItem('pulse-preview-banner-dismissed', 'true');

    render(<PreviewBanner />);

    expect(screen.queryByText(PREVIEW_BANNER_DEFAULT_MESSAGE)).not.toBeInTheDocument();
  });

  it('uses a custom storageKey independently from the default key', () => {
    const { unmount } = render(<PreviewBanner storageKey="custom-key" />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss preview banner' }));

    expect(window.sessionStorage.getItem('custom-key')).toBe('true');
    expect(window.sessionStorage.getItem('pulse-preview-banner-dismissed')).toBeNull();

    unmount();
    window.sessionStorage.setItem('custom-key', 'true');

    render(<PreviewBanner storageKey="custom-key" />);

    expect(screen.queryByText(PREVIEW_BANNER_DEFAULT_MESSAGE)).not.toBeInTheDocument();
  });
});
