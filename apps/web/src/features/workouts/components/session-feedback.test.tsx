import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  createSystemWorkoutFeedbackQuestions,
  type WorkoutFeedbackQuestionDefinition,
} from '@pulse/shared';

import type { ActiveWorkoutCustomFeedbackField } from '../types';
import { SessionFeedback } from './session-feedback';

describe('SessionFeedback', () => {
  it('renders standard questions first and supports richer question types', () => {
    const onSubmit = vi.fn();
    const templateFields: ActiveWorkoutCustomFeedbackField[] = [
      {
        id: 'sleep-quality',
        label: 'Slept well last night?',
        type: 'yes_no',
        value: null,
      },
      {
        id: 'effort',
        label: 'Effort slider',
        max: 10,
        min: 1,
        step: 1,
        type: 'slider',
        value: null,
      },
      {
        id: 'limited-muscles',
        label: 'What limited performance?',
        options: ['Shoulders', 'Grip', 'Cardio', 'Nothing'],
        type: 'multi_select',
        value: [],
      },
      {
        id: 'coach-note',
        label: 'Coach note',
        optional: true,
        type: 'text',
        value: '',
      },
    ];

    render(<SessionFeedback fields={templateFields} onSubmit={onSubmit} />);

    const finalizeButton = screen.getByRole('button', { name: 'Finalize session' });
    expect(finalizeButton).toBeDisabled();

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Session RPE rating' })).getByRole('button', {
        name: '7',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Energy post workout options' })).getByRole(
        'button',
        {
          name: '🙂',
        },
      ),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Any pain or discomfort? response' })).getByRole(
        'button',
        {
          name: 'Yes',
        },
      ),
    );

    expect(screen.getByLabelText('Pain/discomfort details')).toBeInTheDocument();
    expect(finalizeButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Pain/discomfort details'), {
      target: { value: 'Mild right-knee discomfort during split squats.' },
    });
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Slept well last night? response' })).getByRole(
        'button',
        {
          name: 'No',
        },
      ),
    );
    fireEvent.change(screen.getByLabelText('Effort slider slider'), {
      target: { value: '8' },
    });
    fireEvent.click(
      within(screen.getByRole('group', { name: 'What limited performance? options' })).getByRole(
        'button',
        {
          name: 'Shoulders',
        },
      ),
    );

    expect(finalizeButton).toBeEnabled();

    fireEvent.click(finalizeButton);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submittedFeedback = onSubmit.mock.calls[0][0] as ActiveWorkoutCustomFeedbackField[];

    expect(submittedFeedback.map((field) => field.id)).toEqual([
      'session-rpe',
      'energy-post-workout',
      'pain-discomfort',
      'sleep-quality',
      'effort',
      'limited-muscles',
      'coach-note',
    ]);
    expect(
      submittedFeedback.find((field) => field.id === 'pain-discomfort' && field.type === 'yes_no'),
    ).toEqual(
      expect.objectContaining({
        notes: 'Mild right-knee discomfort during split squats.',
        value: true,
      }),
    );
    expect(
      submittedFeedback.find((field) => field.id === 'sleep-quality' && field.type === 'yes_no'),
    ).toEqual(
      expect.objectContaining({
        value: false,
      }),
    );
    expect(
      submittedFeedback.find((field) => field.id === 'effort' && field.type === 'slider'),
    ).toEqual(
      expect.objectContaining({
        value: 8,
      }),
    );
    expect(
      submittedFeedback.find(
        (field) => field.id === 'limited-muscles' && field.type === 'multi_select',
      ),
    ).toEqual(
      expect.objectContaining({
        value: ['Shoulders'],
      }),
    );
  });

  it('allows completion without pain details when pain is no', () => {
    const onSubmit = vi.fn();

    render(<SessionFeedback fields={[]} onSubmit={onSubmit} />);

    const finalizeButton = screen.getByRole('button', { name: 'Finalize session' });

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Session RPE rating' })).getByRole('button', {
        name: '5',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Energy post workout options' })).getByRole(
        'button',
        {
          name: '😐',
        },
      ),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Any pain or discomfort? response' })).getByRole(
        'button',
        {
          name: 'No',
        },
      ),
    );

    expect(screen.queryByLabelText('Pain/discomfort details')).not.toBeInTheDocument();
    expect(finalizeButton).toBeEnabled();

    fireEvent.click(finalizeButton);

    expect(onSubmit).toHaveBeenCalledWith([
      {
        answerState: 'answered',
        id: 'session-rpe',
        label: 'Session RPE',
        max: 10,
        min: 1,
        notes: '',
        optional: false,
        type: 'scale',
        value: 5,
      },
      {
        answerState: 'answered',
        id: 'energy-post-workout',
        label: 'Energy post workout',
        notes: '',
        optional: false,
        options: ['😫', '😕', '😐', '🙂', '💪'],
        type: 'emoji',
        value: '😐',
      },
      {
        answerState: 'answered',
        id: 'pain-discomfort',
        label: 'Any pain or discomfort?',
        notes: '',
        optional: false,
        type: 'yes_no',
        value: false,
      },
    ]);
  });

  it('preserves custom wording even when labels resemble standard prompts', () => {
    const onSubmit = vi.fn();

    render(
      <SessionFeedback
        fields={[
          {
            id: 'energy-post',
            label: 'Energy post workout',
            max: 5,
            min: 1,
            type: 'scale',
            value: 3,
          },
          {
            id: 'knee-pain',
            label: 'Knee pain',
            max: 5,
            min: 1,
            type: 'scale',
            value: 2,
          },
          {
            id: 'coach-note',
            label: 'Coach note',
            optional: true,
            type: 'text',
            value: '',
          },
        ]}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.queryByRole('group', { name: 'Energy post workout rating' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Knee pain rating' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Energy post workout options' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Coach note' })).toBeInTheDocument();
  });

  it('keeps custom fields whose ids include pain/discomfort substrings', () => {
    render(
      <SessionFeedback
        fields={[
          {
            id: 'muscle-pain-scale',
            label: 'Muscle pain scale',
            max: 10,
            min: 1,
            type: 'slider',
            value: null,
          },
          {
            id: 'joint-discomfort-check',
            label: 'Joint discomfort check',
            optional: true,
            type: 'text',
            value: '',
          },
        ]}
        onSubmit={() => {}}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 3, name: 'Muscle pain scale' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Joint discomfort check' }),
    ).toBeInTheDocument();
  });

  it('clears incoming field values to avoid stale prefills and uses coach-note guidance copy', () => {
    render(
      <SessionFeedback
        fields={[
          {
            id: 'shoulder-feel',
            label: 'Shoulder feel',
            max: 5,
            min: 1,
            notes: 'Previously felt fine.',
            type: 'scale',
            value: 4,
          },
          {
            id: 'session-note',
            label: 'Coach note',
            notes: 'Carry this note forward.',
            optional: true,
            type: 'text',
            value: 'Use a pause next session.',
          },
        ]}
        onSubmit={() => {}}
      />,
    );

    expect(
      screen.getByText(
        'What should we remember next time? Add a carry-forward coaching or programming note.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        'What should we remember next time? Add a carry-forward coaching or programming note.',
      ),
    ).toHaveValue('');
    expect(
      within(screen.getByRole('group', { name: 'Shoulder feel rating' })).getByRole('button', {
        name: '4',
      }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows session RPE guidance anchors in the help dialog', () => {
    render(<SessionFeedback fields={[]} onSubmit={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open Session RPE guide' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Session RPE Guide' })).toBeInTheDocument();
    expect(screen.getByText('Easy, plenty left in the tank')).toBeInTheDocument();
    expect(screen.getByText('Moderate, solid work but comfortable')).toBeInTheDocument();
    expect(screen.getByText('Hard, challenging but repeatable')).toBeInTheDocument();
    expect(screen.getByText('Very hard, close to limit')).toBeInTheDocument();
    expect(screen.getByText('Maximal, all-out effort')).toBeInTheDocument();
  });

  it('marks selected option controls with pressed state', () => {
    render(<SessionFeedback fields={[]} onSubmit={() => {}} />);

    const rpeSeven = within(screen.getByRole('group', { name: 'Session RPE rating' })).getByRole(
      'button',
      {
        name: '7',
      },
    );
    fireEvent.click(rpeSeven);
    expect(rpeSeven).toHaveAttribute('aria-pressed', 'true');

    const energyStrong = within(
      screen.getByRole('group', { name: 'Energy post workout options' }),
    ).getByRole('button', {
      name: '💪',
    });
    fireEvent.click(energyStrong);
    expect(energyStrong).toHaveAttribute('aria-pressed', 'true');

    const yesButton = within(
      screen.getByRole('group', { name: 'Any pain or discomfort? response' }),
    ).getByRole('button', {
      name: 'Yes',
    });
    fireEvent.click(yesButton);
    expect(yesButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders the frozen post-session definitions, excludes next-check-in and the old energy core', () => {
    const questions = [
      ...createSystemWorkoutFeedbackQuestions('2026-09-08T12:00:00.000Z'),
      feedbackDefinition({
        id: 'tib-response',
        prompt: 'What did the left lower leg do during tib-bar raises?',
        type: 'multi_select',
        optional: true,
        timing: 'post_session',
        config: { options: ['No issue', 'Pain', 'Tightness'], exclusiveOption: 'No issue' },
        exerciseNameSnapshot: 'Tibialis Raise',
        bodyRegion: 'lower leg',
        laterality: 'left',
      }),
      feedbackDefinition({
        id: 'next-check',
        prompt: 'How did this feel the next morning?',
        type: 'text',
        optional: true,
        timing: 'next_check_in',
        config: {},
      }),
    ];

    render(<SessionFeedback onSubmit={() => {}} questions={questions} />);

    expect(
      screen.getByRole('heading', {
        name: 'What did the left lower leg do during tib-bar raises?',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Tibialis Raise · lower leg · left')).toBeInTheDocument();
    expect(screen.queryByText('How did this feel the next morning?')).not.toBeInTheDocument();
    expect(screen.queryByText('Energy post workout')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalize session' })).toBeEnabled();
  });

  it('renders exact numeric anchors and submits cleared optional text as unanswered', async () => {
    const onSubmit = vi.fn();
    const questions = [
      feedbackDefinition({
        id: 'anchored-scale',
        prompt: 'How controlled did the movement feel?',
        type: 'scale',
        optional: true,
        timing: 'post_session',
        config: {
          min: 0,
          max: 2,
          step: 1,
          anchors: [
            { value: 0, label: 'Not controlled' },
            { value: 2, label: 'Fully controlled' },
          ],
        },
      }),
      feedbackDefinition({
        id: 'optional-context',
        prompt: 'Optional context',
        type: 'text',
        optional: true,
        timing: 'post_session',
        config: {},
      }),
    ];

    render(<SessionFeedback onSubmit={onSubmit} questions={questions} />);

    expect(
      screen.getByText((_, element) => element?.textContent === '0: Not controlled'),
    ).toBeVisible();
    expect(
      screen.getByText((_, element) => element?.textContent === '2: Fully controlled'),
    ).toBeVisible();
    const context = screen.getByRole('textbox', { name: 'Optional context' });
    fireEvent.change(context, { target: { value: 'temporary' } });
    fireEvent.change(context, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finalize session' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'optional-context',
          value: undefined,
          answerState: 'unanswered',
        }),
      ]),
    );
  });

  it('hydrates exact server revisions without letting an older local draft overwrite false', () => {
    const questions = createSystemWorkoutFeedbackQuestions('2026-09-08T12:00:00.000Z');
    localStorage.setItem(
      'feedback-revision-test',
      JSON.stringify({
        revision: 0,
        fields: [
          {
            id: 'pain-discomfort',
            definitionVersion: 1,
            type: 'yes_no',
            label: 'Any pain or discomfort?',
            value: true,
            answerState: 'answered',
          },
        ],
      }),
    );
    render(
      <SessionFeedback
        draftKey="feedback-revision-test"
        onSubmit={() => {}}
        questions={questions}
        serverRevision={1}
        serverAnswers={[
          {
            questionId: 'pain-discomfort',
            definitionVersion: 1,
            state: 'answered',
            value: false,
            responseId: 'response-pain',
            revision: 1,
            priorRevisionId: null,
            answeredAt: '2026-09-08T12:01:00.000Z',
            timing: 'post_session',
            respondentSource: 'user',
            respondentActorId: 'owner-a',
          },
        ]}
      />,
    );
    expect(
      within(screen.getByRole('group', { name: 'Any pain or discomfort? response' })).getByRole(
        'button',
        { name: 'No' },
      ),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('serializes durable saves and retries a failed draft without losing visible answers', async () => {
    vi.useFakeTimers();
    const onSaveDraft = vi
      .fn()
      .mockRejectedValueOnce(new Error('synthetic network failure'))
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    try {
      render(
        <SessionFeedback
          onSaveDraft={onSaveDraft}
          onSubmit={() => {}}
          questions={createSystemWorkoutFeedbackQuestions('2026-09-08T12:00:00.000Z')}
        />,
      );
      const noButton = within(
        screen.getByRole('group', { name: 'Any pain or discomfort? response' }),
      ).getByRole('button', { name: 'No' });
      fireEvent.click(noButton);
      await act(async () => vi.advanceTimersByTime(451));
      await act(async () => Promise.resolve());
      expect(noButton).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText(/Draft not saved/)).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
        await Promise.resolve();
      });
      expect(screen.queryByText(/Draft not saved/)).not.toBeInTheDocument();
      expect(onSaveDraft.mock.calls.map((call) => call[1])).toEqual([0, 0]);

      fireEvent.click(
        within(screen.getByRole('group', { name: 'Session RPE rating' })).getByRole('button', {
          name: '5',
        }),
      );
      await act(async () => vi.advanceTimersByTime(451));
      await act(async () => Promise.resolve());
      expect(onSaveDraft.mock.calls[2]?.[1]).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

function feedbackDefinition(
  input: Omit<
    WorkoutFeedbackQuestionDefinition,
    | 'version'
    | 'revisionId'
    | 'priorRevisionId'
    | 'sourceKind'
    | 'sourceActorId'
    | 'sourceActorName'
    | 'authoredAt'
  >,
): WorkoutFeedbackQuestionDefinition {
  return {
    ...input,
    version: 1,
    revisionId: `revision:${input.id}:1`,
    priorRevisionId: null,
    sourceKind: 'agent_token',
    sourceActorId: 'synthetic-agent',
    sourceActorName: 'Synthetic Agent',
    authoredAt: '2026-09-08T12:00:00.000Z',
  } as WorkoutFeedbackQuestionDefinition;
}
