import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DailyNutrition } from '@pulse/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';

import { useDailyNutrition } from '../api/nutrition';
import { DailyNutritionNote } from './daily-nutrition-note';

const date = '2026-03-05';
let saved: DailyNutrition;
let fail: boolean;
let release: (() => void) | undefined;
let hold: boolean;
const requests = vi.fn();
const daily = (notes: string | null): DailyNutrition => ({
  log: {
    id: 'fictional-log',
    userId: 'fictional-user',
    date,
    notes,
    status: 'unknown',
    statusUpdatedAt: null,
    createdAt: 1,
    updatedAt: 1,
  },
  meals: [],
});
function Harness({ selectedDate = date }: { selectedDate?: string }) {
  const query = useDailyNutrition(selectedDate);
  return query.isSuccess ? (
    <DailyNutritionNote
      key={selectedDate}
      date={selectedDate}
      notes={query.data?.log.notes ?? null}
    />
  ) : null;
}
function setup() {
  const { wrapper, queryClient } = createQueryClientWrapper();
  return { ...render(<Harness />, { wrapper }), queryClient, wrapper };
}
beforeEach(() => {
  saved = null;
  fail = false;
  hold = false;
  release = undefined;
  requests.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === 'PATCH') {
        const body = JSON.parse(init.body as string);
        requests(url, body);
        if (hold)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        if (fail)
          return new Response(
            JSON.stringify({ error: { code: 'FAIL', message: 'Fixture failure' } }),
            { status: 500 },
          );
        saved = daily(body.notes);
      }
      return new Response(JSON.stringify({ data: saved }), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('daily nutrition note editor', () => {
  it('adds an empty historical day, trims edges, preserves lines safely, and restores focus', async () => {
    const { container } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Add day note' }));
    const input = screen.getByRole('textbox', { name: `Note for ${date}` });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, {
      target: { value: '  <img src=x onerror=alert(1)>\n  Recovery intake  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await screen.findByRole('button', { name: 'Edit note' });
    expect(requests).toHaveBeenCalledWith(`/api/v1/nutrition/${date}`, {
      notes: '<img src=x onerror=alert(1)>\n  Recovery intake',
    });
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x/)).toHaveClass(
      'whitespace-pre-wrap',
      '[overflow-wrap:anywhere]',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Day note saved.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit note' })).toHaveFocus());
  });

  it('edits existing text, cancels without a request, and discards cancelled draft on reopen', async () => {
    saved = daily('Original');
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit note' }));
    expect(screen.getByRole('textbox')).toHaveValue('Original');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Cancelled' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(requests).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit note' }));
    expect(screen.getByRole('textbox')).toHaveValue('Original');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Replacement' } });
    const editor = screen.getByRole('textbox').closest('form');
    if (!editor) throw new Error('Expected editor form');
    fireEvent.submit(editor);
    expect(await screen.findByText('Replacement')).toBeVisible();
  });

  it('requires confirmation to clear and sends explicit null; cancel does not write', async () => {
    saved = daily('Context');
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Clear note' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(requests).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear note' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear note' }),
    );
    await screen.findByRole('button', { name: 'Add day note' });
    expect(requests).toHaveBeenCalledWith(`/api/v1/nutrition/${date}`, { notes: null });
    expect(screen.getByRole('status')).toHaveTextContent('Day note cleared.');
  });

  it('exposes validation and length errors and never requests whitespace-only or oversized text', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Add day note' }));
    const input = screen.getByRole('textbox');
    for (const value of [' \n ', '😀'.repeat(1001)]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
      await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
      expect(screen.getByRole('alert')).toBeVisible();
      expect(input).toHaveAccessibleDescription(/2,000 characters after trimming/);
    }
    expect(requests).not.toHaveBeenCalled();
  });

  it('prevents duplicate pending saves, rolls back on failure, keeps the draft, and permits retry', async () => {
    saved = daily('Original');
    fail = true;
    hold = true;
    const { queryClient } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit note' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsaved draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(requests).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(queryClient.getQueryData<DailyNutrition>(['nutrition', 'day', date])?.log.notes).toBe(
      'Unsaved draft',
    );
    await act(async () => release?.());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not save'));
    expect(screen.getByRole('textbox')).toHaveValue('Unsaved draft');
    expect(queryClient.getQueryData<DailyNutrition>(['nutrition', 'day', date])?.log.notes).toBe(
      'Original',
    );
    fail = false;
    hold = false;
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Unsaved draft')).toBeVisible();
    expect(requests).toHaveBeenCalledTimes(2);
  });

  it('retains the saved note after a failed clear', async () => {
    saved = daily('Keep me');
    fail = true;
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Clear note' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear note' }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText('Keep me')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Could not save');
  });

  it('resets the editor on date navigation without writing its draft to the next day', async () => {
    const { rerender } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Add day note' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Other day draft' } });
    rerender(<Harness selectedDate="2026-03-04" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add day note' }));
    expect(screen.getByRole('textbox', { name: 'Note for 2026-03-04' })).toHaveValue('');
    expect(requests).not.toHaveBeenCalled();
  });
});
