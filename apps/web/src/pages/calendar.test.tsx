import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { CalendarPage } from './calendar';

vi.mock('@/hooks/use-date-authority', () => ({
  useDateAuthority: () => ({ localDate: '2026-03-12' }),
}));
vi.mock('@/features/calendar/api/calendar', () => ({
  useCalendar: () => ({
    data: {
      from: '2026-02-23',
      to: '2026-04-05',
      timeZone: 'America/Detroit',
      items: [
        {
          id: 'zero-log',
          domain: 'nutrition',
          record: { kind: 'nutrition_log', id: 'zero-log' },
          localDate: '2026-03-12',
          state: 'summary',
          title: 'Nutrition',
          nutrition: {
            actual: { calories: 0, protein: 0, carbs: 0, fat: 0 },
            target: { calories: 2000, protein: 100, carbs: 250, fat: 60 },
          },
        },
        {
          id: 'nutrition-day:2026-03-13',
          domain: 'nutrition',
          record: { kind: 'nutrition_log', id: 'nutrition-day:2026-03-13' },
          localDate: '2026-03-13',
          state: 'summary',
          title: 'Nutrition',
          nutrition: {
            actual: null,
            target: { calories: 1950, protein: 90, carbs: 240, fat: 65 },
          },
        },
        {
          id: 'assignment-1',
          domain: 'activity',
          record: { kind: 'activity_assignment', id: 'assignment-1' },
          activityId: 'canonical-activity-1',
          localDate: '2026-03-12',
          state: 'planned',
          title: 'Fictional assignment',
        },
        {
          id: 'execution-1',
          domain: 'activity',
          record: { kind: 'activity_execution', id: 'execution-1' },
          activityId: 'canonical-activity-1',
          localDate: '2026-03-12',
          state: 'completed',
          title: 'Fictional execution',
        },
        {
          id: 'journal-1',
          domain: 'journal',
          record: { kind: 'journal_observation', id: 'journal-1' },
          localDate: '2026-03-12',
          state: 'observed',
          title: 'Fictional observation',
        },
        {
          id: 'legacy-journal-1',
          domain: 'journal',
          record: { kind: 'journal_entry', id: 'legacy-journal-1' },
          localDate: '2026-03-12',
          state: 'observed',
          title: 'Fictional legacy note',
        },
        {
          id: 'flare-1',
          domain: 'body_context',
          record: { kind: 'observation', id: 'flare-1' },
          localDate: '2026-03-12',
          state: 'observed',
          title: 'Fictional flare',
        },
      ],
    },
    isPending: false,
    isError: false,
    error: null,
  }),
}));

describe('Calendar nutrition detail', () => {
  it('shows all actual and target macros while preserving zero versus unknown', () => {
    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agenda' }));
    const zero = within(document.querySelector('[data-record-id="zero-log"]') as HTMLElement);
    expect(zero.getByText('Actual: 0 kcal · 0 g protein · 0 g carbs · 0 g fat')).toBeVisible();
    expect(
      zero.getByText('Target: 2,000 kcal · 100 g protein · 250 g carbs · 60 g fat'),
    ).toBeVisible();
    const targetOnly = within(
      document.querySelector('[data-record-id="nutrition-day:2026-03-13"]') as HTMLElement,
    );
    expect(targetOnly.getByText('Actual: intake unknown')).toBeVisible();
    expect(
      targetOnly.getByText('Target: 1,950 kcal · 90 g protein · 240 g carbs · 65 g fat'),
    ).toBeVisible();
  });
  it('links owned activity occurrences and Journal records to exact detail identities', () => {
    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agenda' }));
    expect(document.querySelector('[data-record-id="assignment-1"]')).toHaveAttribute(
      'href',
      '/activity/canonical-activity-1?occurrence=assignment-1',
    );
    expect(document.querySelector('[data-record-id="execution-1"]')).toHaveAttribute(
      'href',
      '/activity/canonical-activity-1?occurrence=execution-1',
    );
    expect(document.querySelector('[data-record-id="journal-1"]')).toHaveAttribute(
      'href',
      '/journal/journal-1',
    );
    expect(document.querySelector('[data-record-id="legacy-journal-1"]')).toHaveAttribute(
      'href',
      '/journal?date=2026-03-12&legacy=legacy-journal-1',
    );
    expect(document.querySelector('[data-record-id="flare-1"]')).toHaveAttribute(
      'href',
      '/journal?date=2026-03-12&flare=flare-1',
    );
  });
});
