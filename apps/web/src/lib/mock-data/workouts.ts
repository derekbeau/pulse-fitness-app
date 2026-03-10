import { addDays, startOfWeek, toDateKey } from '@/lib/date-utils';
import type { ExerciseTrackingType } from '@pulse/shared';

export type WorkoutExerciseCategory = 'compound' | 'isolation' | 'cardio' | 'mobility';

export type WorkoutBadgeType =
  | 'compound'
  | 'isolation'
  | 'push'
  | 'pull'
  | 'legs'
  | 'cardio'
  | 'mobility';

export type WorkoutTemplateSectionType = 'warmup' | 'main' | 'cooldown';

export type WorkoutSessionStatus = 'scheduled' | 'in-progress' | 'completed';

export type WorkoutScheduleStatus = 'rest' | 'scheduled' | 'completed';

export type WorkoutDayOfWeek =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export type WorkoutFeedbackScore = 1 | 2 | 3 | 4 | 5;

export interface WorkoutExercise {
  id: string;
  name: string;
  muscleGroups: string[];
  equipment: string;
  category: WorkoutExerciseCategory;
  trackingType?: ExerciseTrackingType;
}

export interface WorkoutTemplateExercise {
  exerciseId: WorkoutExercise['id'];
  exerciseName?: string;
  sets: number;
  reps: string;
  tempo: string;
  restSeconds: number;
  formCues: string[];
  badges: WorkoutBadgeType[];
}

export interface WorkoutTemplateSection {
  type: WorkoutTemplateSectionType;
  title: string;
  exercises: WorkoutTemplateExercise[];
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  sections: WorkoutTemplateSection[];
}

export interface WorkoutLoggedSet {
  setNumber: number;
  weight?: number;
  reps: number;
  seconds?: number;
  distance?: number;
  completed: boolean;
  timestamp: string;
}

export interface WorkoutSessionExerciseLog {
  exerciseId: WorkoutExercise['id'];
  sets: WorkoutLoggedSet[];
}

export interface WorkoutSessionFeedback {
  energy: WorkoutFeedbackScore;
  recovery: WorkoutFeedbackScore;
  technique: WorkoutFeedbackScore;
  notes?: string;
}

export interface WorkoutSession {
  id: string;
  templateId: WorkoutTemplate['id'];
  status: WorkoutSessionStatus;
  startedAt: string;
  completedAt?: string;
  duration: number;
  exercises: WorkoutSessionExerciseLog[];
  feedback?: WorkoutSessionFeedback;
}

export interface WorkoutScheduleEntry {
  date: string;
  dayOfWeek: WorkoutDayOfWeek;
  templateId: WorkoutTemplate['id'] | null;
  templateName: string | null;
  status: WorkoutScheduleStatus;
  sessionId?: WorkoutSession['id'];
  notes?: string;
}

interface LoggedSetInput {
  offsetMinutes: number;
  reps: number;
  weight?: number;
  completed?: boolean;
}

const DAY_NAMES: WorkoutDayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const mockExercises: WorkoutExercise[] = [
  {
    id: 'barbell-bench-press',
    name: 'Barbell Bench Press',
    muscleGroups: ['chest', 'triceps', 'front delts'],
    equipment: 'barbell',
    category: 'compound',
  },
  {
    id: 'incline-dumbbell-press',
    name: 'Incline Dumbbell Press',
    muscleGroups: ['upper chest', 'front delts', 'triceps'],
    equipment: 'dumbbells',
    category: 'compound',
  },
  {
    id: 'seated-dumbbell-shoulder-press',
    name: 'Seated Dumbbell Shoulder Press',
    muscleGroups: ['shoulders', 'triceps'],
    equipment: 'dumbbells',
    category: 'compound',
  },
  {
    id: 'cable-lateral-raise',
    name: 'Cable Lateral Raise',
    muscleGroups: ['lateral delts'],
    equipment: 'cable machine',
    category: 'isolation',
  },
  {
    id: 'rope-triceps-pushdown',
    name: 'Rope Triceps Pushdown',
    muscleGroups: ['triceps'],
    equipment: 'cable machine',
    category: 'isolation',
  },
  {
    id: 'goblet-squat',
    name: 'Goblet Squat',
    muscleGroups: ['quads', 'glutes', 'core'],
    equipment: 'kettlebell',
    category: 'compound',
  },
  {
    id: 'high-bar-back-squat',
    name: 'High-Bar Back Squat',
    muscleGroups: ['quads', 'glutes', 'core'],
    equipment: 'barbell',
    category: 'compound',
  },
  {
    id: 'bulgarian-split-squat',
    name: 'Bulgarian Split Squat',
    muscleGroups: ['quads', 'glutes', 'adductors'],
    equipment: 'dumbbells',
    category: 'compound',
  },
  {
    id: 'leg-press',
    name: 'Leg Press',
    muscleGroups: ['quads', 'glutes'],
    equipment: 'leg press machine',
    category: 'compound',
  },
  {
    id: 'leg-extension',
    name: 'Leg Extension',
    muscleGroups: ['quads'],
    equipment: 'leg extension machine',
    category: 'isolation',
  },
  {
    id: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    muscleGroups: ['hamstrings', 'glutes', 'spinal erectors'],
    equipment: 'barbell',
    category: 'compound',
  },
  {
    id: 'walking-lunge',
    name: 'Walking Lunge',
    muscleGroups: ['quads', 'glutes', 'adductors'],
    equipment: 'dumbbells',
    category: 'compound',
  },
  {
    id: 'lat-pulldown',
    name: 'Lat Pulldown',
    muscleGroups: ['lats', 'biceps', 'upper back'],
    equipment: 'cable machine',
    category: 'compound',
  },
  {
    id: 'chest-supported-row',
    name: 'Chest-Supported Row',
    muscleGroups: ['upper back', 'lats', 'rear delts'],
    equipment: 'plate-loaded machine',
    category: 'compound',
  },
  {
    id: 'air-bike',
    name: 'Air Bike',
    muscleGroups: ['conditioning', 'quads', 'glutes'],
    equipment: 'air bike',
    category: 'cardio',
    trackingType: 'cardio',
  },
  {
    id: 'row-erg',
    name: 'Row Erg',
    muscleGroups: ['conditioning', 'lats', 'legs'],
    equipment: 'rower',
    category: 'cardio',
    trackingType: 'cardio',
  },
  {
    id: 'jump-rope',
    name: 'Jump Rope',
    muscleGroups: ['calves', 'conditioning', 'coordination'],
    equipment: 'jump rope',
    category: 'cardio',
    trackingType: 'seconds_only',
  },
  {
    id: 'worlds-greatest-stretch',
    name: "World's Greatest Stretch",
    muscleGroups: ['hips', 'hamstrings', 'thoracic spine'],
    equipment: 'bodyweight',
    category: 'mobility',
    trackingType: 'reps_only',
  },
  {
    id: 'banded-shoulder-external-rotation',
    name: 'Banded Shoulder External Rotation',
    muscleGroups: ['rotator cuff', 'rear delts'],
    equipment: 'resistance band',
    category: 'mobility',
    trackingType: 'reps_only',
  },
  {
    id: 'couch-stretch',
    name: 'Couch Stretch',
    muscleGroups: ['quads', 'hip flexors'],
    equipment: 'bench or wall',
    category: 'mobility',
    trackingType: 'seconds_only',
  },
];

export const mockTemplates: WorkoutTemplate[] = [
  {
    id: 'upper-push',
    name: 'Upper Push',
    description: 'Chest, shoulders, and triceps emphasis with controlled tempo work.',
    tags: ['strength', 'push', 'upper-body'],
    sections: [
      {
        type: 'warmup',
        title: 'Warm-Up',
        exercises: [
          {
            exerciseId: 'row-erg',
            sets: 1,
            reps: '4 min',
            tempo: '1111',
            restSeconds: 30,
            formCues: ['Build heat without sprinting', 'Finish breathing through the nose'],
            badges: ['cardio'],
          },
          {
            exerciseId: 'banded-shoulder-external-rotation',
            sets: 2,
            reps: '12/side',
            tempo: '2111',
            restSeconds: 30,
            formCues: ['Keep elbow pinned', 'Rotate only through the shoulder'],
            badges: ['mobility', 'push'],
          },
        ],
      },
      {
        type: 'main',
        title: 'Main Work',
        exercises: [
          {
            exerciseId: 'incline-dumbbell-press',
            sets: 3,
            reps: '8-10',
            tempo: '3110',
            restSeconds: 90,
            formCues: ['Drive feet into the floor', 'Keep wrists stacked over elbows'],
            badges: ['compound', 'push'],
          },
          {
            exerciseId: 'seated-dumbbell-shoulder-press',
            sets: 3,
            reps: '8-10',
            tempo: '2110',
            restSeconds: 90,
            formCues: ['Brace before each press', 'Finish with biceps by the ears'],
            badges: ['compound', 'push'],
          },
          {
            exerciseId: 'cable-lateral-raise',
            sets: 3,
            reps: '12-15',
            tempo: '2111',
            restSeconds: 60,
            formCues: ['Lead with elbows', 'Stop when shoulders stay quiet'],
            badges: ['isolation', 'push'],
          },
          {
            exerciseId: 'rope-triceps-pushdown',
            sets: 3,
            reps: '10-12',
            tempo: '2111',
            restSeconds: 60,
            formCues: ['Pin elbows to ribs', 'Split the rope hard at lockout'],
            badges: ['isolation', 'push'],
          },
        ],
      },
      {
        type: 'cooldown',
        title: 'Cooldown',
        exercises: [
          {
            exerciseId: 'couch-stretch',
            sets: 2,
            reps: '45 sec/side',
            tempo: '2222',
            restSeconds: 20,
            formCues: ['Stay tall through the torso', 'Squeeze the glute of the back leg'],
            badges: ['mobility'],
          },
        ],
      },
    ],
  },
  {
    id: 'lower-quad-dominant',
    name: 'Lower Quad-Dominant',
    description:
      'Quad-focused lower session with bilateral work first and single-leg volume second.',
    tags: ['strength', 'legs', 'lower-body'],
    sections: [
      {
        type: 'warmup',
        title: 'Warm-Up',
        exercises: [
          {
            exerciseId: 'air-bike',
            sets: 1,
            reps: '5 min',
            tempo: '1111',
            restSeconds: 30,
            formCues: ['Build cadence gradually', 'Keep the first minute conversational'],
            badges: ['cardio'],
          },
          {
            exerciseId: 'worlds-greatest-stretch',
            sets: 2,
            reps: '5/side',
            tempo: '2122',
            restSeconds: 30,
            formCues: ['Reach long through the front knee', 'Rotate from the mid-back'],
            badges: ['mobility', 'legs'],
          },
        ],
      },
      {
        type: 'main',
        title: 'Main Work',
        exercises: [
          {
            exerciseId: 'high-bar-back-squat',
            sets: 4,
            reps: '5-6',
            tempo: '3110',
            restSeconds: 150,
            formCues: ['Sit between the hips', 'Keep chest tall out of the hole'],
            badges: ['compound', 'legs'],
          },
          {
            exerciseId: 'leg-press',
            sets: 3,
            reps: '10-12',
            tempo: '3110',
            restSeconds: 90,
            formCues: ['Control the bottom range', 'Drive through mid-foot'],
            badges: ['compound', 'legs'],
          },
          {
            exerciseId: 'bulgarian-split-squat',
            sets: 3,
            reps: '8/side',
            tempo: '3010',
            restSeconds: 75,
            formCues: ['Let the front knee travel forward', 'Stay heavy on the front leg'],
            badges: ['compound', 'legs'],
          },
          {
            exerciseId: 'leg-extension',
            sets: 3,
            reps: '12-15',
            tempo: '2111',
            restSeconds: 60,
            formCues: ['Pause at the top', 'Lower without bouncing the stack'],
            badges: ['isolation', 'legs'],
          },
        ],
      },
      {
        type: 'cooldown',
        title: 'Cooldown',
        exercises: [
          {
            exerciseId: 'couch-stretch',
            sets: 2,
            reps: '60 sec/side',
            tempo: '2222',
            restSeconds: 20,
            formCues: ['Posteriorly tilt the pelvis', 'Keep ribs stacked over hips'],
            badges: ['mobility', 'legs'],
          },
        ],
      },
    ],
  },
  {
    id: 'full-body',
    name: 'Full Body',
    description: 'Balanced full-body session with squat, hinge, push, and pull coverage.',
    tags: ['strength', 'full-body', 'general-fitness'],
    sections: [
      {
        type: 'warmup',
        title: 'Warm-Up',
        exercises: [
          {
            exerciseId: 'jump-rope',
            sets: 1,
            reps: '3 min',
            tempo: '1111',
            restSeconds: 30,
            formCues: ['Stay light through the ankles', 'Keep shoulders relaxed'],
            badges: ['cardio'],
          },
          {
            exerciseId: 'worlds-greatest-stretch',
            sets: 1,
            reps: '6/side',
            tempo: '2122',
            restSeconds: 30,
            formCues: ['Exhale into the rotation', 'Reach the back heel long'],
            badges: ['mobility'],
          },
        ],
      },
      {
        type: 'main',
        title: 'Main Work',
        exercises: [
          {
            exerciseId: 'goblet-squat',
            sets: 3,
            reps: '10',
            tempo: '3110',
            restSeconds: 75,
            formCues: ['Use elbows to pry the knees out', 'Own the bottom position'],
            badges: ['compound', 'legs'],
          },
          {
            exerciseId: 'barbell-bench-press',
            sets: 4,
            reps: '6-8',
            tempo: '2110',
            restSeconds: 120,
            formCues: ['Pull shoulder blades into the bench', 'Press back toward the rack'],
            badges: ['compound', 'push'],
          },
          {
            exerciseId: 'romanian-deadlift',
            sets: 3,
            reps: '8',
            tempo: '3110',
            restSeconds: 120,
            formCues: ['Reach hips back first', 'Keep the bar glued to the legs'],
            badges: ['compound', 'legs', 'pull'],
          },
          {
            exerciseId: 'lat-pulldown',
            sets: 3,
            reps: '10-12',
            tempo: '2111',
            restSeconds: 75,
            formCues: ['Lead with elbows', 'Finish with upper arms by the ribs'],
            badges: ['compound', 'pull'],
          },
        ],
      },
      {
        type: 'cooldown',
        title: 'Cooldown',
        exercises: [
          {
            exerciseId: 'couch-stretch',
            sets: 1,
            reps: '60 sec/side',
            tempo: '2222',
            restSeconds: 20,
            formCues: ['Breathe slowly through the nose', 'Do not arch the lower back'],
            badges: ['mobility'],
          },
        ],
      },
    ],
  },
];

const currentWeekMonday = startOfWeek(new Date());
const twoWeeksAgoMonday = addDays(currentWeekMonday, -14);
const oneWeekAgoMonday = addDays(currentWeekMonday, -7);

const upperPushTwoWeeksAgoDate = toDateKey(addDays(twoWeeksAgoMonday, 1));
const lowerQuadTwoWeeksAgoDate = toDateKey(addDays(twoWeeksAgoMonday, 3));
const fullBodyOneWeekAgoDate = toDateKey(addDays(oneWeekAgoMonday, 1));
const upperPushCurrentWeekDate = toDateKey(currentWeekMonday);
const lowerQuadCurrentWeekDate = toDateKey(addDays(currentWeekMonday, 2));

export const mockSessions: WorkoutSession[] = [
  createCompletedSession({
    date: upperPushTwoWeeksAgoDate,
    templateId: 'upper-push',
    startedAtTime: '18:05:00Z',
    completedAtTime: '19:10:00Z',
    duration: 65,
    exercises: [
      exerciseLog(upperPushTwoWeeksAgoDate, 'row-erg', '18:07:00Z', [
        { offsetMinutes: 0, reps: 240 },
      ]),
      exerciseLog(upperPushTwoWeeksAgoDate, 'banded-shoulder-external-rotation', '18:12:00Z', [
        { offsetMinutes: 0, reps: 12 },
        { offsetMinutes: 2, reps: 12 },
      ]),
      exerciseLog(upperPushTwoWeeksAgoDate, 'incline-dumbbell-press', '18:20:00Z', [
        { offsetMinutes: 0, reps: 10, weight: 22.5 },
        { offsetMinutes: 4, reps: 9, weight: 22.5 },
        { offsetMinutes: 8, reps: 8, weight: 22.5 },
      ]),
      exerciseLog(upperPushTwoWeeksAgoDate, 'seated-dumbbell-shoulder-press', '18:34:00Z', [
        { offsetMinutes: 0, reps: 10, weight: 17.5 },
        { offsetMinutes: 4, reps: 10, weight: 17.5 },
        { offsetMinutes: 8, reps: 9, weight: 17.5 },
      ]),
      exerciseLog(upperPushTwoWeeksAgoDate, 'cable-lateral-raise', '18:48:00Z', [
        { offsetMinutes: 0, reps: 14, weight: 7.5 },
        { offsetMinutes: 3, reps: 13, weight: 7.5 },
        { offsetMinutes: 6, reps: 12, weight: 7.5 },
      ]),
      exerciseLog(upperPushTwoWeeksAgoDate, 'rope-triceps-pushdown', '18:58:00Z', [
        { offsetMinutes: 0, reps: 12, weight: 20 },
        { offsetMinutes: 3, reps: 11, weight: 20 },
        { offsetMinutes: 6, reps: 10, weight: 20 },
      ]),
      exerciseLog(upperPushTwoWeeksAgoDate, 'couch-stretch', '19:07:00Z', [
        { offsetMinutes: 0, reps: 45 },
        { offsetMinutes: 2, reps: 45 },
      ]),
    ],
    feedback: {
      energy: 4,
      recovery: 4,
      technique: 4,
      notes: 'Pressing felt smooth once shoulders were warm.',
    },
  }),
  createCompletedSession({
    date: lowerQuadTwoWeeksAgoDate,
    templateId: 'lower-quad-dominant',
    startedAtTime: '17:40:00Z',
    completedAtTime: '18:55:00Z',
    duration: 75,
    exercises: [
      exerciseLog(lowerQuadTwoWeeksAgoDate, 'air-bike', '17:42:00Z', [
        { offsetMinutes: 0, reps: 300 },
      ]),
      exerciseLog(lowerQuadTwoWeeksAgoDate, 'worlds-greatest-stretch', '17:48:00Z', [
        { offsetMinutes: 0, reps: 5 },
        { offsetMinutes: 3, reps: 5 },
      ]),
      exerciseLog(lowerQuadTwoWeeksAgoDate, 'high-bar-back-squat', '17:58:00Z', [
        { offsetMinutes: 0, reps: 6, weight: 80 },
        { offsetMinutes: 5, reps: 6, weight: 80 },
        { offsetMinutes: 10, reps: 5, weight: 82.5 },
        { offsetMinutes: 15, reps: 5, weight: 82.5 },
      ]),
      exerciseLog(lowerQuadTwoWeeksAgoDate, 'leg-press', '18:20:00Z', [
        { offsetMinutes: 0, reps: 12, weight: 140 },
        { offsetMinutes: 4, reps: 11, weight: 140 },
        { offsetMinutes: 8, reps: 10, weight: 145 },
      ]),
      exerciseLog(lowerQuadTwoWeeksAgoDate, 'bulgarian-split-squat', '18:34:00Z', [
        { offsetMinutes: 0, reps: 8, weight: 16 },
        { offsetMinutes: 4, reps: 8, weight: 16 },
        { offsetMinutes: 8, reps: 8, weight: 16 },
      ]),
      exerciseLog(lowerQuadTwoWeeksAgoDate, 'leg-extension', '18:48:00Z', [
        { offsetMinutes: 0, reps: 15, weight: 36 },
        { offsetMinutes: 3, reps: 14, weight: 36 },
        { offsetMinutes: 6, reps: 13, weight: 36 },
      ]),
      exerciseLog(lowerQuadTwoWeeksAgoDate, 'couch-stretch', '18:53:00Z', [
        { offsetMinutes: 0, reps: 60 },
        { offsetMinutes: 2, reps: 60 },
      ]),
    ],
    feedback: {
      energy: 3,
      recovery: 3,
      technique: 4,
      notes: 'Squats moved well, but quads were already taxed from the last block.',
    },
  }),
  createCompletedSession({
    date: fullBodyOneWeekAgoDate,
    templateId: 'full-body',
    startedAtTime: '18:15:00Z',
    completedAtTime: '19:25:00Z',
    duration: 70,
    exercises: [
      exerciseLog(fullBodyOneWeekAgoDate, 'jump-rope', '18:17:00Z', [
        { offsetMinutes: 0, reps: 180 },
      ]),
      exerciseLog(fullBodyOneWeekAgoDate, 'worlds-greatest-stretch', '18:21:00Z', [
        { offsetMinutes: 0, reps: 6 },
      ]),
      exerciseLog(fullBodyOneWeekAgoDate, 'goblet-squat', '18:28:00Z', [
        { offsetMinutes: 0, reps: 10, weight: 28 },
        { offsetMinutes: 4, reps: 10, weight: 28 },
        { offsetMinutes: 8, reps: 10, weight: 28 },
      ]),
      exerciseLog(fullBodyOneWeekAgoDate, 'barbell-bench-press', '18:42:00Z', [
        { offsetMinutes: 0, reps: 8, weight: 57.5 },
        { offsetMinutes: 5, reps: 8, weight: 57.5 },
        { offsetMinutes: 10, reps: 7, weight: 60 },
        { offsetMinutes: 15, reps: 6, weight: 60 },
      ]),
      exerciseLog(fullBodyOneWeekAgoDate, 'romanian-deadlift', '19:02:00Z', [
        { offsetMinutes: 0, reps: 8, weight: 75 },
        { offsetMinutes: 5, reps: 8, weight: 75 },
        { offsetMinutes: 10, reps: 8, weight: 77.5 },
      ]),
      exerciseLog(fullBodyOneWeekAgoDate, 'lat-pulldown', '19:17:00Z', [
        { offsetMinutes: 0, reps: 12, weight: 45 },
        { offsetMinutes: 3, reps: 11, weight: 45 },
        { offsetMinutes: 6, reps: 10, weight: 47.5 },
      ]),
      exerciseLog(fullBodyOneWeekAgoDate, 'couch-stretch', '19:22:00Z', [
        { offsetMinutes: 0, reps: 60 },
      ]),
    ],
    feedback: {
      energy: 4,
      recovery: 5,
      technique: 4,
      notes: 'Bench hit the top end of the range before deadlifts got heavy.',
    },
  }),
  createCompletedSession({
    date: upperPushCurrentWeekDate,
    templateId: 'upper-push',
    startedAtTime: '18:00:00Z',
    completedAtTime: '19:02:00Z',
    duration: 62,
    exercises: [
      exerciseLog(upperPushCurrentWeekDate, 'row-erg', '18:02:00Z', [
        { offsetMinutes: 0, reps: 240 },
      ]),
      exerciseLog(upperPushCurrentWeekDate, 'banded-shoulder-external-rotation', '18:07:00Z', [
        { offsetMinutes: 0, reps: 12 },
        { offsetMinutes: 2, reps: 12 },
      ]),
      exerciseLog(upperPushCurrentWeekDate, 'incline-dumbbell-press', '18:15:00Z', [
        { offsetMinutes: 0, reps: 10, weight: 24 },
        { offsetMinutes: 4, reps: 9, weight: 24 },
        { offsetMinutes: 8, reps: 8, weight: 24 },
      ]),
      exerciseLog(upperPushCurrentWeekDate, 'seated-dumbbell-shoulder-press', '18:28:00Z', [
        { offsetMinutes: 0, reps: 10, weight: 18 },
        { offsetMinutes: 4, reps: 9, weight: 18 },
        { offsetMinutes: 8, reps: 8, weight: 18 },
      ]),
      exerciseLog(upperPushCurrentWeekDate, 'cable-lateral-raise', '18:41:00Z', [
        { offsetMinutes: 0, reps: 15, weight: 8 },
        { offsetMinutes: 3, reps: 14, weight: 8 },
        { offsetMinutes: 6, reps: 13, weight: 8 },
      ]),
      exerciseLog(upperPushCurrentWeekDate, 'rope-triceps-pushdown', '18:50:00Z', [
        { offsetMinutes: 0, reps: 12, weight: 22.5 },
        { offsetMinutes: 3, reps: 11, weight: 22.5 },
        { offsetMinutes: 6, reps: 10, weight: 22.5 },
      ]),
      exerciseLog(upperPushCurrentWeekDate, 'couch-stretch', '18:59:00Z', [
        { offsetMinutes: 0, reps: 45 },
        { offsetMinutes: 2, reps: 45 },
      ]),
    ],
    feedback: {
      energy: 5,
      recovery: 4,
      technique: 4,
      notes: 'Added load to presses without losing tempo.',
    },
  }),
  createCompletedSession({
    date: lowerQuadCurrentWeekDate,
    templateId: 'lower-quad-dominant',
    startedAtTime: '17:50:00Z',
    completedAtTime: '19:07:00Z',
    duration: 77,
    exercises: [
      exerciseLog(lowerQuadCurrentWeekDate, 'air-bike', '17:52:00Z', [
        { offsetMinutes: 0, reps: 300 },
      ]),
      exerciseLog(lowerQuadCurrentWeekDate, 'worlds-greatest-stretch', '17:58:00Z', [
        { offsetMinutes: 0, reps: 5 },
        { offsetMinutes: 3, reps: 5 },
      ]),
      exerciseLog(lowerQuadCurrentWeekDate, 'high-bar-back-squat', '18:08:00Z', [
        { offsetMinutes: 0, reps: 6, weight: 82.5 },
        { offsetMinutes: 5, reps: 6, weight: 82.5 },
        { offsetMinutes: 10, reps: 5, weight: 85 },
        { offsetMinutes: 15, reps: 5, weight: 85 },
      ]),
      exerciseLog(lowerQuadCurrentWeekDate, 'leg-press', '18:30:00Z', [
        { offsetMinutes: 0, reps: 12, weight: 145 },
        { offsetMinutes: 4, reps: 11, weight: 145 },
        { offsetMinutes: 8, reps: 10, weight: 150 },
      ]),
      exerciseLog(lowerQuadCurrentWeekDate, 'bulgarian-split-squat', '18:44:00Z', [
        { offsetMinutes: 0, reps: 8, weight: 18 },
        { offsetMinutes: 4, reps: 8, weight: 18 },
        { offsetMinutes: 8, reps: 8, weight: 18 },
      ]),
      exerciseLog(lowerQuadCurrentWeekDate, 'leg-extension', '18:58:00Z', [
        { offsetMinutes: 0, reps: 15, weight: 38 },
        { offsetMinutes: 3, reps: 14, weight: 38 },
        { offsetMinutes: 6, reps: 13, weight: 38 },
      ]),
      exerciseLog(lowerQuadCurrentWeekDate, 'couch-stretch', '19:03:00Z', [
        { offsetMinutes: 0, reps: 60 },
        { offsetMinutes: 2, reps: 60 },
      ]),
    ],
    feedback: {
      energy: 4,
      recovery: 3,
      technique: 5,
      notes: 'Best squat positions of the block so far.',
    },
  }),
];

export const mockSchedule: WorkoutScheduleEntry[] = DAY_NAMES.map((dayOfWeek, index) => {
  const date = toDateKey(addDays(currentWeekMonday, index));

  switch (index) {
    case 0:
      return {
        date,
        dayOfWeek,
        templateId: 'upper-push',
        templateName: 'Upper Push',
        status: 'completed',
        sessionId: mockSessions[3]?.id,
        notes: 'Completed after work with a pressing focus.',
      };
    case 2:
      return {
        date,
        dayOfWeek,
        templateId: 'lower-quad-dominant',
        templateName: 'Lower Quad-Dominant',
        status: 'completed',
        sessionId: mockSessions[4]?.id,
        notes: 'Quad day completed with squat progression.',
      };
    case 4:
      return {
        date,
        dayOfWeek,
        templateId: 'full-body',
        templateName: 'Full Body',
        status: 'scheduled',
        notes: 'Planned for Friday evening.',
      };
    case 5:
      return {
        date,
        dayOfWeek,
        templateId: 'upper-push',
        templateName: 'Upper Push',
        status: 'scheduled',
        notes: 'Optional lighter repeat if recovery is good.',
      };
    default:
      return {
        date,
        dayOfWeek,
        templateId: null,
        templateName: null,
        status: 'rest',
        notes: 'Recovery, walking, and meals on plan.',
      };
  }
});

function createCompletedSession(input: {
  date: string;
  templateId: WorkoutTemplate['id'];
  startedAtTime: string;
  completedAtTime: string;
  duration: number;
  exercises: WorkoutSessionExerciseLog[];
  feedback: WorkoutSessionFeedback;
}): WorkoutSession {
  return {
    id: `session-${input.templateId}-${input.date}`,
    templateId: input.templateId,
    status: 'completed',
    startedAt: `${input.date}T${input.startedAtTime}`,
    completedAt: `${input.date}T${input.completedAtTime}`,
    duration: input.duration,
    exercises: input.exercises,
    feedback: input.feedback,
  };
}

function exerciseLog(
  date: string,
  exerciseId: WorkoutExercise['id'],
  baseTime: string,
  sets: LoggedSetInput[],
): WorkoutSessionExerciseLog {
  return {
    exerciseId,
    sets: buildLoggedSets(date, baseTime, sets),
  };
}

function buildLoggedSets(
  date: string,
  baseTime: string,
  sets: LoggedSetInput[],
): WorkoutLoggedSet[] {
  const baseDate = new Date(`${date}T${baseTime}`);

  return sets.map((set, index) => ({
    setNumber: index + 1,
    weight: set.weight,
    reps: set.reps,
    completed: set.completed ?? true,
    timestamp: new Date(baseDate.getTime() + set.offsetMinutes * 60_000).toISOString(),
  }));
}
