import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { TrashManager } from './trash-manager';

const trashWithItems = {
  habits: [
    {
      id: 'habit-1',
      type: 'habits',
      name: 'Hydrate',
      deletedAt: '2026-03-11T15:00:00.000Z',
    },
  ],
  'workout-templates': [
    {
      id: 'template-1',
      type: 'workout-templates',
      name: 'Upper Body',
      deletedAt: '2026-03-11T14:00:00.000Z',
    },
  ],
  exercises: [],
  foods: [],
  'workout-sessions': [],
} as const;

function createJsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    headers: {
      'Content-Type': 'application/json',
    },
    status: 200,
  });
}

function renderTrashManager() {
  const { wrapper } = createQueryClientWrapper();

  return render(<TrashManager />, { wrapper });
}

describe('TrashManager', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const rawUrl =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(rawUrl, 'http://localhost');
        const method = init?.method?.toUpperCase() ?? 'GET';

        if (url.pathname === '/api/v1/trash' && method === 'GET') {
          return Promise.resolve(createJsonResponse(trashWithItems));
        }

        if (url.pathname === '/api/v1/trash/habits/habit-1/restore' && method === 'POST') {
          return Promise.resolve(createJsonResponse({ success: true }));
        }

        if (url.pathname === '/api/v1/trash/habits/habit-1' && method === 'DELETE') {
          return Promise.resolve(createJsonResponse({ success: true }));
        }

        return Promise.resolve(createJsonResponse(null));
      }),
    );
  });

  it('groups trash items and allows restoring them', async () => {
    renderTrashManager();

    await waitFor(() => {
      expect(screen.getByText('Habits (1)')).toBeInTheDocument();
    });

    expect(screen.getByText('Templates (1)')).toBeInTheDocument();
    const hydrateRow = screen.getByText('Hydrate').closest('li');

    expect(hydrateRow).not.toBeNull();

    fireEvent.click(within(hydrateRow as HTMLElement).getByRole('button', { name: 'Restore' }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/v1/trash/habits/habit-1/restore',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows confirm dialog before permanently deleting an item', async () => {
    renderTrashManager();

    await waitFor(() => {
      expect(screen.getByText('Hydrate')).toBeInTheDocument();
    });

    const hydrateRow = screen.getByText('Hydrate').closest('li');
    expect(hydrateRow).not.toBeNull();

    fireEvent.click(
      within(hydrateRow as HTMLElement).getByRole('button', { name: 'Delete permanently' }),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete habit?')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'This will permanently remove "Hydrate" from trash and it cannot be restored.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/v1/trash/habits/habit-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('renders empty state when there are no deleted items', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const rawUrl =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(rawUrl, 'http://localhost');
        const method = init?.method?.toUpperCase() ?? 'GET';

        if (url.pathname === '/api/v1/trash' && method === 'GET') {
          return Promise.resolve(
            createJsonResponse({
              habits: [],
              'workout-templates': [],
              exercises: [],
              foods: [],
              'workout-sessions': [],
            }),
          );
        }

        return Promise.resolve(createJsonResponse(null));
      }),
    );

    renderTrashManager();

    await waitFor(() => {
      expect(screen.getByText('Trash is empty')).toBeInTheDocument();
    });
  });
});
