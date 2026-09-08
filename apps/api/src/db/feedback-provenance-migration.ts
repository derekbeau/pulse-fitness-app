import {
  inventoryFeedbackNotes,
  planFeedbackNoteRemediation,
  applyFeedbackNoteRemediation,
  type FeedbackNoteLink,
} from './feedback-note-remediation.js';
import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import type Database from 'better-sqlite3';
import {
  classifyNativeFeedback,
  provenanceSafeFeedbackSchema,
  nativeFeedbackResponseSchema,
  actionableFeedbackRating,
  type FeedbackActor,
  type FeedbackConstruct,
} from '@pulse/shared';

const VERSION = 2;
const checksum = (value: string) => createHash('sha256').update(value).digest('hex');
const tableExists = (db: Database.Database, table: string) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));

export const FEEDBACK_AUDIT_DDL = `CREATE TABLE feedback_provenance_audit (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  source_checksum TEXT NOT NULL,
  source_version INTEGER NOT NULL,
  raw_payload TEXT NOT NULL,
  projected_payload TEXT NOT NULL,
  projected_checksum TEXT NOT NULL,
  classified_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY (user_id, session_id, source_checksum)
);`;

type SessionSource = { id: string; user_id: string; feedback: string | null };
type Audit = {
  user_id: string;
  session_id: string;
  source_checksum: string;
  source_version: number;
  raw_payload: string;
  projected_payload: string;
  projected_checksum: string;
  classified_at: string;
  reason: string;
};
export type FeedbackMigrationCounts = {
  scanned: number;
  migrated: number;
  preserved: number;
  quarantined: number;
  skipped: number;
  unchangedOnResume: number;
  classifiedByReason: Record<string, number>;
};
const emptyCounts = (): FeedbackMigrationCounts => ({
  scanned: 0,
  migrated: 0,
  preserved: 0,
  quarantined: 0,
  skipped: 0,
  unchangedOnResume: 0,
  classifiedByReason: {},
});

/** Fixture acknowledgement is deliberately unsuitable as a production migration switch.
 * The runner must receive an already-open database; it never imports the default application DB.
 */
export function assertSyntheticFeedbackDatabase(db: Database.Database, acknowledgement: string) {
  if (acknowledgement !== 'I_ACKNOWLEDGE_SYNTHETIC_FIXTURE_ONLY')
    throw new Error('Synthetic fixture acknowledgement required.');
  if (db.name !== ':memory:') {
    const path = resolve(db.name);
    const stat = lstatSync(path);
    const fixtureRoot = realpathSync(tmpdir()) + sep;
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      realpathSync(path) !== path ||
      !path.startsWith(fixtureRoot) ||
      !basename(dirname(path)).startsWith('pulse-feedback-synthetic-') ||
      basename(path) !== 'fixture.db'
    ) {
      throw new Error(
        'Only a non-linked temporary pulse-feedback-synthetic-*/fixture.db is permitted.',
      );
    }
  }
  if (
    !tableExists(db, 'pulse_synthetic_fixture') ||
    !db
      .prepare('SELECT 1 FROM pulse_synthetic_fixture WHERE purpose = ? AND version = 1')
      .get('feedback-provenance-149')
  ) {
    throw new Error('Synthetic fixture manifest is missing or incompatible.');
  }
}

export function preflightFeedbackMigration(db: Database.Database) {
  for (const [table, required] of [
    [
      'workout_sessions',
      [
        'id',
        'user_id',
        'feedback',
        'notes',
        'exercise_programming_notes',
        'exercise_agent_notes',
        'exercise_agent_notes_meta',
      ],
    ],
    ['template_exercises', ['id', 'template_id', 'notes', 'programming_notes']],
    [
      'scheduled_workout_exercises',
      ['id', 'scheduled_workout_id', 'programming_notes', 'agent_notes', 'agent_notes_meta'],
    ],
    ['exercises', ['id', 'user_id', 'coaching_notes', 'instructions']],
    ['users', ['id']],
    [
      'feedback_migration_ledger',
      [
        'user_id',
        'session_id',
        'source_checksum',
        'projected_checksum',
        'source_version',
        'reason',
        'source_evidence',
        'classified_at',
        'rolled_back_at',
      ],
    ],
    [
      'feedback_note_dispositions',
      ['user_id', 'parent_id', 'source_id', 'raw_text', 'rolled_back_at'],
    ],
    [
      'feedback_provenance_audit',
      [
        'user_id',
        'session_id',
        'source_checksum',
        'source_version',
        'raw_payload',
        'projected_payload',
        'projected_checksum',
        'classified_at',
        'reason',
      ],
    ],
  ] as const) {
    if (!tableExists(db, table)) throw new Error(`Missing required schema table: ${table}`);
    const columns = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
        (row) => row.name,
      ),
    );
    if (required.some((column) => !columns.has(column)))
      throw new Error(`Incompatible schema columns: ${table}`);
  }
  if ((db.pragma('foreign_key_check') as unknown[]).length)
    throw new Error('Foreign key preflight failed.');
}

/** Evidence must be supplied by an explicit reviewed source artifact, never reconstructed
 * from summary values. Binding to owner, stable record and raw checksum prevents reuse. */
export type HistoricalFeedbackProof = {
  userId: string;
  sessionId: string;
  sourceChecksum: string;
  evidenceId: string;
  actor?: FeedbackActor;
  generated?: {
    construct: FeedbackConstruct;
    sourceResponseId: string;
    generatorVersion: 'pulse-pre-149-pain-recovery' | 'pulse-pre-149-rpe-technique';
  }[];
};

function projectLegacy(raw: string, classifiedAt: string, proof?: HistoricalFeedbackProof) {
  const input: unknown = JSON.parse(raw);
  const canonical = provenanceSafeFeedbackSchema.safeParse(input);
  if (canonical.success) {
    for (const construct of ['energy', 'recovery', 'technique'] as const) {
      if (
        canonical.data[construct] !== null &&
        actionableFeedbackRating(canonical.data, construct) === null
      )
        return {
          payload: JSON.stringify(
            classifyNativeFeedback(canonical.data, { legacy: true, classifiedAt }),
          ),
          reason: 'canonical_untrusted_rating',
          quarantined: true,
        };
    }
    return { payload: raw, reason: 'canonical_preserved', quarantined: false };
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Malformed feedback source.');
  const object = input as Record<string, unknown>;
  if ('schemaVersion' in object)
    throw new Error('Unsupported or malformed feedback schema version.');
  const responses = Array.isArray(object.responses)
    ? object.responses.map((response) => nativeFeedbackResponseSchema.parse(response))
    : [];
  if (object.responses !== undefined && !Array.isArray(object.responses))
    throw new Error('Malformed feedback responses.');
  if (object.notes !== undefined && typeof object.notes !== 'string')
    throw new Error('Malformed feedback notes.');
  const payload = classifyNativeFeedback(
    { responses, ...(typeof object.notes === 'string' ? { notes: object.notes } : {}) },
    { classifiedAt, legacy: true, actor: proof?.actor },
  );
  for (const generated of proof?.generated ?? []) {
    const source = responses.filter((response) => response.id === generated.sourceResponseId);
    const validSource =
      source.length === 1 &&
      ((generated.generatorVersion === 'pulse-pre-149-pain-recovery' &&
        generated.construct === 'recovery' &&
        source[0].id === 'pain-discomfort' &&
        source[0].type === 'yes_no' &&
        typeof source[0].value === 'boolean') ||
        (generated.generatorVersion === 'pulse-pre-149-rpe-technique' &&
          generated.construct === 'technique' &&
          source[0].id === 'session-rpe' &&
          (source[0].type === 'scale' || source[0].type === 'slider') &&
          typeof source[0].value === 'number'));
    if (!validSource) throw new Error('Historical generator proof lacks its exact native source.');
    // An explicit answer is never erased merely because a summary matches a formula.
    if (responses.some((response) => response.construct === generated.construct)) continue;
    payload.provenance[generated.construct] = {
      ...payload.provenance[generated.construct],
      source: 'legacy_derived',
      sourceResponseId: source[0].id,
      sourceRevisionId: source[0].revisionId ?? null,
      reason: `Reviewed source artifact ${proof?.evidenceId}; generator ${generated.generatorVersion}.`,
    };
  }
  return {
    payload: JSON.stringify(payload),
    reason: Object.values(payload.provenance).some((value) => value.source === 'legacy_derived')
      ? 'legacy_derived_source_proven'
      : proof?.actor
        ? 'legacy_explicit_actor_proven'
        : 'legacy_unknown_actor_or_source',
    quarantined: true,
  };
}

export function runFeedbackMigration(
  db: Database.Database,
  options: {
    mode: 'dry-run' | 'apply';
    ownerId?: string;
    classifiedAt: string;
    acknowledgement: string;
    batchSize?: number;
    noteLinks?: FeedbackNoteLink[];
    sourceProofs?: HistoricalFeedbackProof[];
    failBeforeBatchCommit?: (batch: number) => void;
  },
) {
  assertSyntheticFeedbackDatabase(db, options.acknowledgement);
  preflightFeedbackMigration(db);
  if (!Number.isFinite(Date.parse(options.classifiedAt)))
    throw new Error('Valid classification timestamp required.');
  const batchSize = options.batchSize ?? 50;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500)
    throw new Error('Batch size must be 1 through 500.');
  const sources = db
    .prepare(
      `SELECT id, user_id, feedback FROM workout_sessions ${options.ownerId === undefined ? '' : 'WHERE user_id = ?'} ORDER BY user_id, id`,
    )
    .all(...(options.ownerId === undefined ? [] : [options.ownerId])) as SessionSource[];
  const proofs = new Map<string, HistoricalFeedbackProof>();
  for (const proof of options.sourceProofs ?? []) {
    const source = sources.find(
      (row) => row.id === proof.sessionId && row.user_id === proof.userId,
    );
    const key = JSON.stringify([proof.userId, proof.sessionId]);
    const original =
      source &&
      (db
        .prepare(
          'SELECT source_checksum FROM feedback_provenance_audit WHERE user_id = ? AND session_id = ?',
        )
        .get(proof.userId, proof.sessionId) as { source_checksum: string } | undefined);
    if (
      !source?.feedback ||
      (checksum(source.feedback) !== proof.sourceChecksum &&
        original?.source_checksum !== proof.sourceChecksum) ||
      !proof.evidenceId.trim() ||
      proofs.has(key) ||
      (proof.actor && !proof.actor.id.trim())
    )
      throw new Error(
        'Historical proof must uniquely match an owned original source checksum and evidence artifact.',
      );
    proofs.set(key, proof);
  }
  const global = emptyCounts();
  const owners: Record<string, FeedbackMigrationCounts> = Object.create(null);
  const plans = sources.map((source) => {
    const ledger = db
      .prepare('SELECT * FROM feedback_migration_ledger WHERE user_id = ? AND session_id = ?')
      .get(source.user_id, source.id) as
      | {
          source_checksum: string;
          projected_checksum: string;
          source_version: number;
          rolled_back_at: string | null;
        }
      | undefined;
    if (ledger) {
      if (ledger.rolled_back_at)
        throw new Error(
          'Fixture was rolled back; restore its preserved original copy before a new rehearsal.',
        );
      if (
        ledger.source_version !== VERSION ||
        ledger.projected_checksum !== checksum(JSON.stringify(source.feedback))
      )
        throw new Error(
          `Source checksum/version conflict for session ${source.id}; review required.`,
        );
      // Audited migrated payloads still undergo the stronger raw/projection verification below.
      if (
        !db
          .prepare('SELECT 1 FROM feedback_provenance_audit WHERE user_id = ? AND session_id = ?')
          .get(source.user_id, source.id)
      ) {
        if (ledger.source_checksum !== checksum(JSON.stringify(source.feedback)))
          throw new Error(
            `Source checksum/version conflict for session ${source.id}; review required.`,
          );
        return {
          source,
          reason: source.feedback === null ? 'no_feedback' : 'verified_resume',
          action: source.feedback === null ? ('skip' as const) : ('unchanged' as const),
        };
      }
    }

    if (source.feedback === null) return { source, reason: 'no_feedback', action: 'skip' as const };
    const audits = db
      .prepare('SELECT * FROM feedback_provenance_audit WHERE user_id = ? AND session_id = ?')
      .all(source.user_id, source.id) as Audit[];
    const sourceHash = checksum(source.feedback);
    if (audits.length) {
      const audit = audits.find((row) => row.projected_checksum === sourceHash);
      if (
        !audit ||
        audit.source_version !== VERSION ||
        (ledger && ledger.source_checksum !== checksum(JSON.stringify(audit.raw_payload))) ||
        checksum(audit.raw_payload) !== audit.source_checksum ||
        checksum(audit.projected_payload) !== audit.projected_checksum ||
        audit.projected_payload !== source.feedback
      ) {
        throw new Error(
          `Source checksum/version conflict for session ${source.id}; review required.`,
        );
      }
      return { source, reason: 'verified_resume', action: 'unchanged' as const };
    }
    const projection = projectLegacy(
      source.feedback,
      options.classifiedAt,
      proofs.get(JSON.stringify([source.user_id, source.id])),
    );
    return {
      source,
      reason: projection.reason,
      action: projection.quarantined ? ('migrate' as const) : ('preserve' as const),
      projection,
      sourceHash,
    };
  });
  const increment = (counts: FeedbackMigrationCounts, plan: (typeof plans)[number]) => {
    counts.scanned++;
    counts.classifiedByReason[plan.reason] = (counts.classifiedByReason[plan.reason] ?? 0) + 1;
    if (plan.action === 'skip') counts.skipped++;
    else if (plan.action === 'unchanged') counts.unchangedOnResume++;
    else if (plan.action === 'preserve') counts.preserved++;
    else {
      counts.migrated++;
      counts.quarantined++;
    }
  };
  for (const plan of plans) {
    increment(global, plan);
    owners[plan.source.user_id] ??= emptyCounts();
    increment(owners[plan.source.user_id], plan);
  }
  const projectedSources = new Map<string, string>();
  for (const plan of plans)
    if ('projection' in plan && plan.projection && plan.sourceHash)
      projectedSources.set(
        JSON.stringify([plan.source.user_id, plan.source.id, plan.sourceHash]),
        plan.projection.payload,
      );
  const notePlans = planFeedbackNoteRemediation(
    db,
    inventoryFeedbackNotes(db, options.ownerId),
    options.noteLinks,
    projectedSources,
  );
  const noteCounts = {
    examined: notePlans.length,
    confirmed: notePlans.filter((plan) => plan.state === 'superseded').length,
    pending: notePlans.filter((plan) => plan.state === 'pending_review').length,
    preserved: notePlans.filter((plan) => plan.state === null).length,
  };
  const notesByOwner: Record<string, typeof noteCounts> = Object.create(null);
  for (const plan of notePlans) {
    notesByOwner[plan.note.userId] ??= { examined: 0, confirmed: 0, pending: 0, preserved: 0 };
    const counts = notesByOwner[plan.note.userId];
    counts.examined++;
    if (plan.state === 'superseded') counts.confirmed++;
    else if (plan.state === 'pending_review') counts.pending++;
    else counts.preserved++;
  }
  const noteWrites = { examined: 0, confirmed: 0, pending: 0, unchanged: 0, preserved: 0 };
  const processedNotes = new Set<string>();
  const writeNotes = (selected: typeof notePlans) => {
    const counts = applyFeedbackNoteRemediation(
      db,
      selected,
      options.classifiedAt,
      options.acknowledgement,
    );
    for (const key of ['examined', 'confirmed', 'pending', 'unchanged', 'preserved'] as const)
      noteWrites[key] += counts[key];
    for (const plan of selected) processedNotes.add(plan.note.sourceId);
  };
  if (options.mode === 'apply') {
    for (let offset = 0; offset < plans.length; offset += batchSize) {
      db.transaction(() => {
        for (const plan of plans.slice(offset, offset + batchSize)) {
          db.prepare(
            `INSERT OR IGNORE INTO feedback_migration_ledger
            (user_id,session_id,source_checksum,projected_checksum,source_version,reason,source_evidence,classified_at)
            VALUES(?,?,?,?,?,?,?,?)`,
          ).run(
            plan.source.user_id,
            plan.source.id,
            checksum(JSON.stringify(plan.source.feedback)),
            checksum(
              JSON.stringify(
                'projection' in plan && plan.projection
                  ? plan.projection.payload
                  : plan.source.feedback,
              ),
            ),
            VERSION,
            plan.reason,
            JSON.stringify(
              proofs.get(JSON.stringify([plan.source.user_id, plan.source.id])) ?? null,
            ),
            options.classifiedAt,
          );
          if (plan.action !== 'migrate' || !plan.projection || !plan.sourceHash) continue;
          const { source, projection, sourceHash } = plan;
          const result = db
            .prepare(
              'UPDATE workout_sessions SET feedback = ? WHERE id = ? AND user_id = ? AND feedback = ?',
            )
            .run(projection.payload, source.id, source.user_id, source.feedback);
          if (result.changes !== 1) throw new Error('Concurrent source change; batch aborted.');
          db.prepare(
            `INSERT INTO feedback_provenance_audit
            (user_id,session_id,source_checksum,source_version,raw_payload,projected_payload,projected_checksum,classified_at,reason)
            VALUES (?,?,?,?,?,?,?,?,?)`,
          ).run(
            source.user_id,
            source.id,
            sourceHash,
            VERSION,
            source.feedback,
            projection.payload,
            checksum(projection.payload),
            options.classifiedAt,
            projection.reason,
          );
        }
        const batchSources = plans.slice(offset, offset + batchSize);
        writeNotes(
          notePlans.filter((plan) =>
            batchSources.some(
              ({ source }) =>
                source.user_id === plan.note.userId &&
                source.id === (plan.link?.sessionId ?? plan.note.parentId),
            ),
          ),
        );
        options.failBeforeBatchCommit?.(offset / batchSize);
      }).immediate();
    }
  }
  if (options.mode === 'apply') {
    const remaining = notePlans.filter((plan) => !processedNotes.has(plan.note.sourceId));
    for (let offset = 0; offset < remaining.length; offset += batchSize)
      writeNotes(remaining.slice(offset, offset + batchSize));
  }
  return { global, owners, noteCounts, notesByOwner, noteWrites };
}

/** Local rollback restores exact originals only while projections still match the audited version.
 * Newer edits are a conflict, never silently overwritten. All restorations are atomic.
 */
export function rollbackFeedbackMigration(db: Database.Database, acknowledgement: string) {
  assertSyntheticFeedbackDatabase(db, acknowledgement);
  preflightFeedbackMigration(db);
  return db
    .transaction(() => {
      const audits = db
        .prepare('SELECT * FROM feedback_provenance_audit ORDER BY user_id,session_id')
        .all() as Audit[];
      for (const audit of audits) {
        if (
          checksum(audit.raw_payload) !== audit.source_checksum ||
          checksum(audit.projected_payload) !== audit.projected_checksum
        )
          throw new Error('Corrupt rollback audit.');
        const result = db
          .prepare(
            'UPDATE workout_sessions SET feedback = ? WHERE id = ? AND user_id = ? AND feedback = ?',
          )
          .run(audit.raw_payload, audit.session_id, audit.user_id, audit.projected_payload);
        if (result.changes !== 1) throw new Error('Rollback conflicts with a later edit.');
      }
      db.prepare(
        'UPDATE feedback_migration_ledger SET rolled_back_at = ? WHERE rolled_back_at IS NULL',
      ).run(new Date().toISOString());
      // Audit history deliberately remains, including exact originals and projected versions.
      db.prepare(
        'UPDATE feedback_note_dispositions SET rolled_back_at = ? WHERE rolled_back_at IS NULL',
      ).run(new Date().toISOString());
      return { restored: audits.length };
    })
    .immediate();
}
