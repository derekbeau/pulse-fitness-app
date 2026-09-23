import { describe, expect, it } from 'vitest';

import {
  PROPOSAL_APPROVAL_STATEMENT_READ_LIMIT,
  createPlanChangeProposalApiInputSchema,
  planChangeProposalSchema,
  proposalApprovalStatementListSchema,
  proposalApprovalStatementReadLimitErrorResponseSchema,
  recordBodyFlareApiInputSchema,
} from './body-context-runtime.js';

const source = {
  class: 'user_observation' as const,
  sourceId: 'conversation-178',
  sourceLabel: 'User report',
  sourceOccurredAt: '2026-11-01T01:30:00.000-04:00',
  uncertainty: 'known' as const,
  freshness: {
    state: 'current' as const,
    asOf: '2026-11-01T01:30:00.000-04:00',
    reasons: [],
  },
};

const proposalFingerprint = 'a'.repeat(64);
const proposalBase = {
  id: 'proposal-1',
  subjectUserId: 'user-1',
  state: 'approved' as const,
  currentRevisionId: 'proposal-revision-1',
  revision: 1,
  summary: 'Move one upcoming walk.',
  targets: [
    {
      reference: {
        kind: 'activity_assignment' as const,
        id: 'assignment-1',
        subjectUserId: 'user-1',
        revisionId: 'assignment-revision-1',
      },
      expectedRevision: 1,
    },
  ],
  effects: [
    {
      kind: 'activity_assignment_reschedule' as const,
      assignmentId: 'assignment-1',
      expectedRevision: 1,
      plannedLocalDate: '2026-09-24',
      timeZone: 'America/Detroit',
      reason: 'Exact approved move',
    },
  ],
  sourceReferences: [],
  targetRevisionFingerprint: proposalFingerprint,
  proposedBy: { kind: 'agent_token' as const, id: 'agent-1', label: 'Coach agent' },
  proposedAt: '2026-09-19T13:55:00.000Z',
  revisions: [
    {
      id: 'proposal-revision-1',
      proposalId: 'proposal-1',
      subjectUserId: 'user-1',
      revision: 1,
      priorRevisionId: null,
      summary: 'Move one upcoming walk.',
      targets: [
        {
          reference: {
            kind: 'activity_assignment' as const,
            id: 'assignment-1',
            subjectUserId: 'user-1',
            revisionId: 'assignment-revision-1',
          },
          expectedRevision: 1,
        },
      ],
      effects: [
        {
          kind: 'activity_assignment_reschedule' as const,
          assignmentId: 'assignment-1',
          expectedRevision: 1,
          plannedLocalDate: '2026-09-24',
          timeZone: 'America/Detroit',
          reason: 'Exact approved move',
        },
      ],
      sourceReferences: [],
      targetRevisionFingerprint: proposalFingerprint,
      proposedBy: { kind: 'agent_token' as const, id: 'agent-1', label: 'Coach agent' },
      proposedAt: '2026-09-19T13:55:00.000Z',
    },
  ],
  execution: { executedAt: '2026-09-19T14:00:00.000Z', effects: [] },
  createdAt: '2026-09-19T13:55:00.000Z',
  updatedAt: '2026-09-19T14:00:00.000Z',
};

describe('body-context runtime contracts', () => {
  it('bounds the read-only statement audit and types its overflow', () => {
    const statements = Array.from(
      { length: PROPOSAL_APPROVAL_STATEMENT_READ_LIMIT },
      (_, index) => ({
        id: `statement-${index}`,
        subjectUserId: 'user-1',
        proposalId: 'proposal-1',
        proposalRevisionId: 'proposal-revision-1',
        targetRevisionFingerprint: proposalFingerprint,
        statement: `Fictional claim ${index}`,
        sourceId: `source-${index}`,
        sourceOccurredAt: '2026-09-19T09:58:00.000-04:00',
        recordedBy: { kind: 'agent_token' as const, id: 'agent-1', label: null },
        createdAt: '2026-09-19T14:00:00.000Z',
      }),
    );
    expect(proposalApprovalStatementListSchema.parse({ statements }).statements).toHaveLength(100);
    expect(() =>
      proposalApprovalStatementListSchema.parse({ statements: [...statements, statements[0]] }),
    ).toThrow();
    expect(
      proposalApprovalStatementReadLimitErrorResponseSchema.parse({
        error: {
          code: 'PROPOSAL_APPROVAL_STATEMENT_READ_LIMIT_EXCEEDED',
          message: 'Approval statement audit exceeds the supported read limit.',
          details: { scope: 'proposal_approval_statements', limit: 100 },
        },
      }).error.details.limit,
    ).toBe(100);
  });
  it('keeps occurrence local date distinct from capture time across DST', () => {
    expect(
      recordBodyFlareApiInputSchema.parse({
        occurredAt: '2026-11-01T01:30:00.000-04:00',
        localDate: '2026-11-01',
        timeZone: 'America/Detroit',
        observation: 'Shoulder soreness returned.',
        source,
        followUpQuestions: [],
        idempotencyKey: 'flare-dst-178',
      }).localDate,
    ).toBe('2026-11-01');
    expect(() =>
      recordBodyFlareApiInputSchema.parse({
        occurredAt: '2026-11-02T05:30:00.000Z',
        localDate: '2026-11-01',
        timeZone: 'America/Detroit',
        observation: 'Late flare belongs to the next local date.',
        source,
        followUpQuestions: [],
        idempotencyKey: 'flare-bad-date-178',
      }),
    ).toThrow('localDate must match occurredAt in timeZone');
  });

  it('accepts only typed plan effects and rejects routine-authority smuggling', () => {
    const base = {
      summary: 'Move one upcoming walk.',
      effects: [
        {
          kind: 'activity_assignment_reschedule' as const,
          assignmentId: 'assignment-1',
          expectedRevision: 1,
          plannedLocalDate: '2026-09-24',
          timeZone: 'America/Detroit',
          reason: 'Exact proposed move',
        },
      ],
      sourceReferences: [],
      idempotencyKey: 'proposal-schema-178',
    };
    expect(createPlanChangeProposalApiInputSchema.parse(base).effects).toHaveLength(1);
    expect(() =>
      createPlanChangeProposalApiInputSchema.parse({
        ...base,
        effects: [
          {
            ...base.effects[0],
            diagnosis: 'impingement',
            markConcernResolved: true,
          },
        ],
      }),
    ).toThrow();
  });

  it('distinguishes direct user approval from a trusted agent relay in the audit contract', () => {
    const direct = planChangeProposalSchema.parse({
      ...proposalBase,
      approval: {
        proposalRevisionId: 'proposal-revision-1',
        targetRevisionFingerprint: proposalFingerprint,
        approvedBy: { kind: 'user', id: 'user-1', label: null },
        relayedBy: null,
        approvalStatementId: null,
        approvalStatement: null,
        approvedAt: '2026-09-19T14:00:00.000Z',
      },
    });
    expect(direct.approval?.relayedBy).toBeNull();

    const relayActor = { kind: 'agent_token' as const, id: 'agent-1', label: 'Coach agent' };
    const relayed = planChangeProposalSchema.parse({
      ...proposalBase,
      approval: {
        proposalRevisionId: 'proposal-revision-1',
        targetRevisionFingerprint: proposalFingerprint,
        approvedBy: { kind: 'user', id: 'user-1', label: null },
        relayedBy: relayActor,
        approvalStatementId: 'statement-1',
        approvalStatement: {
          id: 'statement-1',
          subjectUserId: 'user-1',
          proposalId: 'proposal-1',
          proposalRevisionId: 'proposal-revision-1',
          targetRevisionFingerprint: proposalFingerprint,
          statement: 'Yes, move that exact walk.',
          sourceId: 'conversation-message-1',
          sourceOccurredAt: '2026-09-19T09:58:00.000-04:00',
          recordedBy: relayActor,
          createdAt: '2026-09-19T14:00:00.000Z',
        },
        approvedAt: '2026-09-19T14:00:00.000Z',
      },
    });
    expect(relayed.approval?.approvalStatement?.recordedBy).toEqual(relayActor);
  });

  it('rejects approval audits that blur the user subject and authenticated relay actor', () => {
    expect(() =>
      planChangeProposalSchema.parse({
        ...proposalBase,
        approval: {
          proposalRevisionId: 'proposal-revision-1',
          targetRevisionFingerprint: proposalFingerprint,
          approvedBy: { kind: 'user', id: 'user-1', label: null },
          relayedBy: { kind: 'agent_token', id: 'agent-1', label: 'Coach agent' },
          approvalStatementId: 'statement-1',
          approvalStatement: {
            id: 'statement-1',
            subjectUserId: 'user-1',
            proposalId: 'proposal-1',
            proposalRevisionId: 'proposal-revision-1',
            targetRevisionFingerprint: proposalFingerprint,
            statement: 'Yes, move that exact walk.',
            sourceId: 'conversation-message-1',
            sourceOccurredAt: '2026-09-19T09:58:00.000-04:00',
            recordedBy: { kind: 'agent_token', id: 'different-agent', label: null },
            createdAt: '2026-09-19T14:00:00.000Z',
          },
          approvedAt: '2026-09-19T14:00:00.000Z',
        },
      }),
    ).toThrow('Relayed approval audit must match');
  });
});
