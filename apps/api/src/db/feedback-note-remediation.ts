import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { assertSyntheticFeedbackDatabase } from './feedback-provenance-migration.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export type FeedbackNoteSource = {
  userId: string;
  kind: 'session' | 'template' | 'scheduled' | 'exercise';
  parentId: string;
  sourceId: string;
  field: string;
  key: string | null;
  text: string;
  actor: string | null;
  timestamp: number | null;
};
export type FeedbackNoteLink = {
  userId: string;
  sourceId: string;
  noteChecksum: string;
  sessionId: string;
  construct: 'recovery' | 'technique' | 'energy';
  sourceChecksum: string;
  evidenceId: string;
};
export const FEEDBACK_NOTE_DDL = `CREATE TABLE feedback_note_dispositions (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL,
 parent_id TEXT NOT NULL,
 source_id TEXT NOT NULL,
 field TEXT NOT NULL,
 source_key TEXT,
 note_checksum TEXT NOT NULL,
 raw_text TEXT NOT NULL,
 original_actor TEXT,
 original_timestamp INTEGER,
 state TEXT NOT NULL CHECK(state IN ('superseded','pending_review')),
 evidence_id TEXT,
 source_session_id TEXT,
 source_checksum TEXT,
 construct TEXT,
 reason TEXT NOT NULL,
 classified_at TEXT NOT NULL,
 rolled_back_at TEXT
);`;

/** Reads only known note stores, including JSON snapshot maps. No arbitrary table/column input. */
export function inventoryFeedbackNotes(
  db: Database.Database,
  ownerId?: string,
): FeedbackNoteSource[] {
  const notes: FeedbackNoteSource[] = [];
  const add = (source: Omit<FeedbackNoteSource, 'sourceId'>) => {
    notes.push({
      ...source,
      sourceId: JSON.stringify([source.kind, source.parentId, source.field, source.key]),
    });
  };
  const sessions = db
    .prepare(
      `SELECT * FROM workout_sessions ${ownerId ? 'WHERE user_id = ?' : ''} ORDER BY user_id,id`,
    )
    .all(...(ownerId ? [ownerId] : [])) as Record<string, unknown>[];
  for (const row of sessions) {
    const base = {
      userId: String(row.user_id),
      kind: 'session' as const,
      parentId: String(row.id),
      actor: null,
      timestamp: typeof row.updated_at === 'number' ? row.updated_at : null,
    };
    for (const column of [
      'notes',
      'feedback',
      'exercise_programming_notes',
      'exercise_agent_notes',
    ]) {
      const value = row[column];
      if (typeof value !== 'string') continue;
      if (column === 'notes') {
        add({ ...base, field: 'notes', key: null, text: value });
        continue;
      }
      const parsed: unknown = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      for (const [key, text] of Object.entries(parsed)) {
        if (typeof text !== 'string' || (column === 'feedback' && key !== 'notes')) continue;
        const metadata =
          column === 'exercise_agent_notes' && typeof row.exercise_agent_notes_meta === 'string'
            ? (JSON.parse(row.exercise_agent_notes_meta) as Record<string, unknown>)
            : null;
        add({
          ...base,
          field: column,
          key,
          text,
          actor: metadata?.[key] === undefined ? null : JSON.stringify(metadata[key]),
        });
      }
    }
  }
  for (const [kind, query, fields] of [
    [
      'template',
      `SELECT e.*,t.user_id,t.id AS parent_id,t.updated_at AS source_time FROM template_exercises e JOIN workout_templates t ON t.id=e.template_id`,
      ['notes', 'programming_notes'],
    ],
    [
      'scheduled',
      `SELECT e.*,s.user_id,s.id AS parent_id,s.updated_at AS source_time FROM scheduled_workout_exercises e JOIN scheduled_workouts s ON s.id=e.scheduled_workout_id`,
      ['programming_notes', 'agent_notes'],
    ],
    [
      'exercise',
      `SELECT e.*,e.id AS parent_id,e.updated_at AS source_time FROM exercises e WHERE e.user_id IS NOT NULL`,
      ['coaching_notes', 'instructions'],
    ],
  ] as const) {
    // Queries are static above; all result ownership is checked before a note enters the inventory.
    for (const row of db.prepare(query).all() as Record<string, unknown>[]) {
      if (ownerId && row.user_id !== ownerId) continue;
      for (const field of fields)
        if (typeof row[field] === 'string') {
          add({
            userId: String(row.user_id),
            kind,
            parentId: String(row.parent_id),
            field,
            key: kind === 'exercise' ? null : String(row.id),
            text: row[field],
            actor: typeof row.agent_notes_meta === 'string' ? row.agent_notes_meta : null,
            timestamp: typeof row.source_time === 'number' ? row.source_time : null,
          });
        }
    }
  }
  return notes.sort(
    (a, b) => a.userId.localeCompare(b.userId) || a.sourceId.localeCompare(b.sourceId),
  );
}

/** A bounded phrase match queues review only. Supersession requires an exact causal evidence link. */
export function planFeedbackNoteRemediation(
  db: Database.Database,
  notes: FeedbackNoteSource[],
  links: FeedbackNoteLink[] = [],
  projectedSources: ReadonlyMap<string, string> = new Map(),
) {
  for (const link of links)
    if (
      !notes.some(
        (note) =>
          note.userId === link.userId &&
          note.sourceId === link.sourceId &&
          digest(note.text) === link.noteChecksum,
      )
    )
      throw new Error('Note link does not match an owned exact source revision.');
  return notes.map((note) => {
    const noteChecksum = digest(note.text);
    const candidates = links.filter(
      (link) =>
        link.userId === note.userId &&
        link.sourceId === note.sourceId &&
        link.noteChecksum === noteChecksum,
    );
    if (candidates.length > 1) throw new Error('Conflicting note source links require review.');
    const link = candidates[0];
    if (link) {
      const audit = db
        .prepare(
          'SELECT projected_payload FROM feedback_provenance_audit WHERE user_id = ? AND session_id = ? AND source_checksum = ?',
        )
        .get(note.userId, link.sessionId, link.sourceChecksum) as
        | { projected_payload: string }
        | undefined;
      const projectedPayload =
        audit?.projected_payload ??
        projectedSources.get(JSON.stringify([note.userId, link.sessionId, link.sourceChecksum]));
      if (!projectedPayload || !link.evidenceId.trim())
        throw new Error(
          'A confirmed note correction requires an owned source audit and evidence identifier.',
        );
      const projection = JSON.parse(projectedPayload) as {
        provenance: Record<string, { source: string }>;
      };
      if (
        !['legacy_unknown', 'legacy_derived'].includes(
          projection.provenance[link.construct]?.source,
        )
      )
        throw new Error('Linked feedback is not confirmed unsupported.');
      return {
        note,
        noteChecksum,
        link,
        state: 'superseded' as const,
        reason: 'Explicit causal link identifies an interpretation based on unsupported feedback.',
      };
    }
    const candidate =
      /(?:recovery|technique|form)[^\n]{0,80}(?:score|rating|[1-5]\s*\/\s*5)|(?:score|rating)[^\n]{0,80}(?:recovery|technique|form)/iu.test(
        note.text,
      );
    return {
      note,
      noteChecksum,
      link: undefined,
      state: candidate ? ('pending_review' as const) : null,
      reason: candidate
        ? 'Possible unsupported feedback interpretation; heuristic is not causal proof.'
        : 'Unrelated note preserved.',
    };
  });
}

export function applyFeedbackNoteRemediation(
  db: Database.Database,
  plans: ReturnType<typeof planFeedbackNoteRemediation>,
  classifiedAt: string,
  acknowledgement: string,
) {
  assertSyntheticFeedbackDatabase(db, acknowledgement);
  const counts = { examined: plans.length, confirmed: 0, pending: 0, unchanged: 0, preserved: 0 };
  db.transaction(() => {
    for (const plan of plans) {
      if (!plan.state) {
        counts.preserved++;
        continue;
      }
      const id = digest(
        JSON.stringify([
          plan.note.userId,
          plan.note.sourceId,
          plan.noteChecksum,
          plan.state,
          plan.link?.evidenceId ?? null,
        ]),
      );
      const inserted = db
        .prepare(
          `INSERT OR IGNORE INTO feedback_note_dispositions
        (id,user_id,kind,parent_id,source_id,field,source_key,note_checksum,raw_text,original_actor,original_timestamp,state,evidence_id,source_session_id,source_checksum,construct,reason,classified_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          plan.note.userId,
          plan.note.kind,
          plan.note.parentId,
          plan.note.sourceId,
          plan.note.field,
          plan.note.key,
          plan.noteChecksum,
          plan.note.text,
          plan.note.actor,
          plan.note.timestamp,
          plan.state,
          plan.link?.evidenceId ?? null,
          plan.link?.sessionId ?? null,
          plan.link?.sourceChecksum ?? null,
          plan.link?.construct ?? null,
          plan.reason,
          classifiedAt,
        );
      if (!inserted.changes) counts.unchanged++;
      else if (plan.state === 'superseded') counts.confirmed++;
      else counts.pending++;
    }
  }).immediate();
  return counts;
}
