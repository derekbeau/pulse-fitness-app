import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActivityForm } from './activity-form';

function removeRandomUuid() {
  const nativeCrypto = globalThis.crypto;
  vi.stubGlobal('crypto', {
    getRandomValues: nativeCrypto.getRandomValues.bind(nativeCrypto),
  });
}

function submitActivity() {
  fireEvent.click(screen.getByRole('button', { name: 'Add Activity' }));
  fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Log Activity' }));
}

describe('ActivityForm browser IDs', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates distinct prefixed local IDs without randomUUID', () => {
    removeRandomUuid();
    const onSubmit = vi.fn();
    const view = render(<ActivityForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Activity' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Rerendered walk' } });
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log Activity' }));
    submitActivity();

    expect(onSubmit).toHaveBeenCalledTimes(2);
    const firstId = onSubmit.mock.calls[0]?.[0].id as string;
    const secondId = onSubmit.mock.calls[1]?.[0].id as string;
    expect(firstId).toMatch(/^activity-local-[0-9a-f-]{36}$/u);
    expect(secondId).toMatch(/^activity-local-[0-9a-f-]{36}$/u);
    expect(secondId).not.toBe(firstId);
    expect(view.container).toHaveTextContent('Logged');
  });

  it('keeps the form open with a recoverable error when crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    const onSubmit = vi.fn();
    render(<ActivityForm onSubmit={onSubmit} />);

    submitActivity();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This browser cannot create a secure activity identifier',
    );
  });
});
