import type { MouseEvent, ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    renameMutateMock.mockReset();
    deleteMutateMock.mockReset().mockResolvedValue({ id: 'template-1' });
    scheduleMutateAsyncMock.mockReset();
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

    expect(scheduleMutateAsyncMock).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: 'template-1',
      }),
    );
  });
});
