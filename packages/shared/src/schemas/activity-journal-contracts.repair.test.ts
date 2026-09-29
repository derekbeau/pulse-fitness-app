import { describe, expect, it } from 'vitest';

import {
  answerCheckInQuestionInputSchema,
  approveMeaningfulProposalInputSchema,
  calendarReadItemSchema,
  calendarReadModelSchema,
  checkInQuestionRevisionSchema,
  correctOwnedRecordInputSchema,
  createActivityAssignmentInputSchema,
  createActivityInputSchema,
  createActivityRecurrenceRevisionInputSchema,
  createCheckInQuestionInputSchema,
  createJournalObservationInputSchema,
  dailyContextReadModelSchema,
  healthObservationSchema,
  immutableCorrectionRevisionSchema,
  meaningfulChangeProposalSchema,
  recordActivityExecutionInputSchema,
  recordConcernInputSchema,
  recordFlareInputSchema,
  recordGuidanceInputSchema,
  rescheduleActivityAssignmentInputSchema,
  routinePlanInstructionSchema,
  sessionContextReadModelSchema,
  transitionConcernInputSchema,
  weeklyReflectionReadModelSchema,
} from './activity-journal-contracts';
import {
  agentActor,
  correctionRevisionFixtures,
  fingerprintFixtures,
  meaningfulProposalFixture,
  provenanceFixtures,
  thursdayExecutionFixture,
  tuesdayAssignmentFixture,
  unknownAnswerFixture,
  userActor,
} from './activity-journal-contracts.fixtures';

const subjectUserId = 'user-1';
const foreignSubjectUserId = 'user-2';
const source = provenanceFixtures[2];

const ownedReference = (kind = 'activity_execution', subject = subjectUserId) => ({
  kind,
  id: `${kind}-1`,
  subjectUserId: subject,
  revisionId: `${kind}-revision-1`,
});

const idempotency = (operation: string, subject = subjectUserId) => ({
  key: `${operation}-request-1`,
  scope: { subjectUserId: subject, route: `/api/v1/${operation}`, operation },
  requestFingerprint: fingerprintFixtures.fingerprintA,
});

const writeCases = [
  {
    name: 'routine instruction',
    schema: routinePlanInstructionSchema,
    input: {
      kind: 'routine_direct_instruction',
      subjectUserId,
      instruction: 'Move the walk to this evening.',
      target: { reference: ownedReference('activity_assignment'), expectedRevision: 1 },
      idempotency: idempotency('routine_instruction'),
      actor: userActor,
      executedAt: '2026-03-12T10:00:00-04:00',
    },
  },
  {
    name: 'activity creation',
    schema: createActivityInputSchema,
    input: {
      subjectUserId,
      kind: 'walking',
      name: 'Evening walk',
      goalIds: [],
      source,
      actor: agentActor,
      idempotency: idempotency('create_activity'),
    },
  },
  {
    name: 'assignment creation',
    schema: createActivityAssignmentInputSchema,
    input: {
      subjectUserId,
      activityId: 'activity-1',
      plannedLocalDate: '2026-03-12',
      timeZone: 'America/Detroit',
      recurrenceRevisionId: null,
      actor: agentActor,
      idempotency: idempotency('create_assignment'),
    },
  },
  {
    name: 'assignment reschedule',
    schema: rescheduleActivityAssignmentInputSchema,
    input: {
      subjectUserId,
      assignmentId: 'assignment-1',
      expectedRevision: 1,
      plannedLocalDate: '2026-03-13',
      timeZone: 'America/Detroit',
      reason: 'User requested a later date.',
      actor: userActor,
      idempotency: idempotency('reschedule_assignment'),
    },
  },
  {
    name: 'execution recording',
    schema: recordActivityExecutionInputSchema,
    input: {
      subjectUserId,
      activityId: 'activity-1',
      assignmentId: 'assignment-1',
      actualOccurredAt: '2026-03-13T00:30:00Z',
      actualLocalDate: '2026-03-12',
      timeZone: 'America/Detroit',
      durationMinutes: 20,
      outcome: 'completed',
      structuredWorkoutSessionId: null,
      source,
      actor: agentActor,
      idempotency: idempotency('record_execution'),
    },
  },
  {
    name: 'recurrence revision creation',
    schema: createActivityRecurrenceRevisionInputSchema,
    input: {
      recurrenceId: 'recurrence-1',
      subjectUserId,
      sequence: 1,
      priorRevisionId: null,
      effectiveFromLocalDate: '2026-03-12',
      timeZone: 'America/Detroit',
      frequency: 'weekly',
      interval: 1,
      weekdays: [],
      assignmentPolicy: 'unassigned_on_or_after_effective_date',
      actor: userActor,
      idempotency: idempotency('create_recurrence'),
    },
  },
  {
    name: 'owned record correction',
    schema: correctOwnedRecordInputSchema,
    input: {
      subjectUserId,
      record: ownedReference(),
      expectedRevision: 1,
      correctedFields: { durationMinutes: 25 },
      reason: 'User corrected the duration.',
      actor: userActor,
      idempotency: idempotency('correct_record'),
    },
  },
  {
    name: 'concern recording',
    schema: recordConcernInputSchema,
    input: {
      subjectUserId,
      label: 'Left knee soreness',
      bodyRegion: 'left knee',
      symptomState: 'affirmed',
      managementState: 'active',
      source,
      actor: agentActor,
      idempotency: idempotency('record_concern'),
    },
  },
  {
    name: 'concern transition',
    schema: transitionConcernInputSchema,
    input: {
      subjectUserId,
      concernId: 'concern-1',
      expectedRevision: 1,
      from: 'active',
      to: 'monitoring',
      reason: 'Symptoms have improved.',
      source,
      actor: userActor,
      idempotency: idempotency('transition_concern'),
    },
  },
  {
    name: 'guidance recording',
    schema: recordGuidanceInputSchema,
    input: {
      subjectUserId,
      concernId: 'concern-1',
      capabilityId: null,
      text: 'Keep the movement pain free.',
      source,
      actor: agentActor,
      idempotency: idempotency('record_guidance'),
    },
  },
  {
    name: 'flare recording',
    schema: recordFlareInputSchema,
    input: {
      subjectUserId,
      concernId: 'concern-1',
      occurredAt: '2026-03-13T00:30:00Z',
      localDate: '2026-03-12',
      timeZone: 'America/Detroit',
      observation: 'Soreness increased after the walk.',
      symptomState: 'affirmed',
      source,
      followUpQuestions: [],
      actor: agentActor,
      idempotency: idempotency('record_flare'),
    },
  },
  {
    name: 'check-in question creation',
    schema: createCheckInQuestionInputSchema,
    input: {
      subjectUserId,
      deduplicationKey: fingerprintFixtures.fingerprintB,
      prompt: 'How does the knee feel today?',
      sourceReferences: [ownedReference('body_concern')],
      actor: agentActor,
      idempotency: idempotency('create_check_in_question'),
    },
  },
  {
    name: 'check-in answer creation',
    schema: answerCheckInQuestionInputSchema,
    input: {
      questionId: 'question-1',
      questionRevisionId: 'question-revision-1',
      subjectUserId,
      state: 'answered',
      value: 'Better than yesterday.',
      source,
      expectedQuestionRevisionId: 'question-revision-1',
      expectedAnswerRevision: 0,
      actor: userActor,
      idempotency: idempotency('answer_check_in_question'),
    },
  },
  {
    name: 'journal observation creation',
    schema: createJournalObservationInputSchema,
    input: {
      subjectUserId,
      localDate: '2026-03-12',
      timeZone: 'America/Detroit',
      title: 'Movement notes',
      content: 'The evening walk felt comfortable.',
      category: 'movement',
      sourceReferences: [ownedReference('activity_execution')],
      source,
      actor: agentActor,
      idempotency: idempotency('create_journal_observation'),
    },
  },
  {
    name: 'proposal approval',
    schema: approveMeaningfulProposalInputSchema,
    input: {
      subjectUserId,
      proposalId: 'proposal-1',
      proposalRevisionId: 'proposal-revision-1',
      targetRevisionFingerprint: fingerprintFixtures.fingerprintC,
      targetExpectedRevisions: [
        { reference: ownedReference('scheduled_workout'), expectedRevision: 4 },
      ],
      approvedBy: userActor,
      idempotency: idempotency('approve_proposal'),
    },
  },
];

const observationAt = (occurredAt: string, localDate: string, timeZone = 'America/Detroit') => ({
  id: 'observation-1',
  subjectUserId,
  category: 'health',
  text: 'Energy was steady.',
  finding: 'affirmed',
  occurredAt,
  localDate,
  timeZone,
  source,
  concernIds: [],
  capabilityIds: [],
  activityExecutionIds: [],
  workoutSessionIds: [],
  currentRevisionId: 'observation-revision-1',
});

const flareAt = (occurredAt: string, localDate: string, timeZone = 'America/Detroit') => ({
  subjectUserId,
  concernId: 'concern-1',
  occurredAt,
  localDate,
  timeZone,
  observation: 'Knee soreness increased.',
  symptomState: 'affirmed',
  source,
  followUpQuestions: [],
  actor: agentActor,
  idempotency: idempotency('record_flare'),
});

const calendarItemAt = (
  occurrenceAt: string | null,
  localDate: string,
  timeZone = 'America/Detroit',
) => ({
  id: 'calendar-item-1',
  subjectUserId,
  domain: 'activity',
  record: ownedReference('activity'),
  localDate,
  timeZone,
  occurrenceAt,
  state: occurrenceAt === null ? 'planned' : 'completed',
  title: 'Evening walk',
});

const concern = {
  id: 'concern-1',
  subjectUserId,
  label: 'Left knee soreness',
  bodyRegion: 'left knee',
  symptomState: 'affirmed',
  managementState: 'active',
  source,
  currentRevisionId: 'concern-revision-1',
  createdAt: '2026-03-12T10:00:00-04:00',
  updatedAt: '2026-03-12T10:00:00-04:00',
};

const capability = {
  id: 'capability-1',
  subjectUserId,
  label: 'Pain-free walking',
  state: 'developing',
  source,
  currentRevisionId: 'capability-revision-1',
  updatedAt: '2026-03-12T10:00:00-04:00',
};

const guidance = {
  id: 'guidance-1',
  subjectUserId,
  concernId: 'concern-1',
  capabilityId: null,
  text: 'Keep movement pain free.',
  source,
  state: 'current',
  currentRevisionId: 'guidance-revision-1',
  createdAt: '2026-03-12T10:00:00-04:00',
};

const question = {
  id: 'question-revision-1',
  questionId: 'question-1',
  subjectUserId,
  revision: 1,
  priorRevisionId: null,
  deduplicationKey: fingerprintFixtures.fingerprintB,
  prompt: 'How does the knee feel today?',
  state: 'pending',
  sourceReferences: [ownedReference('body_concern')],
  createdAt: '2026-03-12T10:00:00-04:00',
};

const clone = <T>(value: T): T => structuredClone(value);

describe('repair 1 write boundaries', () => {
  it.each(writeCases)('$name binds idempotency to the write subject', ({ schema, input }) => {
    expect(schema.safeParse(input).success).toBe(true);

    const mismatched = clone(input);
    mismatched.idempotency.scope.subjectUserId = foreignSubjectUserId;
    const result = schema.safeParse(mismatched);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(
        'idempotency.scope.subjectUserId',
      );
    }
  });

  it.each([
    {
      name: 'routine instruction target',
      schema: routinePlanInstructionSchema,
      input: writeCases[0].input,
      corrupt: (value: unknown) => {
        const instruction = value as { target: { reference: { subjectUserId: string } } };
        instruction.target.reference.subjectUserId = foreignSubjectUserId;
      },
      path: 'target.reference.subjectUserId',
    },
    {
      name: 'correction record',
      schema: correctOwnedRecordInputSchema,
      input: writeCases[6].input,
      corrupt: (value: unknown) => {
        const correction = value as { record: { subjectUserId: string } };
        correction.record.subjectUserId = foreignSubjectUserId;
      },
      path: 'record.subjectUserId',
    },
    {
      name: 'check-in source',
      schema: createCheckInQuestionInputSchema,
      input: writeCases[11].input,
      corrupt: (value: unknown) => {
        const questionInput = value as { sourceReferences: Array<{ subjectUserId: string }> };
        questionInput.sourceReferences[0].subjectUserId = foreignSubjectUserId;
      },
      path: 'sourceReferences.0.subjectUserId',
    },
    {
      name: 'journal source',
      schema: createJournalObservationInputSchema,
      input: writeCases[13].input,
      corrupt: (value: unknown) => {
        const journalInput = value as { sourceReferences: Array<{ subjectUserId: string }> };
        journalInput.sourceReferences[0].subjectUserId = foreignSubjectUserId;
      },
      path: 'sourceReferences.0.subjectUserId',
    },
    {
      name: 'approval target',
      schema: approveMeaningfulProposalInputSchema,
      input: writeCases[14].input,
      corrupt: (value: unknown) => {
        const approval = value as {
          targetExpectedRevisions: Array<{ reference: { subjectUserId: string } }>;
        };
        approval.targetExpectedRevisions[0].reference.subjectUserId = foreignSubjectUserId;
      },
      path: 'targetExpectedRevisions.0.reference.subjectUserId',
    },
  ])('rejects a foreign-subject $name', ({ schema, input, corrupt, path }) => {
    expect(schema.safeParse(input).success).toBe(true);
    const mismatched = clone(input);
    corrupt(mismatched);
    const result = schema.safeParse(mismatched);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(path);
    }
  });

  it('rejects a foreign-subject target on a stored proposal', () => {
    expect(meaningfulChangeProposalSchema.safeParse(meaningfulProposalFixture).success).toBe(true);
    const mismatched = clone(meaningfulProposalFixture);
    mismatched.targets[0].reference.subjectUserId = foreignSubjectUserId;
    const result = meaningfulChangeProposalSchema.safeParse(mismatched);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path.join('.')).toBe('targets.0.reference.subjectUserId');
    }
  });

  it('rejects empty correction payloads while accepting an actual correction', () => {
    expect(immutableCorrectionRevisionSchema.safeParse(correctionRevisionFixtures[0]).success).toBe(
      true,
    );
    expect(
      immutableCorrectionRevisionSchema.safeParse({
        ...correctionRevisionFixtures[0],
        correctedFields: {},
      }).success,
    ).toBe(false);

    expect(correctOwnedRecordInputSchema.safeParse(writeCases[6].input).success).toBe(true);
    expect(
      correctOwnedRecordInputSchema.safeParse({
        ...writeCases[6].input,
        correctedFields: {},
      }).success,
    ).toBe(false);
  });
});

describe('repair 1 occurrence date boundaries', () => {
  const occurrenceCases = [
    {
      name: 'ordinary UTC-to-local date boundary',
      occurredAt: '2026-01-02T01:00:00Z',
      localDate: '2026-01-01',
      invalidLocalDate: '2026-01-02',
    },
    {
      name: 'spring DST before the jump',
      occurredAt: '2026-03-08T04:30:00Z',
      localDate: '2026-03-07',
      invalidLocalDate: '2026-03-08',
    },
    {
      name: 'spring DST after the jump',
      occurredAt: '2026-03-08T07:30:00Z',
      localDate: '2026-03-08',
      invalidLocalDate: '2026-03-07',
    },
    {
      name: 'fall DST first 01:30',
      occurredAt: '2026-11-01T05:30:00Z',
      localDate: '2026-11-01',
      invalidLocalDate: '2026-10-31',
    },
    {
      name: 'fall DST second 01:30',
      occurredAt: '2026-11-01T06:30:00Z',
      localDate: '2026-11-01',
      invalidLocalDate: '2026-11-02',
    },
  ];

  it.each([
    { name: 'health observation', schema: healthObservationSchema, build: observationAt },
    { name: 'flare write', schema: recordFlareInputSchema, build: flareAt },
    { name: 'calendar occurrence', schema: calendarReadItemSchema, build: calendarItemAt },
  ])('validates all $name local dates across UTC and DST boundaries', ({ schema, build }) => {
    occurrenceCases.forEach(({ occurredAt, localDate, invalidLocalDate }) => {
      expect(schema.safeParse(build(occurredAt, localDate)).success).toBe(true);
      expect(schema.safeParse(build(occurredAt, invalidLocalDate)).success).toBe(false);
    });
  });

  it('allows date-only calendar items without inventing an occurrence instant', () => {
    expect(calendarReadItemSchema.safeParse(calendarItemAt(null, '2026-03-12')).success).toBe(true);
  });

  it.each([
    { schema: healthObservationSchema, input: observationAt('2026-03-12T10:00:00Z', '2026-03-12') },
    { schema: recordFlareInputSchema, input: flareAt('2026-03-12T10:00:00Z', '2026-03-12') },
    { schema: calendarReadItemSchema, input: calendarItemAt('2026-03-12T10:00:00Z', '2026-03-12') },
  ])('reports an invalid timezone without throwing', ({ schema, input }) => {
    const invalid = { ...input, timeZone: 'Not/A_Time_Zone' };
    expect(() => schema.safeParse(invalid)).not.toThrow();
    expect(schema.safeParse(invalid).success).toBe(false);
  });
});

describe('repair 1 aggregate ownership boundaries', () => {
  const dailyContext = {
    contractVersion: 'activity-journal-v1',
    subjectUserId,
    localDate: '2026-03-12',
    timeZone: 'America/Detroit',
    pendingQuestions: [question],
    currentAnswers: [unknownAnswerFixture],
    observations: [observationAt('2026-03-12T10:00:00-04:00', '2026-03-12')],
    assignments: [tuesdayAssignmentFixture],
    executions: [thursdayExecutionFixture],
    concerns: [concern],
    capabilities: [capability],
    guidance: [guidance],
    workoutSessionIds: ['workout-session-1'],
    nutritionLocalDate: '2026-03-12',
    generatedAt: '2026-03-12T12:00:00-04:00',
  };

  const sessionContext = {
    contractVersion: 'activity-journal-v1',
    subjectUserId,
    workoutSessionId: 'workout-session-1',
    generatedAt: '2026-03-12T12:00:00-04:00',
    positiveFocus: [capability],
    relevantConcerns: [concern],
    applicableGuidance: [guidance],
    recentObservations: [observationAt('2026-03-12T10:00:00-04:00', '2026-03-12')],
    missingInputs: [],
  };

  it.each([
    'pendingQuestions',
    'currentAnswers',
    'observations',
    'assignments',
    'executions',
    'concerns',
    'capabilities',
    'guidance',
  ])('rejects a foreign-subject daily context %s item', (collection) => {
    expect(dailyContextReadModelSchema.safeParse(dailyContext).success).toBe(true);
    const mismatched = clone(dailyContext) as unknown as Record<
      string,
      Array<{ subjectUserId: string }>
    >;
    mismatched[collection][0].subjectUserId = foreignSubjectUserId;
    expect(dailyContextReadModelSchema.safeParse(mismatched).success).toBe(false);
  });

  it.each(['positiveFocus', 'relevantConcerns', 'applicableGuidance', 'recentObservations'])(
    'rejects a foreign-subject session context %s item',
    (collection) => {
      expect(sessionContextReadModelSchema.safeParse(sessionContext).success).toBe(true);
      const mismatched = clone(sessionContext) as unknown as Record<
        string,
        Array<{ subjectUserId: string }>
      >;
      mismatched[collection][0].subjectUserId = foreignSubjectUserId;
      expect(sessionContextReadModelSchema.safeParse(mismatched).success).toBe(false);
    },
  );

  it('binds check-in source references to the question subject', () => {
    expect(checkInQuestionRevisionSchema.safeParse(question).success).toBe(true);
    const mismatched = clone(question);
    mismatched.sourceReferences[0].subjectUserId = foreignSubjectUserId;
    expect(checkInQuestionRevisionSchema.safeParse(mismatched).success).toBe(false);
  });

  it('binds weekly fact sources and calendar items to their aggregate subjects', () => {
    const weekly = {
      contractVersion: 'activity-journal-v1',
      subjectUserId,
      startLocalDate: '2026-03-09',
      endLocalDate: '2026-03-15',
      timeZone: 'America/Detroit',
      facts: [
        {
          id: 'fact-1',
          localDate: '2026-03-12',
          summary: 'Completed the evening walk.',
          sourceReferences: [ownedReference('activity_execution')],
        },
      ],
      gaps: [],
      generatedAt: '2026-03-15T20:00:00-04:00',
    };
    const calendar = {
      contractVersion: 'activity-journal-v1',
      subjectUserId,
      from: '2026-03-12',
      to: '2026-03-12',
      timeZone: 'America/Detroit',
      items: [calendarItemAt('2026-03-12T22:00:00Z', '2026-03-12')],
    };

    expect(weeklyReflectionReadModelSchema.safeParse(weekly).success).toBe(true);
    expect(calendarReadModelSchema.safeParse(calendar).success).toBe(true);

    const foreignWeekly = clone(weekly);
    foreignWeekly.facts[0].sourceReferences[0].subjectUserId = foreignSubjectUserId;
    expect(weeklyReflectionReadModelSchema.safeParse(foreignWeekly).success).toBe(false);

    const foreignCalendarItem = clone(calendar);
    foreignCalendarItem.items[0].subjectUserId = foreignSubjectUserId;
    expect(calendarReadModelSchema.safeParse(foreignCalendarItem).success).toBe(false);

    const foreignCalendarRecord = clone(calendar);
    foreignCalendarRecord.items[0].record.subjectUserId = foreignSubjectUserId;
    expect(calendarReadModelSchema.safeParse(foreignCalendarRecord).success).toBe(false);
  });
});
