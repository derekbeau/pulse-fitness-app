import type { MouseEvent, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { jsonResponse } from '@/test/test-utils';
import { TemplateBrowser } from './template-browser';

const renameMutateMock = vi.fn();
const deleteMutateMock = vi.fn();
const scheduleMutateAsyncMock = vi.fn();

vi.mock('@/features/workouts/api/workouts', () => ({
  useRenameTemplate: () => ({
    isPending: false,
    mutate: renameMutateMock,
  }),
  useDeleteTemplate: () => ({
    isPending: false,
    mutateAsync: deleteMutateMock,
  }),
  useScheduleWorkout: () => ({
    isPending: false,
    mutateAsync: scheduleMutateAsyncMock,
  }),
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect?: (event: MouseEvent<HTMLButtonElement>) => void;
  }) => (
    <button onClick={onSelect} type="button">
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('TemplateBrowser', () => {
  beforeEach(() => {
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
    window.history.pushState({}, '', '/workouts?view=templates');
    renameMutateMock.mockReset();
    deleteMutateMock.mockReset().mockResolvedValue({ id: 'template-1' });
    scheduleMutateAsyncMock.mockReset();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-sessions') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      if (url.pathname === '/api/v1/scheduled-workouts') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });
  });

  afterEach(() => {
    window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('renders updated copy and empty state for users without templates', () => {
    render(
      <MemoryRouter>
        <TemplateBrowser buildTemplateHref={(templateId) => `/workouts/template/${templateId}`} />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(
        'Launch one of your saved templates and jump straight into an active workout.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('No templates yet — create your first one.')).toBeInTheDocument();
    expect(screen.getByLabelText('Search templates by name')).toHaveClass('pl-9');
  });

  it('filters templates by search query', () => {
    render(
      <MemoryRouter>
        <TemplateBrowser
          buildTemplateHref={(templateId) => `/workouts/template/${templateId}`}
          templates={[
            {
              id: 'template-1',
              name: 'Upper Push',
              description: 'Chest and shoulders',
              tags: ['push'],
              sections: [{ exercises: [] }],
            },
            {
              id: 'template-2',
              name: 'Lower Body',
              description: 'Leg training',
              tags: ['legs'],
              sections: [{ exercises: [] }],
            },
          ]}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Search templates by name'), {
      target: { value: 'lower' },
    });

    expect(screen.getByRole('link', { name: 'Lower Body' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Upper Push' })).not.toBeInTheDocument();
  });

  it('persists template sort selection in URL search params', async () => {
    render(
      <BrowserRouter>
        <TemplateBrowser
          buildTemplateHref={(templateId) => `/workouts/template/${templateId}`}
          templates={[
            {
              id: 'template-1',
              name: 'Upper Push',
              description: 'Chest and shoulders',
              tags: ['push'],
              sections: [{ exercises: [] }],
            },
            {
              id: 'template-2',
              name: 'Lower Body',
              description: 'Leg day',
              tags: ['legs'],
              sections: [{ exercises: [] }],
            },
          ]}
        />
      </BrowserRouter>,
    );

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Sort templates' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(screen.getByText('Name (Z-A)'));

    await waitFor(() => {
      expect(window.location.search).toContain('sort=name-desc');
    });
  });

  it('persists per-page in URL params and resets page to 1 when changed', async () => {
    window.history.pushState({}, '', '/workouts?view=templates&page=2');

    render(
      <BrowserRouter>
        <TemplateBrowser
          buildTemplateHref={(templateId) => `/workouts/template/${templateId}`}
          templates={[
            {
              id: 'template-1',
              name: 'Upper Push',
              description: null,
              tags: ['push'],
              sections: [{ exercises: [] }],
            },
          ]}
          totalTemplates={40}
        />
      </BrowserRouter>,
    );

    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Templates per page' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(screen.getByText('10 / page'));

    await waitFor(() => {
      expect(window.location.search).toContain('limit=10');
      expect(window.location.search).toContain('page=1');
    });
    expect(screen.getByText('Page 1 of 4')).toBeInTheDocument();
  });

  it('filters templates by selected tags using AND logic', () => {
    render(
      <MemoryRouter>
        <TemplateBrowser
          buildTemplateHref={(templateId) => `/workouts/template/${templateId}`}
          templates={[
            {
              id: 'template-1',
              name: 'Upper Push Strength',
              description: null,
              tags: ['push', 'strength'],
              sections: [{ exercises: [] }],
            },
            {
              id: 'template-2',
              name: 'Upper Push Volume',
              description: null,
              tags: ['push'],
              sections: [{ exercises: [] }],
            },
            {
              id: 'template-3',
              name: 'Lower Strength',
              description: null,
              tags: ['strength'],
              sections: [{ exercises: [] }],
            },
          ]}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Filter by tag Push' }));

    expect(screen.getByRole('link', { name: 'Upper Push Strength' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upper Push Volume' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lower Strength' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Filter by tag Strength' }));

    expect(screen.getByRole('link', { name: 'Upper Push Strength' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Upper Push Volume' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lower Strength' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(screen.getByRole('link', { name: 'Upper Push Strength' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upper Push Volume' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lower Strength' })).toBeInTheDocument();
  });

  it('opens rename dialog and submits new template name', async () => {
    render(
      <MemoryRouter>
        <TemplateBrowser
          buildTemplateHref={(templateId) => `/workouts/template/${templateId}`}
          templates={[
            {
              id: 'template-1',
              name: 'Upper Push',
              description: 'Chest and shoulders',
              tags: ['push'],
              sections: [{ exercises: [] }],
            },
          ]}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Template actions for Upper Push' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));

    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Template name');
    expect(input).toHaveValue('Upper Push');

    fireEvent.change(input, { target: { value: 'Upper Push v2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(renameMutateMock).toHaveBeenCalledWith(
      {
        id: 'template-1',
        name: 'Upper Push v2',
      },
      expect.objectContaining({
        onError: expect.any(Function),
        onSuccess: expect.any(Function),
      }),
    );
  });

  it('opens delete confirmation and confirms deletion', async () => {
    render(
      <MemoryRouter>
        <TemplateBrowser
          buildTemplateHref={(templateId) => `/workouts/template/${templateId}`}
          templates={[
            {
              id: 'template-1',
              name: 'Upper Push',
              description: 'Chest and shoulders',
              tags: ['push'],
              sections: [{ exercises: [] }],
            },
          ]}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Template actions for Upper Push' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete template?')).toBeInTheDocument();
    expect(
      within(dialog).getByText('This will permanently remove "Upper Push" from your templates.'),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete template' }));

    expect(deleteMutateMock).toHaveBeenCalledWith({
      id: 'template-1',
    });
  });

  it('opens schedule dialog from template actions and submits selected date', async () => {
    scheduleMutateAsyncMock.mockResolvedValue({});

    render(
      <MemoryRouter>
        <TemplateBrowser
          buildTemplateHref={(templateId) => `/workouts/template/${templateId}`}
          templates={[
            {
              id: 'template-1',
              name: 'Upper Push',
              description: 'Chest and shoulders',
              tags: ['push'],
              sections: [{ exercises: [] }],
            },
          ]}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Template actions for Upper Push' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Schedule workout' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Schedule' }));

    await waitFor(() => {
      expect(scheduleMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'template-1',
        }),
      );
    });
  });

  it('warns before scheduling another workout on an occupied day', async () => {
    scheduleMutateAsyncMock.mockResolvedValue({});
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/workout-sessions') {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                id: 'session-1',
                name: 'Upper Push',
                date: '2026-03-13',
                status: 'completed',
                templateId: 'template-1',
                templateName: 'Upper Push',
                startedAt: Date.parse('2026-03-13T10:00:00Z'),
                completedAt: Date.parse('2026-03-13T11:00:00Z'),
                duration: 60,
                exerciseCount: 5,
                createdAt: 1,
              },
            ],
          }),
        );
      }

      if (url.pathname === '/api/v1/scheduled-workouts') {
        return Promise.resolve(jsonResponse({ data: [] }));
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    render(
      <MemoryRouter initialEntries={['/workouts?date=2026-03-13']}>
        <TemplateBrowser
          buildTemplateHref={(templateId) => `/workouts/template/${templateId}`}
          templates={[
            {
              id: 'template-1',
              name: 'Upper Push',
              description: 'Chest and shoulders',
              tags: ['push'],
              sections: [{ exercises: [] }],
            },
          ]}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Template actions for Upper Push' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Schedule workout' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Schedule' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('This day already has a workout')).toBeInTheDocument();
    expect(within(dialog).getByText(/Upper Push \(completed\)/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create another anyway' }));

    await waitFor(() => {
      expect(scheduleMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'template-1',
        }),
      );
    });
  });
});
