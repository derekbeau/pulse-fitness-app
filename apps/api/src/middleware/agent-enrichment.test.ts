import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

import { buildAgentEnrichment, buildDataResponse } from './agent-enrichment.js';

const createRequest = (authType: 'jwt' | 'agent-token') =>
  ({
    authType,
    userId: 'user-1',
  }) as FastifyRequest;

describe('buildAgentEnrichment', () => {
  it('does not attach enrichment for JWT requests', () => {
    const enrichment = buildAgentEnrichment(
      createRequest('jwt'),
      { id: 'entry-1' },
      {
        endpoint: 'weight.mutation',
      },
    );

    expect(enrichment).toBeUndefined();
  });

  it('builds meal hints for agent-authenticated meal responses', () => {
    const enrichment = buildAgentEnrichment(
      createRequest('agent-token'),
      {
        meal: {
          id: 'meal-1',
          name: 'Lunch',
        },
        items: [],
        macros: {
          calories: 600,
          protein: 45,
          carbs: 70,
          fat: 13,
        },
      },
      {
        endpoint: 'meal.create',
        mealDate: '2026-03-09',
        mealName: 'Lunch',
      },
    );

    expect(enrichment).toEqual({
      hints: [
        'Lunch adds 600 kcal, 45g protein, 70g carbs, and 13g fat.',
        'Use the day nutrition summary to judge what macros remain before the next meal.',
      ],
      suggestedActions: [
        'Log the next meal or snack when it happens.',
        "Review today's nutrition summary if you need remaining macro targets.",
      ],
      relatedState: {
        date: '2026-03-09',
        mealName: 'Lunch',
        itemCount: 0,
        mealMacros: {
          calories: 600,
          protein: 45,
          carbs: 70,
          fat: 13,
        },
      },
    });
  });

  it('treats protein as a nonfinal minimum in nutrition summary enrichment', () => {
    const enrichment = buildAgentEnrichment(
      createRequest('agent-token'),
      {
        date: '2026-03-09',
        meals: 2,
        actual: { calories: 1_800, protein: 150, carbs: 180, fat: 60 },
        target: { calories: 2_200, protein: 180, carbs: 250, fat: 70 },
        proteinFloor: {
          actualProteinGrams: 150,
          proteinFloorGrams: 180,
          remainingToFloorGrams: 30,
          amountAboveFloorGrams: 0,
          state: 'below_floor',
          isFinal: false,
        },
      },
      { endpoint: 'nutrition.summary', date: '2026-03-09' },
    );

    expect(enrichment?.hints).toContain(
      '30g to the protein minimum. This is based on food logged so far. Remaining plan amounts are 400 kcal, 70g carbs, and 10g fat.',
    );
    expect(enrichment?.suggestedActions).toContain(
      'Use the protein minimum and remaining plan macros to guide your next meal choice.',
    );
    expect(enrichment?.relatedState).toMatchObject({
      remaining: { protein: 30 },
      proteinFloor: { state: 'below_floor', remainingToFloorGrams: 30 },
    });
    expect(JSON.stringify(enrichment)).not.toMatch(/over target|negative protein|-30g/i);
  });

  it('calls out an unavailable protein minimum when no accepted target exists', () => {
    const enrichment = buildAgentEnrichment(
      createRequest('agent-token'),
      {
        date: '2026-03-09',
        meals: 1,
        actual: { calories: 600, protein: 45, carbs: 70, fat: 13 },
        target: null,
        proteinFloor: {
          actualProteinGrams: 45,
          proteinFloorGrams: null,
          remainingToFloorGrams: null,
          amountAboveFloorGrams: null,
          state: 'unavailable',
          isFinal: true,
        },
      },
      { endpoint: 'nutrition.summary', date: '2026-03-09' },
    );

    expect(enrichment?.hints).toContain(
      'Protein minimum is unavailable for this date. No calorie or macro plan is configured for this date.',
    );
    expect(enrichment?.relatedState).not.toHaveProperty('remaining');
  });

  it('builds workout progress hints for session mutations', () => {
    const enrichment = buildAgentEnrichment(
      createRequest('agent-token'),
      {
        id: 'session-1',
        userId: 'user-1',
        templateId: null,
        name: 'Upper Push',
        date: '2026-03-12',
        status: 'in-progress',
        startedAt: 1,
        completedAt: null,
        duration: null,
        timeSegments: [],
        feedback: null,
        notes: null,
        exercises: [
          {
            exerciseId: 'bench',
            exerciseName: 'Bench Press',
            trackingType: 'weight_reps',
            orderIndex: 0,
            section: 'main',
            sets: [],
          },
        ],
        sets: [
          {
            id: 'set-1',
            exerciseId: 'bench',
            orderIndex: 0,
            setNumber: 1,
            weight: 185,
            reps: 8,
            completed: true,
            skipped: false,
            section: 'main',
            notes: null,
            createdAt: 1,
          },
          {
            id: 'set-2',
            exerciseId: 'bench',
            orderIndex: 0,
            setNumber: 2,
            weight: null,
            reps: null,
            completed: false,
            skipped: false,
            section: 'main',
            notes: null,
            createdAt: 2,
          },
        ],
        createdAt: 1,
        updatedAt: 2,
      },
      {
        endpoint: 'workout-session.mutation',
        action: 'update',
      },
    );

    expect(enrichment).toEqual({
      hints: [
        'Session progress is 1/2 completed sets across 1 exercises.',
        '1 exercise still has unfinished work.',
      ],
      suggestedActions: [
        'Log set 2 for Bench Press.',
        'Pause or complete the session when the workout ends.',
      ],
      relatedState: {
        action: 'update',
        status: 'in-progress',
        totalSets: 2,
        completedSets: 1,
        remainingSets: 1,
        remainingExercises: 1,
        nextSet: {
          exerciseId: 'bench',
          exerciseName: 'Bench Press',
          setNumber: 2,
        },
      },
    });
  });
});

describe('buildDataResponse', () => {
  it('includes the agent field only for agent-token requests', () => {
    expect(
      buildDataResponse(createRequest('jwt'), { id: 'entry-1' }, { endpoint: 'weight.mutation' }),
    ).toEqual({
      data: { id: 'entry-1' },
    });

    expect(
      buildDataResponse(
        createRequest('agent-token'),
        {
          id: 'entry-1',
          date: '2026-03-07',
          weight: 181.5,
          unit: 'lbs',
          notes: null,
          createdAt: 1,
          updatedAt: 2,
        },
        {
          endpoint: 'weight.mutation',
          previousEntry: {
            id: 'entry-0',
            date: '2026-03-06',
            weight: 182,
            unit: 'lbs',
            notes: null,
            createdAt: 0,
            updatedAt: 0,
          },
        },
      ),
    ).toEqual({
      data: {
        id: 'entry-1',
        date: '2026-03-07',
        weight: 181.5,
        unit: 'lbs',
        notes: null,
        createdAt: 1,
        updatedAt: 2,
      },
      agent: {
        hints: [
          'Weight is down by 0.5 lbs compared with the prior saved reading.',
          'Consistent check-ins under similar conditions make the trend easier to interpret.',
        ],
        suggestedActions: [
          'Keep a steady weigh-in cadence, ideally daily or several times per week.',
        ],
        relatedState: {
          date: '2026-03-07',
          weight: 181.5,
          previousWeight: 182,
          unit: 'lbs',
          trendDirection: 'down',
          delta: -0.5,
        },
      },
    });
  });

  it.each([
    ['lbs', 181.5, 182, 'Weight is down by 0.5 lbs compared with the prior saved reading.'],
    ['kg', 81.5, 80, 'Weight is up by 1.5 kg compared with the prior saved reading.'],
  ] as const)('keeps %s explicit in weight mutation enrichment', (unit, weight, previous, hint) => {
    const response = buildDataResponse(
      createRequest('agent-token'),
      {
        id: 'entry-1',
        date: '2026-03-07',
        weight,
        unit,
        notes: null,
        createdAt: 1,
        updatedAt: 2,
      },
      {
        endpoint: 'weight.mutation',
        previousEntry: {
          id: 'entry-0',
          date: '2026-03-06',
          weight: previous,
          unit,
          notes: null,
          createdAt: 0,
          updatedAt: 0,
        },
      },
    );

    expect(response.agent?.hints?.[0]).toBe(hint);
    expect(response.agent?.relatedState).toEqual(
      expect.objectContaining({ unit, weight, previousWeight: previous }),
    );
  });
});
