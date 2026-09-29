import { BookOpen } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useJournal, useWeeklyReflection, useDailyContext } from '@/features/journal/api/journal';
import { useDateAuthority } from '@/hooks/use-date-authority';
import { addDays, parseDateKey, toDateKey } from '@/lib/date-utils';
import { ApiError } from '@/lib/api-client';

export function JournalPage() {
  const [params, setParams] = useSearchParams();
  const selectedLegacyId = params.get('legacy');
  const selectedFlareId = params.get('flare');
  const authority = useDateAuthority();
  const requestedDate = params.get('date');
  const date =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/u.test(requestedDate)
      ? requestedDate
      : (authority.localDate ?? toDateKey(new Date()));
  const start = toDateKey(addDays(parseDateKey(date), -6));
  const listStart = toDateKey(addDays(parseDateKey(date), -29));
  const journal = useJournal(listStart, date);
  const weekly = useWeeklyReflection(start, date);
  const daily = useDailyContext(date);
  const error = journal.error ?? weekly.error ?? daily.error;
  const retry = () => {
    void journal.refetch();
    void weekly.refetch();
    void daily.refetch();
  };
  return (
    <section className="space-y-6">
      <PageHeader
        title="Journal"
        description="Saved observations, their sources, and grounded daily context."
        icon={
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <BookOpen className="size-6" />
          </div>
        }
      />
      <label className="flex items-center gap-2">
        Day under review{' '}
        <input
          aria-label="Journal day"
          className="rounded-md border border-border bg-background p-2"
          type="date"
          value={date}
          onChange={(event) => setParams({ date: event.target.value })}
        />
      </label>
      {(journal.isPending || weekly.isPending || daily.isPending) && (
        <p role="status">Loading Journal…</p>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-destructive p-4">
          <p>
            {error instanceof ApiError
              ? `${error.message} (${error.status}${error.code ? ` · ${error.code}` : ''})`
              : error instanceof Error
                ? error.message
                : 'Journal could not load.'}
          </p>
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
      {journal.data && (
        <section aria-label="Journal observations" className="space-y-3">
          <h2 className="text-lg font-semibold">Observations</h2>
          {journal.data.items.length === 0 ? (
            <p>No Journal observations recorded.</p>
          ) : (
            journal.data.items.map((item) =>
              item.kind === 'canonical' ? (
                <Link
                  key={item.observation.id}
                  data-record-id={item.observation.id}
                  className="block rounded-xl border border-border bg-card p-4 focus-visible:outline-2 focus-visible:outline-primary"
                  to={`/journal/${encodeURIComponent(item.observation.id)}`}
                >
                  <h3 className="font-semibold">{item.observation.title}</h3>
                  <p>{item.observation.content}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.observation.localDate} ·{' '}
                    {item.observation.source.class.replaceAll('_', ' ')} · uncertainty:{' '}
                    {item.observation.source.uncertainty} · freshness:{' '}
                    {item.observation.source.freshness.state}
                  </p>
                  <p className="text-xs">
                    {item.observation.sourceReferences.length} source link(s)
                  </p>
                </Link>
              ) : (
                <article
                  key={item.id}
                  data-record-id={item.id}
                  className={`block rounded-xl border bg-card p-4 ${selectedLegacyId === item.id ? 'border-primary bg-primary/10' : 'border-border'}`}
                >
                  <h3 className="font-semibold">{item.title}</h3>
                  <p>Legacy date only: {item.localDate} · provenance missing</p>
                  <p className="text-sm">{item.limitation}</p>
                </article>
              ),
            )
          )}
        </section>
      )}
      {daily.data && (
        <section
          aria-label="Daily check-in"
          className="rounded-xl border border-border bg-card p-4"
        >
          <h2 className="text-lg font-semibold">Daily check-in · {daily.data.localDate}</h2>
          <p>{daily.data.pendingQuestions.length} pending question(s)</p>
          <ul className="space-y-1">
            {daily.data.pendingQuestions.map((item) => (
              <li key={item.questionId}>{item.prompt} · pending</li>
            ))}
            {daily.data.currentAnswers.map((item) => (
              <li key={item.answerId} data-record-id={item.answerId}>
                Answer: {item.state}
                {item.value ? ` · ${item.value}` : ''}
              </li>
            ))}
          </ul>
          <h3 className="mt-3 font-semibold">Flares</h3>
          {daily.data.observations.length ? (
            <ul>
              {daily.data.observations.map((item) => (
                <li
                  key={item.id}
                  data-record-id={item.id}
                  className={
                    selectedFlareId === item.id
                      ? 'rounded border border-primary bg-primary/10 p-2'
                      : undefined
                  }
                >
                  {item.localDate} · {item.text} · {item.source.class.replaceAll('_', ' ')} ·{' '}
                  {item.source.uncertainty}
                </li>
              ))}
            </ul>
          ) : (
            <p>No flares recorded for this day.</p>
          )}
        </section>
      )}
      {weekly.data && (
        <section
          aria-label="Weekly reflection"
          className="rounded-xl border border-border bg-card p-4"
        >
          <h2 className="text-lg font-semibold">
            Weekly grounding · {start} to {date}
          </h2>
          <h3 className="font-semibold">Saved facts</h3>
          {weekly.data.facts.length ? (
            <ul>
              {weekly.data.facts.map((item) => (
                <li key={item.id} data-record-id={item.id}>
                  {item.localDate} · {item.summary}
                </li>
              ))}
            </ul>
          ) : (
            <p>No saved facts in this window.</p>
          )}
          <h3 className="mt-3 font-semibold">Gaps</h3>
          {weekly.data.gaps.length ? (
            <ul>
              {weekly.data.gaps.map((gap, index) => (
                <li key={`${gap}-${index}`}>{gap}</li>
              ))}
            </ul>
          ) : (
            <p>No explicit gaps returned.</p>
          )}
        </section>
      )}
    </section>
  );
}
