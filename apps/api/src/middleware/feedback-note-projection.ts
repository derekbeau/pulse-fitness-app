import type { onSendHookHandler } from 'fastify';

type NoteDisposition = {
  id: string;
  field: string;
  source_key: string | null;
  raw_text: string;
  state: string;
  reason: string;
};
type JsonRecord = Record<string, unknown>;
const record = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Keep source text unchanged for pending review; suppress only confirmed interpretations.
 * Shared by API serialization and internal source readers before copying planning notes. */
export async function projectFeedbackNoteEntity<T>(
  kind: 'session' | 'template' | 'scheduled' | 'exercise',
  userId: string,
  entity: T,
  options: { planningCopy?: boolean } = {},
): Promise<T> {
  const { sqlite } = await import('../db/index.js');
  const data: unknown[] = [entity];
  for (const entity of data) {
    if (!record(entity) || typeof entity.id !== 'string') continue;
    const notes = sqlite
      .prepare(
        'SELECT id,field,source_key,raw_text,state,reason FROM feedback_note_dispositions WHERE user_id = ? AND kind = ? AND parent_id = ? AND rolled_back_at IS NULL ORDER BY classified_at,id',
      )
      .all(userId, kind, entity.id) as NoteDisposition[];
    const review: JsonRecord[] = [];
    const suppress = (target: JsonRecord, field: string, note: NoteDisposition) => {
      if (target[field] !== note.raw_text) return;
      if (note.state === 'pending_review') {
        if (options.planningCopy) {
          if (field === 'notes' && target === entity.feedback) delete target.notes;
          else target[field] = null;
        }
        review.push({
          id: note.id,
          state: note.state,
          reason: note.reason,
          field: note.field,
          sourceKey: note.source_key,
          actionable: false,
        });
        return;
      }
      if (field === 'notes' && target === entity.feedback) delete target.notes;
      else target[field] = null;
      review.push({ id: note.id, state: note.state, reason: note.reason });
    };
    for (const note of notes) {
      if (kind === 'session') {
        if (note.field === 'notes') suppress(entity, 'notes', note);
        else if (note.field === 'feedback' && record(entity.feedback))
          suppress(entity.feedback, 'notes', note);
        else if (Array.isArray(entity.exercises))
          for (const exercise of entity.exercises) {
            if (
              record(exercise) &&
              `${exercise.section}::${exercise.exerciseId}` === note.source_key
            ) {
              suppress(
                exercise,
                note.field === 'exercise_agent_notes' ? 'agentNotes' : 'programmingNotes',
                note,
              );
            }
          }
      } else if (kind === 'exercise') {
        suppress(entity, note.field === 'coaching_notes' ? 'coachingNotes' : 'instructions', note);
      } else if (kind === 'template' && Array.isArray(entity.sections)) {
        for (const section of entity.sections)
          if (record(section) && Array.isArray(section.exercises))
            for (const exercise of section.exercises) {
              if (record(exercise) && exercise.id === note.source_key)
                suppress(exercise, note.field === 'notes' ? 'notes' : 'programmingNotes', note);
            }
      } else if (kind === 'scheduled' && Array.isArray(entity.exercises)) {
        const source = sqlite
          .prepare(
            'SELECT exercise_id,section FROM scheduled_workout_exercises WHERE id = ? AND scheduled_workout_id = ?',
          )
          .get(note.source_key, entity.id) as { exercise_id: string; section: string } | undefined;
        if (source)
          for (const exercise of entity.exercises)
            if (
              record(exercise) &&
              exercise.exerciseId === source.exercise_id &&
              exercise.section === source.section
            ) {
              suppress(
                exercise,
                note.field === 'agent_notes' ? 'agentNotes' : 'programmingNotes',
                note,
              );
            }
      }
    }
    if (kind === 'session' && Array.isArray(entity.exercises)) {
      for (const exercise of entity.exercises) {
        if (
          !record(exercise) ||
          !record(exercise.exercise) ||
          typeof exercise.exerciseId !== 'string'
        )
          continue;
        const nested: JsonRecord = { ...exercise.exercise, id: exercise.exerciseId };
        await projectFeedbackNoteEntity('exercise', userId, nested, options);
        exercise.exercise.coachingNotes = nested.coachingNotes;
        exercise.exercise.instructions = nested.instructions;
        if (Array.isArray(nested.feedbackNoteReview))
          review.push(...nested.feedbackNoteReview.filter(record));
      }
    }
    if (review.length) entity.feedbackNoteReview = review;
  }
  return entity;
}

export const feedbackNoteProjection =
  (kind: 'session' | 'template' | 'scheduled' | 'exercise'): onSendHookHandler =>
  async (request, _reply, payload) => {
    if (!request.userId || typeof payload !== 'string' || request.url.includes('feedback-audit'))
      return payload;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return payload;
    }
    if (!record(parsed)) return payload;
    const data = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    for (const entity of data) await projectFeedbackNoteEntity(kind, request.userId, entity);
    return JSON.stringify(parsed);
  };

/** Explicit private audit surface; authentication is installed by each owning route plugin. */
export async function registerFeedbackNoteAudit(
  app: import('fastify').FastifyInstance,
  kind: 'template' | 'scheduled' | 'exercise',
) {
  const { z } = await import('zod');
  const { sqlite } = await import('../db/index.js');
  app.get<{ Params: { id: string }; Querystring: { offset?: number } }>(
    '/:id/feedback-audit',
    {
      schema: {
        params: z.object({ id: z.string().min(1) }),
        querystring: z.object({ offset: z.coerce.number().int().min(0).default(0) }),
        response: {
          200: z.object({
            data: z.object({
              items: z.array(
                z.object({
                  id: z.string(),
                  rawPayload: z.string(),
                  classification: z.string(),
                  receivedAt: z.number(),
                }),
              ),
              total: z.number(),
              hasMore: z.boolean(),
            }),
          }),
        },
        security: [{ bearerAuth: [] }, { agentToken: [] }],
        tags: [
          kind === 'template'
            ? 'workout-templates'
            : kind === 'scheduled'
              ? 'scheduled-workouts'
              : 'exercises',
        ],
        summary: 'Read owned original note remediation audit; non-actionable history',
      },
    },
    async (request) => {
      const parameters = [request.userId, kind, request.params.id];
      const total = (
        sqlite
          .prepare(
            'SELECT count(*) AS count FROM feedback_note_dispositions WHERE user_id = ? AND kind = ? AND parent_id = ?',
          )
          .get(...parameters) as { count: number }
      ).count;
      const rows = sqlite
        .prepare(
          'SELECT * FROM feedback_note_dispositions WHERE user_id = ? AND kind = ? AND parent_id = ? ORDER BY classified_at,id LIMIT 50 OFFSET ?',
        )
        .all(...parameters, request.query.offset ?? 0) as {
        id: string;
        reason: string;
        classified_at: string;
      }[];
      return {
        data: {
          items: rows.map((row) => ({
            id: row.id,
            rawPayload: JSON.stringify(row),
            classification: row.reason,
            receivedAt: Date.parse(row.classified_at),
          })),
          total,
          hasMore: (request.query.offset ?? 0) + rows.length < total,
        },
      };
    },
  );
}
