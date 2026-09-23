import { useQuery } from '@tanstack/react-query';
import {
  dailyContextRuntimeResponseSchema,
  journalDetailSchema,
  journalListSchema,
  weeklyReflectionReadModelSchema,
} from '@pulse/shared';
import { apiRequest, ApiError } from '@/lib/api-client';

const retry = (attempt: number, error: Error) =>
  !(error instanceof ApiError && [400, 401, 404, 422].includes(error.status)) && attempt < 2;
export const fetchJournal = async (from: string, to: string, signal?: AbortSignal) =>
  journalListSchema.parse(
    await apiRequest<unknown>(`/api/v1/journal?from=${from}&to=${to}`, { signal }),
  );
export const fetchJournalEntry = async (id: string, signal?: AbortSignal) =>
  journalDetailSchema.parse(
    await apiRequest<unknown>(`/api/v1/journal/${encodeURIComponent(id)}`, { signal }),
  );
export const fetchWeeklyReflection = async (start: string, end: string, signal?: AbortSignal) =>
  weeklyReflectionReadModelSchema.parse(
    await apiRequest<unknown>(`/api/v1/journal/weekly-reflection?start=${start}&end=${end}`, {
      signal,
    }),
  );
export const fetchDailyContext = async (date: string, signal?: AbortSignal) =>
  dailyContextRuntimeResponseSchema.parse(
    await apiRequest<unknown>(`/api/v1/daily-context?date=${date}`, { signal }),
  );
export const useJournal = (from: string, to: string) =>
  useQuery({
    queryKey: ['journal', from, to],
    queryFn: ({ signal }) => fetchJournal(from, to, signal),
    retry,
  });
export const useJournalEntry = (id: string) =>
  useQuery({
    queryKey: ['journal', id],
    queryFn: ({ signal }) => fetchJournalEntry(id, signal),
    enabled: Boolean(id),
    retry,
  });
export const useWeeklyReflection = (start: string, end: string) =>
  useQuery({
    queryKey: ['journal', 'weekly', start, end],
    queryFn: ({ signal }) => fetchWeeklyReflection(start, end, signal),
    retry,
  });
export const useDailyContext = (date: string) =>
  useQuery({
    queryKey: ['daily-context', date],
    queryFn: ({ signal }) => fetchDailyContext(date, signal),
    retry,
  });
