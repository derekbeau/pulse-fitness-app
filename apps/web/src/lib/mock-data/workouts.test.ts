import { mockExercises, mockSchedule, mockSessions, mockTemplates } from '@/lib/mock-data/workouts';
import { describe, expect, it } from 'vitest';

describe('workout mock data', () => {
  it('defines a 20-exercise catalog across all required categories', () => {
    expect(mockExercises).toHaveLength(20);

    expect(new Set(mockExercises.map((exercise) => exercise.id)).size).toBe(20);
    expect(new Set(mockExercises.map((exercise) => exercise.category))).toEqual(
      new Set(['compound', 'isolation', 'cardio', 'mobility']),
    );
  });

  it('builds three templates with ordered warmup, main, and cooldown sections', () => {
    const exerciseIds = new Set(mockExercises.map((exercise) => exercise.id));

    expect(mockTemplates).toHaveLength(3);

    mockTemplates.forEach((template) => {
      expect(template.sections.map((section) => section.type)).toEqual([
        'warmup',
        'main',
        'cooldown',
      ]);

      const totalExercises = template.sections.reduce(
        (count, section) => count + section.exercises.length,
        0,
      );

      expect(totalExercises).toBeGreaterThanOrEqual(4);
      expect(totalExercises).toBeLessThanOrEqual(8);

      template.sections.forEach((section) => {
        section.exercises.forEach((exercise) => {
          expect(exerciseIds.has(exercise.exerciseId)).toBe(true);
          expect(exercise.tempo).toMatch(/^\d{4}$/);
          expect(exercise.formCues.length).toBeGreaterThan(0);
          expect(exercise.badges.length).toBeGreaterThan(0);
        });
      });
    });
  });

  it('creates completed sessions with linked templates, logged sets, and feedback', () => {
    const templateIds = new Set(mockTemplates.map((template) => template.id));
    const exerciseIds = new Set(mockExercises.map((exercise) => exercise.id));

    expect(mockSessions).toHaveLength(5);

    mockSessions.forEach((session) => {
      expect(session.status).toBe('completed');
      expect(templateIds.has(session.templateId)).toBe(true);
      expect(session.completedAt).toBeDefined();
      expect(session.duration).toBeGreaterThan(0);
      expect(session.feedback).toBeDefined();

      if (!session.feedback || !session.completedAt) {
        throw new Error('Completed workout mock sessions must include feedback and completedAt');
      }

      expect(session.feedback.energy).toBeGreaterThanOrEqual(1);
      expect(session.feedback.energy).toBeLessThanOrEqual(5);
      expect(session.feedback.recovery).toBeGreaterThanOrEqual(1);
      expect(session.feedback.recovery).toBeLessThanOrEqual(5);
      expect(session.feedback.technique).toBeGreaterThanOrEqual(1);
      expect(session.feedback.technique).toBeLessThanOrEqual(5);

      session.exercises.forEach((exerciseLog) => {
        expect(exerciseIds.has(exerciseLog.exerciseId)).toBe(true);
        expect(exerciseLog.sets.length).toBeGreaterThan(0);

        exerciseLog.sets.forEach((set, index) => {
          expect(set.setNumber).toBe(index + 1);
          expect(set.completed).toBe(true);
        });
      });
    });
  });

  it('generates a seven-day current-week schedule with valid workout links', () => {
    const templateIds = new Set(mockTemplates.map((template) => template.id));
    const sessionIds = new Set(mockSessions.map((session) => session.id));

    expect(mockSchedule).toHaveLength(7);
    expect(mockSchedule.map((entry) => entry.dayOfWeek)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);

    mockSchedule.forEach((entry, index) => {
      if (index > 0) {
        const previous = new Date(mockSchedule[index - 1]?.date ?? '');
        const current = new Date(entry.date);

        expect(current.getTime() - previous.getTime()).toBe(86_400_000);
      }

      if (entry.templateId) {
        expect(templateIds.has(entry.templateId)).toBe(true);
        expect(entry.templateName).not.toBeNull();
      } else {
        expect(entry.status).toBe('rest');
      }

      if (entry.sessionId) {
        expect(sessionIds.has(entry.sessionId)).toBe(true);
      }
    });

    expect(mockSchedule.some((entry) => entry.status === 'completed')).toBe(true);
    expect(mockSchedule.some((entry) => entry.status === 'scheduled')).toBe(true);
  });
});
