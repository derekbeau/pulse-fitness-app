import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, apiRequestWithMeta } from '@/lib/api-client';
import { fetchActivities, fetchActivity } from './activity';
import {
  fetchJournal,
  fetchJournalEntry,
  fetchWeeklyReflection,
  fetchDailyContext,
} from '@/features/journal/api/journal';
import { fetchSessionContext } from '@/features/workouts/api/session-context';

vi.mock('@/lib/api-client', () => ({
  apiRequest: vi.fn(),
  apiRequestWithMeta: vi.fn(),
  ApiError: class extends Error {
    status = 500;
  },
}));
const html = readFileSync(
  resolve(process.cwd(), '../../docs/implementation/activity-journal-183-fixtures/live-ui.html'),
  'utf8',
);
const encoded = html.match(
  /<script type="application\/json" id="fixtures">([\s\S]*?)<\/script>/u,
)?.[1];
if (!encoded) throw new Error('Registered #183 GET fixture missing');
const fixture = JSON.parse(encoded) as {
  paths: Record<string, string>;
  envelopes: Record<string, { data: unknown; meta?: unknown }>;
};
const pathPart = (path: string, index: number) => {
  const value = path.split('/').at(index);
  if (!value) throw new Error(`Missing path segment in ${path}`);
  return value;
};
const envelope = (name: string) => {
  const value = fixture.envelopes[name];
  if (!value) throw new Error(`Missing registered envelope ${name}`);
  return value;
};

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequestWithMeta).mockReset();
});

describe('strict #183 web adapters over registered GET envelopes', () => {
  it('parses canonical and legacy Activity list plus exact owner detail', async () => {
    vi.mocked(apiRequestWithMeta).mockResolvedValue(envelope('activities') as never);
    vi.mocked(apiRequest).mockResolvedValue(envelope('activity').data as never);
    const list = await fetchActivities();
    expect(list.data.some((item) => item.recordType === 'canonical')).toBe(true);
    expect(list.data.some((item) => item.recordType === 'legacy_date_only')).toBe(true);
    const detail = await fetchActivity(pathPart(fixture.paths.activity, -1));
    expect(detail.recordType).toBe('canonical');
  });
  it('parses Journal, daily, weekly, and two distinct session contexts', async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      const name = Object.entries(fixture.paths).find(([, value]) => value === path)?.[0];
      if (!name) throw new Error(`Unexpected path ${path}`);
      return envelope(name).data as never;
    });
    const journal = await fetchJournal('2026-09-22', '2026-09-28');
    expect(journal.items.some((item) => item.kind === 'canonical')).toBe(true);
    expect(journal.items.some((item) => item.kind === 'legacy_date_only')).toBe(true);
    const detail = await fetchJournalEntry(pathPart(fixture.paths.journalDetail, -1));
    expect(detail.observation.sourceReferences.length).toBeGreaterThan(0);
    expect((await fetchWeeklyReflection('2026-09-22', '2026-09-28')).gaps.length).toBeGreaterThan(
      0,
    );
    expect((await fetchDailyContext('2026-09-24')).currentAnswers[0]?.state).toBe('unknown');
    const upperId = pathPart(fixture.paths.upperSession, -2);
    const lowerId = pathPart(fixture.paths.lowerSession, -2);
    const upper = await fetchSessionContext(upperId);
    const lower = await fetchSessionContext(lowerId);
    expect(upper.relevantConcerns.map((item) => item.id)).not.toEqual(
      lower.relevantConcerns.map((item) => item.id),
    );
  });
});
