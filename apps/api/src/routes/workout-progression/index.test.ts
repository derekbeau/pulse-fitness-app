import type {
  WorkoutMuscleAnalytics,
  WorkoutProgressionAction,
  WorkoutProgressionConfiguration,
  WorkoutProgressionRecommendation,
} from '@pulse/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../../index.js';
import { findAgentTokenByHash, updateAgentTokenLastUsedAt } from '../../middleware/store.js';
import { getWorkoutMuscleAnalytics } from './muscle-store.js';
import {
  applyWorkoutProgressionAction,
  configureWorkoutProgression,
  getWorkoutProgressionRecommendation,
  previewWorkoutProgression,
  WorkoutProgressionStaleError,
} from './store.js';

vi.mock('./store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./store.js')>();
  return {
    ...actual,
    applyWorkoutProgressionAction: vi.fn(),
    configureWorkoutProgression: vi.fn(),
    getWorkoutProgressionRecommendation: vi.fn(),
    previewWorkoutProgression: vi.fn(),
  };
});
vi.mock('./muscle-store.js', () => ({ getWorkoutMuscleAnalytics: vi.fn() }));
vi.mock('../../middleware/store.js', () => ({
  findAgentTokenByHash: vi.fn(),
  findUserAuthById: vi.fn(),
  updateAgentTokenLastUsedAt: vi.fn(),
}));

const target = {
  distance: null,
  reps: null,
  repsMax: 10,
  repsMin: 8,
  seconds: null,
  setNumber: 1,
  setId: 'scheduled-set-1',
  weight: 25,
  weightMax: null,
  weightMin: null,
  zone: null,
};

const recommendation: WorkoutProgressionRecommendation = {
  confidence: 'supported',
  decision: 'increase',
  effectiveDate: '2026-08-24',
  evidence: {
    exerciseId: 'exercise-1',
    exerciseName: 'Incline press',
    performance: [
      {
        completed: true,
        distance: null,
        reps: 10,
        rpe: 8,
        seconds: null,
        setId: 'source-set-1',
        setNumber: 1,
        skipped: false,
        sourceScheduledSetId: 'scheduled-set-1',
        weight: 20,
        zone: null,
        prescribed: { ...target, setId: 'source-set-1', weight: 20 },
      },
    ],
    policy: {
      allowReduction: false,
      contextRequired: false,
      distanceStep: null,
      effortCeiling: 8,
      family: 'double_progression',
      loadIncrement: 5,
      loadIncreasePercent: null,
      lowEffortThreshold: 7,
      repRangeMax: 10,
      repRangeMin: 8,
      secondsStep: null,
      version: 1,
      zoneCeiling: null,
    },
    priorTargets: [{ ...target, weight: 20 }],
    policySource: {
      actorId: 'user-1',
      actorLabel: 'Pulse user',
      actorType: 'user',
      configurationId: 'configuration-1',
      configuredAt: 400,
      revision: 1,
      type: 'programming_config',
    },
    context: { availability: 'available', facts: [] },
    priority: true,
    scheduledWorkoutDate: '2026-08-24',
    scheduledWorkoutExerciseId: 'scheduled-exercise-1',
    scheduledWorkoutId: 'scheduled-1',
    sourceSessionDate: '2026-08-20',
    sourceSessionId: 'session-1',
    trackingType: 'weight_reps',
  },
  facts: ['Every required set reached 10 reps.'],
  generatedAt: 500,
  id: 'recommendation-1',
  reasonCodes: ['ALL_SETS_AT_RANGE_TOP', 'ROUNDED_TO_INCREMENT'],
  recommendedTargets: [target],
  sourceFingerprint: 'a'.repeat(64),
  staleAt: null,
  state: 'current',
  userId: 'user-1',
};

const action: WorkoutProgressionAction = {
  action: 'accept',
  actorId: 'agent-1',
  actorType: 'agent',
  appliedTargets: [target],
  createdAt: 600,
  id: 'action-1',
  idempotencyKey: 'accept-key-1',
  reason: null,
  recommendationId: 'recommendation-1',
  sequence: 1,
};

const configuration: WorkoutProgressionConfiguration = {
  actorId: 'agent-1',
  actorLabel: 'Coach agent',
  actorType: 'agent',
  contextAvailability: 'available',
  contextFacts: [],
  id: 'configuration-1',
  policy: recommendation.evidence.policy,
  priority: true,
  revision: 1,
  scheduledWorkoutExerciseId: 'scheduled-exercise-1',
  scheduledWorkoutId: 'scheduled-1',
  updatedAt: 400,
  userId: 'user-1',
};

const muscles: WorkoutMuscleAnalytics = {
  contributionVersion: 1,
  endDate: '2026-08-23',
  qualifyingSetPolicyVersion: 1,
  range: '7d',
  sourceCount: 0,
  rows: [],
  series: [],
  sources: [],
  sourcesTruncated: false,
  startDate: '2026-08-17',
  timeZone: 'America/Detroit',
  weightUnit: 'lbs',
};

beforeEach(() => {
  vi.mocked(applyWorkoutProgressionAction).mockReset();
  vi.mocked(configureWorkoutProgression).mockReset();
  vi.mocked(getWorkoutMuscleAnalytics).mockReset();
  vi.mocked(getWorkoutProgressionRecommendation).mockReset();
  vi.mocked(previewWorkoutProgression).mockReset();
  vi.mocked(findAgentTokenByHash).mockReset();
  vi.mocked(updateAgentTokenLastUsedAt).mockReset();
  vi.mocked(findAgentTokenByHash).mockResolvedValue({
    id: 'agent-1',
    name: 'Coach agent',
    userId: 'user-1',
  });
});

async function withAuth() {
  const app = buildServer();
  await app.ready();
  return {
    app,
    jwt: app.jwt.sign({ iss: 'pulse-api', sub: 'user-1', type: 'session' }, { expiresIn: '7d' }),
  };
}

describe('workout progression routes', () => {
  it('returns the same strict recommendation and muscle facts to JWT and AgentToken callers', async () => {
    vi.mocked(previewWorkoutProgression).mockResolvedValue([recommendation]);
    vi.mocked(getWorkoutProgressionRecommendation).mockResolvedValue(recommendation);
    vi.mocked(getWorkoutMuscleAnalytics).mockResolvedValue(muscles);
    const { app, jwt } = await withAuth();
    try {
      const calls = [
        {
          method: 'POST' as const,
          url: '/api/v1/workout-progression/preview',
          payload: { scheduledWorkoutId: 'scheduled-1' },
        },
        {
          method: 'GET' as const,
          url: '/api/v1/workout-progression/recommendations/recommendation-1',
        },
        {
          method: 'GET' as const,
          url: '/api/v1/workout-progression/muscles?range=7d&timeZone=America%2FDetroit',
        },
      ];
      for (const call of calls) {
        const [jwtResponse, agentResponse] = await Promise.all([
          app.inject({ ...call, headers: { authorization: `Bearer ${jwt}` } }),
          app.inject({ ...call, headers: { authorization: 'AgentToken agent-secret' } }),
        ]);
        expect(jwtResponse.statusCode).toBe(200);
        expect(agentResponse.statusCode).toBe(200);
        expect(agentResponse.json().data).toEqual(jwtResponse.json().data);
      }
    } finally {
      await app.close();
    }
  });

  it('passes authenticated AgentToken provenance and idempotency input to the action store', async () => {
    vi.mocked(applyWorkoutProgressionAction).mockResolvedValue(action);
    const { app } = await withAuth();
    try {
      const input = {
        action: 'accept' as const,
        editedTargets: null,
        expectedFingerprint: 'a'.repeat(64),
        idempotencyKey: 'accept-key-1',
        reason: null,
      };
      const response = await app.inject({
        headers: { authorization: 'AgentToken agent-secret' },
        method: 'POST',
        payload: input,
        url: '/api/v1/workout-progression/recommendations/recommendation-1/actions',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual(action);
      expect(applyWorkoutProgressionAction).toHaveBeenCalledWith({
        actor: { id: 'agent-1', label: 'Coach agent', type: 'agent_token' },
        input,
        recommendationId: 'recommendation-1',
        userId: 'user-1',
      });
    } finally {
      await app.close();
    }
  });

  it('persists the same strict programming policy contract for JWT and AgentToken callers', async () => {
    vi.mocked(configureWorkoutProgression).mockResolvedValue(configuration);
    const { app, jwt } = await withAuth();
    const input = {
      contextAvailability: 'available' as const,
      contextFacts: [],
      expectedRevision: 0,
      policy: recommendation.evidence.policy,
      priority: true,
    };
    try {
      const agentResponse = await app.inject({
        headers: { authorization: 'AgentToken agent-secret' },
        method: 'PUT',
        payload: input,
        url: '/api/v1/workout-progression/scheduled-exercises/scheduled-exercise-1/configuration',
      });
      expect(agentResponse.statusCode).toBe(200);
      expect(agentResponse.json().data).toEqual(configuration);
      expect(configureWorkoutProgression).toHaveBeenLastCalledWith({
        actor: { id: 'agent-1', label: 'Coach agent', type: 'agent_token' },
        input,
        scheduledWorkoutExerciseId: 'scheduled-exercise-1',
        userId: 'user-1',
      });

      const jwtResponse = await app.inject({
        headers: { authorization: `Bearer ${jwt}` },
        method: 'PUT',
        payload: input,
        url: '/api/v1/workout-progression/scheduled-exercises/scheduled-exercise-1/configuration',
      });
      expect(jwtResponse.statusCode).toBe(200);
      expect(jwtResponse.json().data).toEqual(agentResponse.json().data);
      expect(configureWorkoutProgression).toHaveBeenLastCalledWith({
        actor: { id: 'user-1', label: 'You', type: 'user' },
        input,
        scheduledWorkoutExerciseId: 'scheduled-exercise-1',
        userId: 'user-1',
      });
    } finally {
      await app.close();
    }
  });

  it('maps stale evidence to a stable 409 and rejects invalid bodies before the store', async () => {
    vi.mocked(applyWorkoutProgressionAction).mockRejectedValue(
      new WorkoutProgressionStaleError('Workout progression recommendation is stale'),
    );
    const { app, jwt } = await withAuth();
    try {
      const stale = await app.inject({
        headers: { authorization: `Bearer ${jwt}` },
        method: 'POST',
        payload: {
          action: 'accept',
          editedTargets: null,
          expectedFingerprint: 'a'.repeat(64),
          idempotencyKey: 'accept-key-1',
          reason: null,
        },
        url: '/api/v1/workout-progression/recommendations/recommendation-1/actions',
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toEqual({
        error: {
          code: 'WORKOUT_PROGRESSION_STALE',
          message: 'Workout progression recommendation is stale',
        },
      });

      vi.mocked(applyWorkoutProgressionAction).mockClear();
      const invalid = await app.inject({
        headers: { authorization: `Bearer ${jwt}` },
        method: 'POST',
        payload: {
          action: 'hold',
          editedTargets: null,
          expectedFingerprint: 'a'.repeat(64),
          idempotencyKey: 'accept-key-2',
          reason: null,
        },
        url: '/api/v1/workout-progression/recommendations/recommendation-1/actions',
      });
      expect(invalid.statusCode).toBe(400);
      expect(applyWorkoutProgressionAction).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects a revoked AgentToken before any recommendation action write', async () => {
    vi.mocked(findAgentTokenByHash).mockResolvedValue(undefined);
    const { app } = await withAuth();
    try {
      const response = await app.inject({
        headers: { authorization: 'AgentToken revoked-secret' },
        method: 'POST',
        payload: {
          action: 'accept',
          editedTargets: null,
          expectedFingerprint: 'a'.repeat(64),
          idempotencyKey: 'revoked-token-key',
          reason: null,
        },
        url: '/api/v1/workout-progression/recommendations/recommendation-1/actions',
      });
      expect(response.statusCode).toBe(401);
      expect(applyWorkoutProgressionAction).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
