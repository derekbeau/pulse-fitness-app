import { describe, expect, it } from 'vitest';

import {
  createWorkoutSessionInputSchema,
  saveWorkoutSessionAsTemplateInputSchema,
  sessionSetInputSchema,
  type CreateWorkoutSessionInput,
  type SaveWorkoutSessionAsTemplateInput,
  type UpdateWorkoutSessionInput,
  type UpdateWorkoutSessionTimeSegmentsInput,
  type WorkoutSession,
  timeSegmentsSchema,
  type WorkoutSessionFeedback,
  type WorkoutSessionListItem,
  updateWorkoutSessionTimeSegmentsInputSchema,
  workoutSessionStatusSchema,
  workoutSessionFeedbackSchema,
  workoutSessionListItemSchema,
  workoutSessionQueryParamsSchema,
  workoutSessionSchema,
  updateWorkoutSessionInputSchema,
} from './workout-sessions';

describe('workoutSessionFeedbackSchema', () => {
  it('normalizes optional notes and infers the feedback type', () => {
    const feedback: WorkoutSessionFeedback = workoutSessionFeedbackSchema.parse({
      energy: 4,
      recovery: 3,
      technique: 5,
      notes: ' Strong focus today. ',
      responses: [
        {
          id: 'session-rpe',
          label: 'Session RPE',
          type: 'scale',
          value: 8,
        },
        {
          id: 'energy-post-workout',
          label: 'Energy post workout',
          type: 'emoji',
          value: ' 🙂 ',
        },
        {
          id: 'pain-discomfort',
          label: 'Any pain or discomfort?',
          type: 'yes_no',
          value: true,
          notes: ' Mild right knee discomfort on split squats. ',
        },
      ],
    });

    expect(feedback).toEqual({
      energy: 4,
      recovery: 3,
      technique: 5,
      notes: 'Strong focus today.',
      responses: [
        {
          id: 'session-rpe',
          label: 'Session RPE',
          type: 'scale',
          value: 8,
        },
        {
          id: 'energy-post-workout',
          label: 'Energy post workout',
          type: 'emoji',
          value: '🙂',
        },
        {
          id: 'pain-discomfort',
          label: 'Any pain or discomfort?',
          type: 'yes_no',
          value: true,
          notes: 'Mild right knee discomfort on split squats.',
        },
      ],
    });
  });

  it('rejects null values for non-text response types', () => {
    expect(() =>
      workoutSessionFeedbackSchema.parse({
        energy: 4,
        recovery: 3,
        technique: 5,
        responses: [
          {
            id: 'session-rpe',
            label: 'Session RPE',
            type: 'scale',
            value: null,
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      workoutSessionFeedbackSchema.parse({
        energy: 4,
        recovery: 3,
        technique: 5,
        responses: [
          {
            id: 'pain-discomfort',
            label: 'Any pain or discomfort?',
            type: 'yes_no',
            value: null,
          },
        ],
      }),
    ).toThrow();
  });
});

describe('sessionSetInputSchema', () => {
  it('applies defaults for optional set fields', () => {
    expect(
      sessionSetInputSchema.parse({
        exerciseId: 'bench-press',
        setNumber: 1,
      }),
    ).toEqual({
      exerciseId: 'bench-press',
      setNumber: 1,
      weight: null,
      reps: null,
      completed: false,
      skipped: false,
      section: null,
      notes: null,
    });
  });

  it('rejects conflicting completion flags', () => {
    expect(() =>
      sessionSetInputSchema.parse({
        exerciseId: 'bench-press',
        setNumber: 1,
        completed: true,
        skipped: true,
      }),
    ).toThrow();
  });
});

describe('workoutSessionSchema', () => {
  it('parses a persisted workout session with nested sets', () => {
    const session: WorkoutSession = workoutSessionSchema.parse({
      id: 'session-1',
      userId: 'user-1',
      templateId: 'template-1',
      name: ' Upper Push ',
      date: '2026-03-12',
      status: 'completed',
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_003_600,
      duration: 60,
      timeSegments: [
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T11:00:00.000Z',
        },
      ],
      feedback: {
        energy: 4,
        recovery: 3,
        technique: 5,
        notes: ' Strong lockout ',
      },
      notes: ' Great session overall. ',
      sets: [
        {
          id: 'set-1',
          exerciseId: 'bench-press',
          setNumber: 1,
          weight: 185,
          reps: 8,
          completed: true,
          skipped: false,
          section: 'main',
          notes: ' Smooth bar path ',
          createdAt: 1_700_000_000_500,
        },
      ],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_004_000,
    });

    expect(session).toEqual({
      id: 'session-1',
      userId: 'user-1',
      templateId: 'template-1',
      name: 'Upper Push',
      date: '2026-03-12',
      status: 'completed',
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_003_600,
      duration: 60,
      timeSegments: [
        {
          start: '2026-03-12T10:00:00.000Z',
          end: '2026-03-12T11:00:00.000Z',
        },
      ],
      feedback: {
        energy: 4,
        recovery: 3,
        technique: 5,
        notes: 'Strong lockout',
      },
      notes: 'Great session overall.',
      sets: [
        {
          id: 'set-1',
          exerciseId: 'bench-press',
          setNumber: 1,
          weight: 185,
          reps: 8,
          completed: true,
          skipped: false,
          section: 'main',
          notes: 'Smooth bar path',
          createdAt: 1_700_000_000_500,
        },
      ],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_004_000,
    });
  });

  it('rejects inconsistent completion timing', () => {
    expect(() =>
      workoutSessionSchema.parse({
        id: 'session-1',
        userId: 'user-1',
        templateId: null,
        name: 'Conditioning',
        date: '2026-03-12',
        status: 'completed',
        startedAt: 10,
        completedAt: null,
        duration: null,
        timeSegments: [],
        feedback: null,
        notes: null,
        sets: [],
        createdAt: 1,
        updatedAt: 1,
      }),
    ).toThrow();
  });
});

describe('createWorkoutSessionInputSchema', () => {
  it('normalizes optional fields and infers the create input type', () => {
    const payload: CreateWorkoutSessionInput = createWorkoutSessionInputSchema.parse({
      templateId: ' template-1 ',
      name: ' Lower Body ',
      date: '2026-03-13',
      status: 'completed',
      startedAt: 2000,
      completedAt: 2600,
      duration: 45,
      timeSegments: [
        {
          start: '2026-03-13T10:00:00.000Z',
          end: '2026-03-13T10:45:00.000Z',
        },
      ],
      feedback: {
        energy: 5,
        recovery: 4,
        technique: 4,
        notes: ' Strong positions ',
      },
      notes: ' Hit depth consistently ',
      sets: [
        {
          exerciseId: 'high-bar-back-squat',
          setNumber: 1,
          reps: 5,
          weight: 275,
          completed: true,
          section: 'main',
          notes: ' Fast concentric ',
        },
      ],
    });

    expect(payload).toEqual({
      templateId: 'template-1',
      name: 'Lower Body',
      date: '2026-03-13',
      status: 'completed',
      startedAt: 2000,
      completedAt: 2600,
      duration: 45,
      timeSegments: [
        {
          start: '2026-03-13T10:00:00.000Z',
          end: '2026-03-13T10:45:00.000Z',
        },
      ],
      feedback: {
        energy: 5,
        recovery: 4,
        technique: 4,
        notes: 'Strong positions',
      },
      notes: 'Hit depth consistently',
      sets: [
        {
          exerciseId: 'high-bar-back-squat',
          setNumber: 1,
          reps: 5,
          weight: 275,
          completed: true,
          skipped: false,
          section: 'main',
          notes: 'Fast concentric',
        },
      ],
    });
  });

  it('rejects completed sessions without completedAt', () => {
    expect(() =>
      createWorkoutSessionInputSchema.parse({
        name: 'Upper Push',
        date: '2026-03-12',
        status: 'completed',
        startedAt: 10,
      }),
    ).toThrow();
  });

  it('defaults empty time segments', () => {
    expect(
      createWorkoutSessionInputSchema.parse({
        name: 'Upper Push',
        date: '2026-03-12',
        startedAt: 10,
      }).timeSegments,
    ).toEqual([]);
  });
});

describe('workoutSessionStatusSchema', () => {
  it('accepts paused and cancelled statuses', () => {
    expect(workoutSessionStatusSchema.parse('paused')).toBe('paused');
    expect(workoutSessionStatusSchema.parse('cancelled')).toBe('cancelled');
  });
});

describe('timeSegmentsSchema', () => {
  it('validates segment arrays', () => {
    expect(
      timeSegmentsSchema.parse([
        {
          start: '2026-03-12T10:00:00.000Z',
          end: null,
        },
      ]),
    ).toEqual([
      {
        start: '2026-03-12T10:00:00.000Z',
        end: null,
      },
    ]);
  });

  it('rejects invalid segment entries', () => {
    expect(() => timeSegmentsSchema.parse([{ start: 123, end: null }])).toThrow();
    expect(() => timeSegmentsSchema.parse([{ start: '2026-03-12T10:00:00.000Z' }])).toThrow();
  });
});

describe('updateWorkoutSessionTimeSegmentsInputSchema', () => {
  it('accepts chronologically ordered, non-overlapping segments', () => {
    const payload: UpdateWorkoutSessionTimeSegmentsInput =
      updateWorkoutSessionTimeSegmentsInputSchema.parse({
        timeSegments: [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:15:00.000Z',
          },
          {
            start: '2026-03-12T10:20:00.000Z',
            end: null,
          },
        ],
      });

    expect(payload.timeSegments).toHaveLength(2);
  });

  it('rejects overlapping or out-of-order segments', () => {
    expect(() =>
      updateWorkoutSessionTimeSegmentsInputSchema.parse({
        timeSegments: [
          {
            start: '2026-03-12T10:00:00.000Z',
            end: '2026-03-12T10:15:00.000Z',
          },
          {
            start: '2026-03-12T10:10:00.000Z',
            end: '2026-03-12T10:20:00.000Z',
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects segments with end earlier than start', () => {
    expect(() =>
      updateWorkoutSessionTimeSegmentsInputSchema.parse({
        timeSegments: [
          {
            start: '2026-03-12T10:15:00.000Z',
            end: '2026-03-12T10:00:00.000Z',
          },
        ],
      }),
    ).toThrow();
  });
});

describe('updateWorkoutSessionInputSchema', () => {
  it('allows nullable field clearing in partial updates', () => {
    const payload: UpdateWorkoutSessionInput = updateWorkoutSessionInputSchema.parse({
      templateId: null,
      feedback: null,
      notes: '   ',
      exerciseNotes: {
        'incline-dumbbell-press': ' Keep elbows tucked ',
        'seated-dumbbell-shoulder-press': '   ',
      },
    });

    expect(payload).toEqual({
      templateId: null,
      feedback: null,
      notes: null,
      exerciseNotes: {
        'incline-dumbbell-press': 'Keep elbows tucked',
        'seated-dumbbell-shoulder-press': null,
      },
    });
  });

  it('rejects empty updates', () => {
    expect(() => updateWorkoutSessionInputSchema.parse({})).toThrow();
  });
});

describe('saveWorkoutSessionAsTemplateInputSchema', () => {
  it('accepts an empty payload for default template metadata', () => {
    const payload: SaveWorkoutSessionAsTemplateInput =
      saveWorkoutSessionAsTemplateInputSchema.parse(undefined);

    expect(payload).toEqual({});
  });

  it('normalizes and trims provided metadata fields', () => {
    const payload: SaveWorkoutSessionAsTemplateInput =
      saveWorkoutSessionAsTemplateInputSchema.parse({
        name: ' Upper Push Snapshot ',
        description: '  Heavy pressing focus  ',
        tags: [' strength ', ' push '],
      });

    expect(payload).toEqual({
      name: 'Upper Push Snapshot',
      description: 'Heavy pressing focus',
      tags: ['strength', 'push'],
    });
  });
});

describe('workoutSessionListItemSchema', () => {
  it('parses nullable template metadata in list items', () => {
    const item: WorkoutSessionListItem = workoutSessionListItemSchema.parse({
      id: 'session-1',
      name: ' Conditioning ',
      date: '2026-03-12',
      status: 'in-progress',
      templateId: null,
      templateName: null,
      startedAt: 1_700_000_000_000,
      completedAt: null,
      duration: null,
      exerciseCount: 0,
      createdAt: 1_700_000_000_000,
    });

    expect(item.templateId).toBeNull();
    expect(item.templateName).toBeNull();
    expect(item.name).toBe('Conditioning');
  });
});

describe('workoutSessionQueryParamsSchema', () => {
  it('parses optional range and filter params', () => {
    expect(
      workoutSessionQueryParamsSchema.parse({
        from: '2026-03-10',
        to: '2026-03-12',
        status: 'completed',
        limit: '5',
      }),
    ).toEqual({
      from: '2026-03-10',
      to: '2026-03-12',
      status: ['completed'],
      limit: 5,
    });
    expect(workoutSessionQueryParamsSchema.parse({ status: 'in-progress', limit: 10 })).toEqual({
      status: ['in-progress'],
      limit: 10,
    });
    expect(
      workoutSessionQueryParamsSchema.parse({
        status: ['in-progress', 'paused'],
      }),
    ).toEqual({
      status: ['in-progress', 'paused'],
    });
  });

  it('rejects invalid ranges and limits', () => {
    expect(() =>
      workoutSessionQueryParamsSchema.parse({ from: '2026-03-12', to: '2026-03-10' }),
    ).toThrow();
    expect(() => workoutSessionQueryParamsSchema.parse({ limit: 0 })).toThrow();
    expect(() => workoutSessionQueryParamsSchema.parse({ limit: 99 })).toThrow();
  });
});
