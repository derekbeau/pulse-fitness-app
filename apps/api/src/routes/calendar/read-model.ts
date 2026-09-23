import type Database from 'better-sqlite3';
import {
  calendarRuntimeSchema,
  type CalendarRuntime,
  type CalendarRuntimeItem,
} from '@pulse/shared';
import { resolveUserTimeZoneForUser } from '../../lib/user-time-zone.js';
import { getDailyNutritionSummaryForDate } from '../nutrition/store.js';
import { readSourceReference } from '../daily-check-in/source-authority.js';

type Domain = CalendarRuntime['filters']['domain'][number];
type State = CalendarRuntime['filters']['state'][number];
type Row = Record<string, unknown>;
const SOURCE_LIMIT = 1000;
const OUTPUT_LIMIT = 10_000;
export class CalendarReadLimitError extends Error {
  constructor(
    readonly scope: string,
    readonly limit: number,
  ) {
    super('Calendar read limit exceeded');
  }
}
export class CalendarTimeZoneError extends Error {}
const dateOffset = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
const title = (value: unknown) =>
  String(value || 'Untitled')
    .trim()
    .slice(0, 255) || 'Untitled';
const text = (value: unknown) => String(value);
const optional = (value: unknown) => (value === null || value === undefined ? null : String(value));
const read = (
  sqlite: Database.Database,
  scope: string,
  sql: string,
  userId: string,
  from: string,
  to: string,
) => {
  const rows = sqlite.prepare(sql).all(userId, from, to, SOURCE_LIMIT + 1) as Row[];
  if (rows.length > SOURCE_LIMIT) throw new CalendarReadLimitError(scope, SOURCE_LIMIT);
  return rows;
};
const queries = {
  source_activity_assignments: `select a.*, c.name from activity_assignments a join canonical_activities c on c.id=a.activity_id and c.user_id=a.user_id where a.user_id=? and a.planned_local_date between ? and ? order by a.planned_local_date,a.id limit ?`,
  source_activity_executions: `select e.*, c.name from activity_executions e join canonical_activities c on c.id=e.activity_id and c.user_id=e.user_id where e.user_id=? and e.actual_local_date between ? and ? order by e.actual_local_date,e.id limit ?`,
  source_legacy_activities: `select * from activities where user_id=? and date between ? and ? order by date,id limit ?`,
  source_scheduled_workouts: `select s.*, t.name from scheduled_workouts s left join workout_templates t on t.id=s.template_id and t.user_id=s.user_id where s.user_id=? and s.date between ? and ? order by s.date,s.id limit ?`,
  source_workout_sessions: `select * from workout_sessions where user_id=? and date between ? and ? and deleted_at is null order by date,id limit ?`,
  source_journal_observations: `select * from journal_observations where user_id=? and local_date between ? and ? order by local_date,id limit ?`,
  source_legacy_journal: `select * from journal_entries where user_id=? and date between ? and ? order by date,id limit ?`,
  source_observations: `select * from body_context_flares where user_id=? and local_date between ? and ? order by local_date,id limit ?`,
  source_nutrition_logs: `select n.*, exists(select 1 from meals m where m.nutrition_log_id=n.id) as has_meal, exists(select 1 from meal_items mi join meals m on m.id=mi.meal_id where m.nutrition_log_id=n.id) as has_item from nutrition_logs n where n.user_id=? and n.date between ? and ? order by n.date,n.id limit ?`,
} as const;

export const buildCalendarReadModel = async ({
  sqlite,
  userId,
  from,
  to,
  domains = [],
  states = [],
}: {
  sqlite: Database.Database;
  userId: string;
  from: string;
  to: string;
  domains?: Domain[];
  states?: State[];
}): Promise<CalendarRuntime> => {
  const zone = await resolveUserTimeZoneForUser(userId);
  if (!zone) throw new CalendarTimeZoneError();
  const timeZone = zone.timeZone;
  const source = Object.fromEntries(
    Object.entries(queries).map(([scope, sql]) => [
      scope,
      read(sqlite, scope, sql, userId, from, to),
    ]),
  ) as Record<keyof typeof queries, Row[]>;
  const items: CalendarRuntimeItem[] = [];
  const add = (
    domain: Domain,
    kind: CalendarRuntimeItem['record']['kind'],
    row: Row,
    localDate: string,
    itemTimeZone: string,
    occurrenceAt: string | null,
    state: State,
    itemTitle: string,
    extra: Partial<CalendarRuntimeItem> = {},
  ) => {
    if (domains.length && !domains.includes(domain)) return;
    if (states.length && !states.includes(state)) return;
    const id = text(row.id);
    const sourceReference =
      kind === 'journal_entry' || extra.missingProvenance
        ? null
        : readSourceReference(sqlite, userId, kind, id);
    items.push({
      id,
      subjectUserId: userId,
      domain,
      record: {
        kind,
        id,
        subjectUserId: userId,
        revisionId: sourceReference?.revisionId ?? optional(row.current_revision_id),
      },
      localDate,
      timeZone: itemTimeZone,
      occurrenceAt,
      state,
      title: title(itemTitle),
      ...(sourceReference ? { sourceReference } : {}),
      ...extra,
    });
  };
  for (const row of source.source_activity_assignments) {
    if (row.state !== 'planned' && row.state !== 'completed') continue;
    add(
      'activity',
      'activity_assignment',
      row,
      text(row.planned_local_date),
      text(row.time_zone),
      null,
      'planned',
      text(row.name),
      {
        lifecycleStatus: row.state as 'planned' | 'completed',
        plannedLocalDate: text(row.planned_local_date),
        activityId: text(row.activity_id),
        assignmentId: text(row.id),
      },
    );
  }
  for (const row of source.source_activity_executions) {
    if (row.outcome !== 'completed' && row.outcome !== 'partial') continue;
    add(
      'activity',
      'activity_execution',
      row,
      text(row.actual_local_date),
      text(row.time_zone),
      text(row.actual_occurred_at),
      'completed',
      text(row.name),
      {
        lifecycleStatus: row.outcome as 'completed' | 'partial',
        actualLocalDate: text(row.actual_local_date),
        activityId: text(row.activity_id),
        assignmentId: optional(row.assignment_id),
        workoutSessionId: optional(row.structured_workout_session_id),
      },
    );
  }
  for (const row of source.source_legacy_activities)
    add('activity', 'activity', row, text(row.date), timeZone, null, 'completed', text(row.name), {
      missingProvenance: true,
      actualLocalDate: text(row.date),
    });

  const liveSession = sqlite.prepare(
    `select 1 from workout_sessions where user_id=? and deleted_at is null and status != 'cancelled' and (id=? or scheduled_workout_id=?) limit 1`,
  );
  for (const row of source.source_scheduled_workouts) {
    if (row.session_id !== null || liveSession.get(userId, row.session_id, row.id)) continue;
    add(
      'workout',
      'scheduled_workout',
      row,
      text(row.date),
      timeZone,
      null,
      'planned',
      title(row.name ?? 'Workout unavailable'),
      {
        lifecycleStatus: 'scheduled',
        plannedLocalDate: text(row.date),
        scheduledWorkoutId: text(row.id),
      },
    );
  }
  const linkedSchedule = sqlite.prepare(
    'select id,date from scheduled_workouts where user_id=? and (id=? or session_id=?) limit 1',
  );
  const executionIdsBySession = new Map<string, string[]>();
  for (const execution of source.source_activity_executions) {
    if (
      (execution.outcome !== 'completed' && execution.outcome !== 'partial') ||
      !execution.structured_workout_session_id
    )
      continue;
    const sessionId = text(execution.structured_workout_session_id);
    executionIdsBySession.set(sessionId, [
      ...(executionIdsBySession.get(sessionId) ?? []),
      text(execution.id),
    ]);
  }
  for (const row of source.source_workout_sessions) {
    if (row.deleted_at !== null || row.status === 'cancelled') continue;
    const linked = linkedSchedule.get(userId, row.scheduled_workout_id, row.id) as
      | { id: string; date: string }
      | undefined;
    add(
      'workout',
      'workout_session',
      row,
      text(row.date),
      timeZone,
      null,
      row.status === 'completed' ? 'completed' : 'planned',
      text(row.name),
      {
        lifecycleStatus: row.status as 'scheduled' | 'in-progress' | 'paused' | 'completed',
        plannedLocalDate: linked?.date ?? null,
        actualLocalDate: text(row.date),
        scheduledWorkoutId: linked?.id ?? null,
        workoutSessionId: text(row.id),
        linkedActivityExecutionIds: executionIdsBySession.get(text(row.id)) ?? [],
      },
    );
  }
  for (const row of source.source_journal_observations) {
    const snapshot = JSON.parse(text(row.snapshot_json)) as { title: string };
    add(
      'journal',
      'journal_entry',
      row,
      text(row.local_date),
      text(row.time_zone),
      null,
      'observed',
      snapshot.title,
    );
  }
  for (const row of source.source_legacy_journal)
    add(
      'journal',
      'journal_entry',
      row,
      text(row.date),
      timeZone,
      null,
      'observed',
      text(row.title),
      { missingProvenance: true },
    );
  for (const row of source.source_observations)
    add(
      'body_context',
      'observation',
      row,
      text(row.local_date),
      text(row.time_zone),
      text(row.occurred_at),
      'observed',
      text(row.observation),
    );

  const logs = new Map(source.source_nutrition_logs.map((row) => [text(row.date), row]));
  for (let date = from; date <= to; date = dateOffset(date, 1)) {
    const log = logs.get(date);
    const hasEvidence = Boolean(
      log && (log.has_meal || log.status_updated_at !== null || log.status !== 'unknown'),
    );
    const summary = await getDailyNutritionSummaryForDate(userId, date);
    if (!hasEvidence && !summary.target) continue;
    if (domains.length && !domains.includes('nutrition')) continue;
    if (states.length && !states.includes('summary')) continue;
    // Target-only days are projections keyed by owner and date. They are not persisted nutrition logs.
    const id = log && hasEvidence ? text(log.id) : `nutrition-day:${date}`;
    const sourceReference =
      log && hasEvidence ? readSourceReference(sqlite, userId, 'nutrition_log', id) : null;
    const actualKnown = Boolean(
      log && (log.has_item || log.status === 'partial' || log.status === 'complete'),
    );
    items.push({
      id,
      subjectUserId: userId,
      domain: 'nutrition',
      record: {
        kind: 'nutrition_log',
        id,
        subjectUserId: userId,
        revisionId: sourceReference?.revisionId ?? null,
      },
      localDate: date,
      timeZone,
      occurrenceAt: null,
      state: 'summary',
      title: 'Nutrition',
      ...(sourceReference ? { sourceReference } : {}),
      nutrition: {
        status: hasEvidence ? (log?.status as 'unknown' | 'partial' | 'complete') : null,
        actual: actualKnown ? summary.actual : null,
        target: summary.target,
      },
    });
  }
  if (items.length > OUTPUT_LIMIT) throw new CalendarReadLimitError('items', OUTPUT_LIMIT);
  const unique = new Set<string>();
  for (const item of items) {
    const key = JSON.stringify([item.domain, item.record.kind, item.record.id]);
    if (unique.has(key)) throw new Error(`Duplicate calendar identity ${key}`);
    unique.add(key);
  }
  items.sort(
    (a, b) =>
      a.localDate.localeCompare(b.localDate) ||
      a.domain.localeCompare(b.domain) ||
      a.id.localeCompare(b.id),
  );
  return calendarRuntimeSchema.parse({
    contractVersion: 'activity-journal-v1',
    subjectUserId: userId,
    from,
    to,
    timeZone,
    filters: { domain: domains, state: states },
    items,
  });
};
