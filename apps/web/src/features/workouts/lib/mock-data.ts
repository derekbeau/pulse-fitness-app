import type { ExerciseCategory, WorkoutSessionFeedback } from '@pulse/shared';

import type {
  ActiveWorkoutCompletedSession,
  ActiveWorkoutCustomFeedbackField,
  ActiveWorkoutEnhancedExercise,
  ActiveWorkoutExerciseHistory,
  ActiveWorkoutLastPerformance,
  ActiveWorkoutSessionContext,
  WorkoutBadgeType,
} from '../types';
import { startCase } from './start-case';
import { resolveTrackingType } from './tracking';

type CompletedSessionInput = {
  customFeedback: ActiveWorkoutCustomFeedbackField[];
  date: string;
  duration: number;
  exercises: Array<{
    exerciseId: string;
    sets: Array<{
      reps: number;
      setNumber: number;
      time: string;
      weight?: number;
    }>;
  }>;
  feedback: WorkoutSessionFeedback;
  name: string;
  notes: string;
  startedAtTime: string;
  templateId: string;
};

type ExerciseCatalogEntry = {
  category: ExerciseCategory;
  name: string;
};

type TemplateExerciseCatalogEntry = {
  badges: WorkoutBadgeType[];
  reps: string;
  restSeconds: number;
  sets: number;
  tempo: string;
};

const exerciseCatalog = new Map<string, ExerciseCatalogEntry>([
  ['row-erg', { category: 'cardio', name: 'Row Erg' }],
  [
    'banded-shoulder-external-rotation',
    { category: 'mobility', name: 'Banded Shoulder External Rotation' },
  ],
  ['incline-dumbbell-press', { category: 'compound', name: 'Incline Dumbbell Press' }],
  [
    'seated-dumbbell-shoulder-press',
    { category: 'compound', name: 'Seated Dumbbell Shoulder Press' },
  ],
  ['cable-lateral-raise', { category: 'isolation', name: 'Cable Lateral Raise' }],
  ['rope-triceps-pushdown', { category: 'isolation', name: 'Rope Triceps Pushdown' }],
  ['face-pull', { category: 'isolation', name: 'Face Pull' }],
  ['air-bike', { category: 'cardio', name: 'Air Bike' }],
  ["worlds-greatest-stretch", { category: 'mobility', name: "World's Greatest Stretch" }],
  ['high-bar-back-squat', { category: 'compound', name: 'High-Bar Back Squat' }],
  ['leg-press', { category: 'compound', name: 'Leg Press' }],
  ['bulgarian-split-squat', { category: 'compound', name: 'Bulgarian Split Squat' }],
  ['leg-extension', { category: 'isolation', name: 'Leg Extension' }],
  ['jump-rope', { category: 'cardio', name: 'Jump Rope' }],
  ['goblet-squat', { category: 'compound', name: 'Goblet Squat' }],
  ['barbell-bench-press', { category: 'compound', name: 'Barbell Bench Press' }],
  ['romanian-deadlift', { category: 'compound', name: 'Romanian Deadlift' }],
  ['lat-pulldown', { category: 'compound', name: 'Lat Pulldown' }],
  ['couch-stretch', { category: 'mobility', name: 'Couch Stretch' }],
]);

const templateExerciseCatalog = new Map<string, TemplateExerciseCatalogEntry>([
  [
    'row-erg',
    { badges: ['cardio'], reps: '4 min', restSeconds: 30, sets: 1, tempo: '1111' },
  ],
  [
    'banded-shoulder-external-rotation',
    {
      badges: ['mobility', 'push'],
      reps: '12/side',
      restSeconds: 30,
      sets: 2,
      tempo: '2111',
    },
  ],
  [
    'incline-dumbbell-press',
    { badges: ['compound', 'push'], reps: '8-10', restSeconds: 90, sets: 3, tempo: '3110' },
  ],
  [
    'seated-dumbbell-shoulder-press',
    { badges: ['compound', 'push'], reps: '8-10', restSeconds: 90, sets: 3, tempo: '2110' },
  ],
  [
    'cable-lateral-raise',
    { badges: ['isolation', 'push'], reps: '12-15', restSeconds: 60, sets: 3, tempo: '2011' },
  ],
  [
    'rope-triceps-pushdown',
    { badges: ['isolation', 'push'], reps: '10-12', restSeconds: 60, sets: 3, tempo: '2011' },
  ],
]);

export const workoutSessionContext: ActiveWorkoutSessionContext = {
  recentSessions: [
    {
      id: 'session-upper-push-2026-03-02',
      name: 'Upper Push',
      date: '2026-03-02',
      volume: 7385,
    },
    {
      id: 'session-lower-quad-dominant-2026-02-27',
      name: 'Lower Quad-Dominant',
      date: '2026-02-27',
      volume: 12890,
    },
    {
      id: 'session-full-body-2026-02-24',
      name: 'Full Body',
      date: '2026-02-24',
      volume: 11060,
    },
  ],
  sleepStatus: 'good',
  activeInjuries: [
    {
      id: 'left-shoulder-slap-tear',
      label: 'Left shoulder SLAP tear',
      affectedExerciseIds: [
        'incline-dumbbell-press',
        'seated-dumbbell-shoulder-press',
        'rope-triceps-pushdown',
      ],
      cues: [
        'Stay 1-2 reps shy of pain escalation on overhead work.',
        'Use a neutral grip when pressing if the front shoulder feels pinchy.',
        'Skip the final press set if instability shows up during the eccentric.',
      ],
    },
    {
      id: 'right-patellar-tendon',
      label: 'Right patellar tendon irritation',
      affectedExerciseIds: ['high-bar-back-squat', 'leg-press', 'bulgarian-split-squat'],
      cues: [
        'Use a controlled 3-second eccentric before adding load.',
        'Keep reverse sled or tibialis work in the supplemental block.',
      ],
    },
  ],
  trainingPhaseLabel: 'Accumulation Block 2 - Rebuild',
};

export const workoutFeedbackFields: ActiveWorkoutCustomFeedbackField[] = [
  {
    id: 'shoulder-feel',
    label: 'Shoulder feel',
    type: 'scale',
    min: 1,
    max: 5,
    value: null,
    notes: '',
  },
  {
    id: 'session-note',
    label: 'Coach note',
    optional: true,
    type: 'text',
    value: '',
    notes: '',
  },
];

export const workoutCompletedSessions: ActiveWorkoutCompletedSession[] = [
  createCompletedSession({
    date: '2026-03-02',
    duration: 68,
    name: 'Upper Push',
    notes:
      'Incline press hit the 50s for a clean top set. Shoulder stayed calm by keeping elbows 30 degrees tucked.',
    startedAtTime: '18:06:00Z',
    templateId: 'upper-push',
    exercises: [
      {
        exerciseId: 'row-erg',
        sets: [{ setNumber: 1, reps: 240, time: '18:08:00Z' }],
      },
      {
        exerciseId: 'banded-shoulder-external-rotation',
        sets: [
          { setNumber: 1, reps: 12, time: '18:13:00Z' },
          { setNumber: 2, reps: 12, time: '18:15:00Z' },
        ],
      },
      {
        exerciseId: 'incline-dumbbell-press',
        sets: [
          { setNumber: 1, reps: 12, weight: 50, time: '18:24:00Z' },
          { setNumber: 2, reps: 10, weight: 45, time: '18:28:00Z' },
          { setNumber: 3, reps: 9, weight: 40, time: '18:32:00Z' },
        ],
      },
      {
        exerciseId: 'seated-dumbbell-shoulder-press',
        sets: [
          { setNumber: 1, reps: 10, weight: 35, time: '18:40:00Z' },
          { setNumber: 2, reps: 9, weight: 30, time: '18:44:00Z' },
          { setNumber: 3, reps: 8, weight: 25, time: '18:48:00Z' },
        ],
      },
      {
        exerciseId: 'cable-lateral-raise',
        sets: [
          { setNumber: 1, reps: 15, weight: 15, time: '18:55:00Z' },
          { setNumber: 2, reps: 14, weight: 12.5, time: '18:58:00Z' },
          { setNumber: 3, reps: 13, weight: 10, time: '19:01:00Z' },
        ],
      },
      {
        exerciseId: 'rope-triceps-pushdown',
        sets: [
          { setNumber: 1, reps: 12, weight: 42.5, time: '19:06:00Z' },
          { setNumber: 2, reps: 11, weight: 37.5, time: '19:09:00Z' },
          { setNumber: 3, reps: 10, weight: 32.5, time: '19:12:00Z' },
        ],
      },
      {
        exerciseId: 'face-pull',
        sets: [
          { setNumber: 1, reps: 15, weight: 25, time: '19:16:00Z' },
          { setNumber: 2, reps: 15, weight: 25, time: '19:19:00Z' },
          { setNumber: 3, reps: 14, weight: 20, time: '19:22:00Z' },
        ],
      },
    ],
    feedback: {
      energy: 4,
      recovery: 4,
      technique: 5,
      notes: 'Best pressing session since the shoulder flare settled down.',
    },
    customFeedback: [
      {
        id: 'shoulder-feel',
        label: 'Shoulder feel',
        type: 'scale',
        min: 1,
        max: 5,
        value: 4,
        notes: 'Mild awareness only on the final overhead set.',
      },
      {
        id: 'energy-post',
        label: 'Energy post workout',
        type: 'scale',
        min: 1,
        max: 5,
        value: 4,
      },
      {
        id: 'session-note',
        label: 'Coach note',
        type: 'text',
        value: 'Top set on incline can move to 52.5s if warm-up stays pain-free.',
      },
    ],
  }),
  createCompletedSession({
    date: '2026-02-27',
    duration: 79,
    name: 'Lower Quad-Dominant',
    notes:
      'Squat depth stayed consistent. Patellar tendon felt better after tibialis raises and reverse sled drags.',
    startedAtTime: '17:52:00Z',
    templateId: 'lower-quad-dominant',
    exercises: [
      {
        exerciseId: 'air-bike',
        sets: [{ setNumber: 1, reps: 300, time: '17:54:00Z' }],
      },
      {
        exerciseId: 'worlds-greatest-stretch',
        sets: [
          { setNumber: 1, reps: 5, time: '18:00:00Z' },
          { setNumber: 2, reps: 5, time: '18:03:00Z' },
        ],
      },
      {
        exerciseId: 'high-bar-back-squat',
        sets: [
          { setNumber: 1, reps: 6, weight: 205, time: '18:12:00Z' },
          { setNumber: 2, reps: 6, weight: 195, time: '18:17:00Z' },
          { setNumber: 3, reps: 5, weight: 185, time: '18:22:00Z' },
          { setNumber: 4, reps: 5, weight: 175, time: '18:27:00Z' },
        ],
      },
      {
        exerciseId: 'leg-press',
        sets: [
          { setNumber: 1, reps: 12, weight: 270, time: '18:37:00Z' },
          { setNumber: 2, reps: 11, weight: 250, time: '18:41:00Z' },
          { setNumber: 3, reps: 10, weight: 230, time: '18:45:00Z' },
        ],
      },
      {
        exerciseId: 'bulgarian-split-squat',
        sets: [
          { setNumber: 1, reps: 8, weight: 35, time: '18:54:00Z' },
          { setNumber: 2, reps: 8, weight: 30, time: '18:58:00Z' },
          { setNumber: 3, reps: 8, weight: 25, time: '19:02:00Z' },
        ],
      },
      {
        exerciseId: 'leg-extension',
        sets: [
          { setNumber: 1, reps: 15, weight: 95, time: '19:08:00Z' },
          { setNumber: 2, reps: 14, weight: 85, time: '19:11:00Z' },
          { setNumber: 3, reps: 13, weight: 75, time: '19:14:00Z' },
        ],
      },
    ],
    feedback: {
      energy: 4,
      recovery: 3,
      technique: 4,
      notes: 'Knee tolerated deep flexion better than last week.',
    },
    customFeedback: [
      {
        id: 'knee-pain',
        label: 'Knee pain',
        type: 'scale',
        min: 1,
        max: 5,
        value: 2,
        notes: 'Only noticeable on the first squat warm-up set.',
      },
      {
        id: 'energy-post',
        label: 'Energy post workout',
        type: 'scale',
        min: 1,
        max: 5,
        value: 3,
      },
    ],
  }),
  createCompletedSession({
    date: '2026-02-24',
    duration: 73,
    name: 'Full Body',
    notes: 'Bench and RDL both moved cleanly. Grip started to fade on the third hinge set.',
    startedAtTime: '18:10:00Z',
    templateId: 'full-body',
    exercises: [
      {
        exerciseId: 'jump-rope',
        sets: [{ setNumber: 1, reps: 180, time: '18:12:00Z' }],
      },
      {
        exerciseId: 'worlds-greatest-stretch',
        sets: [{ setNumber: 1, reps: 6, time: '18:17:00Z' }],
      },
      {
        exerciseId: 'goblet-squat',
        sets: [
          { setNumber: 1, reps: 10, weight: 70, time: '18:25:00Z' },
          { setNumber: 2, reps: 10, weight: 70, time: '18:29:00Z' },
          { setNumber: 3, reps: 10, weight: 70, time: '18:33:00Z' },
        ],
      },
      {
        exerciseId: 'barbell-bench-press',
        sets: [
          { setNumber: 1, reps: 8, weight: 145, time: '18:43:00Z' },
          { setNumber: 2, reps: 8, weight: 145, time: '18:48:00Z' },
          { setNumber: 3, reps: 7, weight: 150, time: '18:53:00Z' },
          { setNumber: 4, reps: 6, weight: 150, time: '18:58:00Z' },
        ],
      },
      {
        exerciseId: 'romanian-deadlift',
        sets: [
          { setNumber: 1, reps: 8, weight: 185, time: '19:08:00Z' },
          { setNumber: 2, reps: 8, weight: 185, time: '19:13:00Z' },
          { setNumber: 3, reps: 8, weight: 195, time: '19:18:00Z' },
        ],
      },
      {
        exerciseId: 'lat-pulldown',
        sets: [
          { setNumber: 1, reps: 12, weight: 130, time: '19:25:00Z' },
          { setNumber: 2, reps: 11, weight: 120, time: '19:28:00Z' },
          { setNumber: 3, reps: 10, weight: 110, time: '19:31:00Z' },
        ],
      },
    ],
    feedback: {
      energy: 4,
      recovery: 5,
      technique: 4,
      notes: 'Good full-body rhythm. Slight grip loss on RDL but positions stayed solid.',
    },
    customFeedback: [
      {
        id: 'energy-post',
        label: 'Energy post workout',
        type: 'scale',
        min: 1,
        max: 5,
        value: 4,
      },
      {
        id: 'session-note',
        label: 'Coach note',
        type: 'text',
        value: 'Bench can stay at 150 next week and chase an extra rep before adding load.',
      },
    ],
  }),
  createCompletedSession({
    date: '2026-02-20',
    duration: 66,
    name: 'Upper Push',
    notes:
      'Used a conservative top set because the shoulder felt cranky during warm-ups. Face pulls helped settle the front delt.',
    startedAtTime: '18:03:00Z',
    templateId: 'upper-push',
    exercises: [
      {
        exerciseId: 'row-erg',
        sets: [{ setNumber: 1, reps: 240, time: '18:05:00Z' }],
      },
      {
        exerciseId: 'banded-shoulder-external-rotation',
        sets: [
          { setNumber: 1, reps: 12, time: '18:10:00Z' },
          { setNumber: 2, reps: 12, time: '18:12:00Z' },
        ],
      },
      {
        exerciseId: 'incline-dumbbell-press',
        sets: [
          { setNumber: 1, reps: 11, weight: 45, time: '18:20:00Z' },
          { setNumber: 2, reps: 10, weight: 40, time: '18:24:00Z' },
          { setNumber: 3, reps: 9, weight: 35, time: '18:28:00Z' },
        ],
      },
      {
        exerciseId: 'seated-dumbbell-shoulder-press',
        sets: [
          { setNumber: 1, reps: 9, weight: 30, time: '18:36:00Z' },
          { setNumber: 2, reps: 8, weight: 25, time: '18:40:00Z' },
          { setNumber: 3, reps: 8, weight: 20, time: '18:44:00Z' },
        ],
      },
      {
        exerciseId: 'cable-lateral-raise',
        sets: [
          { setNumber: 1, reps: 14, weight: 12.5, time: '18:50:00Z' },
          { setNumber: 2, reps: 13, weight: 10, time: '18:53:00Z' },
          { setNumber: 3, reps: 12, weight: 10, time: '18:56:00Z' },
        ],
      },
      {
        exerciseId: 'rope-triceps-pushdown',
        sets: [
          { setNumber: 1, reps: 12, weight: 37.5, time: '19:01:00Z' },
          { setNumber: 2, reps: 11, weight: 32.5, time: '19:04:00Z' },
          { setNumber: 3, reps: 10, weight: 27.5, time: '19:07:00Z' },
        ],
      },
      {
        exerciseId: 'face-pull',
        sets: [
          { setNumber: 1, reps: 15, weight: 20, time: '19:12:00Z' },
          { setNumber: 2, reps: 15, weight: 20, time: '19:15:00Z' },
          { setNumber: 3, reps: 15, weight: 20, time: '19:18:00Z' },
        ],
      },
    ],
    feedback: {
      energy: 3,
      recovery: 3,
      technique: 4,
      notes: 'Good decision to keep the top set conservative and avoid a painful lockout.',
    },
    customFeedback: [
      {
        id: 'shoulder-feel',
        label: 'Shoulder feel',
        type: 'scale',
        min: 1,
        max: 5,
        value: 3,
        notes: 'Felt unstable early, then improved after extra cuff work.',
      },
      {
        id: 'session-note',
        label: 'Coach note',
        type: 'text',
        value: 'Warm-up with one extra face-pull set next time.',
      },
    ],
  }),
];

export const workoutEnhancedExercises: ActiveWorkoutEnhancedExercise[] = [
  createEnhancedExercise({
    exerciseId: 'row-erg',
    section: 'warmup',
    phaseBadge: 'recovery',
    priority: 'required',
    supersetGroup: null,
    reversePyramid: [{ setNumber: 1, targetWeight: 0, targetReps: 240 }],
    formCues: {
      technique: 'Drive through the legs first, then finish by sweeping elbows past the ribs.',
      mentalCues: ['Long stroke', 'Easy pace'],
      commonMistakes: ['Yanking with the arms', 'Opening the back too early'],
    },
    injuryCues: ['Keep the handle path low to avoid shrugging into the left shoulder.'],
  }),
  createEnhancedExercise({
    exerciseId: 'banded-shoulder-external-rotation',
    section: 'warmup',
    phaseBadge: 'rebuild',
    priority: 'required',
    supersetGroup: 'prep-a',
    reversePyramid: [
      { setNumber: 1, targetWeight: 10, targetReps: 12 },
      { setNumber: 2, targetWeight: 10, targetReps: 12 },
    ],
    formCues: {
      technique: 'Keep the upper arm pinned and rotate only through the shoulder socket.',
      mentalCues: ['Move slow', 'Own end range'],
      commonMistakes: ['Letting the elbow drift', 'Twisting through the torso'],
    },
    injuryCues: ['Stop short of end-range if the SLAP tear creates a pinch in the front shoulder.'],
  }),
  createEnhancedExercise({
    exerciseId: 'incline-dumbbell-press',
    section: 'main',
    phaseBadge: 'moderate',
    priority: 'required',
    supersetGroup: null,
    reversePyramid: [
      { setNumber: 1, targetWeight: 50, targetReps: 12 },
      { setNumber: 2, targetWeight: 45, targetReps: 10 },
      { setNumber: 3, targetWeight: 40, targetReps: 9 },
    ],
    formCues: {
      technique:
        'Press with a slight neutral grip, keep forearms stacked, and control a 3-second eccentric into the upper chest.',
      mentalCues: ['Crack the handles', 'Drive upper back into the bench'],
      commonMistakes: ['Flared elbows at the bottom', 'Losing the shoulder blade set-up'],
    },
    injuryCues: [
      'Avoid the last 10 degrees of lockout if the left shoulder feels unstable.',
      'Cap the top set at RPE 8 while the SLAP tear is still active.',
    ],
  }),
  createEnhancedExercise({
    exerciseId: 'seated-dumbbell-shoulder-press',
    section: 'main',
    phaseBadge: 'rebuild',
    priority: 'required',
    supersetGroup: null,
    reversePyramid: [
      { setNumber: 1, targetWeight: 35, targetReps: 10 },
      { setNumber: 2, targetWeight: 30, targetReps: 9 },
      { setNumber: 3, targetWeight: 25, targetReps: 8 },
    ],
    formCues: {
      technique:
        'Stay just in front of the frontal plane and finish with biceps slightly forward of the ears.',
      mentalCues: ['Ribs down', 'Punch through smoothly'],
      commonMistakes: ['Overarching the low back', 'Pressing straight out in front'],
    },
    injuryCues: [
      'Use the high-incline backup if overhead motion produces sharp anterior shoulder pain.',
    ],
  }),
  createEnhancedExercise({
    exerciseId: 'cable-lateral-raise',
    section: 'main',
    phaseBadge: 'moderate',
    priority: 'required',
    supersetGroup: 'pump-a',
    reversePyramid: [
      { setNumber: 1, targetWeight: 15, targetReps: 15 },
      { setNumber: 2, targetWeight: 12.5, targetReps: 14 },
      { setNumber: 3, targetWeight: 10, targetReps: 13 },
    ],
    formCues: {
      technique:
        'Lead with the elbow and stop at shoulder height with the pinky slightly lower than the thumb.',
      mentalCues: ['Sweep wide', 'Keep traps quiet'],
      commonMistakes: ['Swinging the torso', 'Turning it into a front raise'],
    },
    injuryCues: ['If upper-trap dominance shows up, cut the range before shoulder height.'],
  }),
  createEnhancedExercise({
    exerciseId: 'rope-triceps-pushdown',
    section: 'main',
    phaseBadge: 'moderate',
    priority: 'optional',
    supersetGroup: 'pump-a',
    reversePyramid: [
      { setNumber: 1, targetWeight: 42.5, targetReps: 12 },
      { setNumber: 2, targetWeight: 37.5, targetReps: 11 },
      { setNumber: 3, targetWeight: 32.5, targetReps: 10 },
    ],
    formCues: {
      technique:
        'Pin elbows beside the ribs and separate the rope only after the elbows are almost straight.',
      mentalCues: ['Elbows still', 'Spread the rope'],
      commonMistakes: ['Shoulders rolling forward', 'Using bodyweight to finish'],
    },
    injuryCues: [
      'Switch to cross-body cable extensions if the shoulder gets cranky at the bottom.',
    ],
  }),
];

export const workoutExerciseHistory: ActiveWorkoutExerciseHistory = {
  'incline-dumbbell-press': [
    { date: '2026-01-05', weight: 40, reps: 10 },
    { date: '2026-01-12', weight: 40, reps: 11 },
    { date: '2026-01-19', weight: 42.5, reps: 10 },
    { date: '2026-01-26', weight: 42.5, reps: 11 },
    { date: '2026-02-02', weight: 45, reps: 10 },
    { date: '2026-02-09', weight: 45, reps: 11 },
    { date: '2026-02-16', weight: 45, reps: 12 },
    { date: '2026-02-20', weight: 45, reps: 11 },
    { date: '2026-02-24', weight: 47.5, reps: 10 },
    { date: '2026-03-02', weight: 50, reps: 12 },
  ],
  'seated-dumbbell-shoulder-press': [
    { date: '2026-01-05', weight: 25, reps: 10 },
    { date: '2026-01-12', weight: 25, reps: 11 },
    { date: '2026-01-19', weight: 27.5, reps: 10 },
    { date: '2026-01-26', weight: 27.5, reps: 11 },
    { date: '2026-02-02', weight: 30, reps: 9 },
    { date: '2026-02-09', weight: 30, reps: 10 },
    { date: '2026-02-16', weight: 30, reps: 10 },
    { date: '2026-02-20', weight: 30, reps: 9 },
    { date: '2026-02-24', weight: 32.5, reps: 9 },
    { date: '2026-03-02', weight: 35, reps: 10 },
  ],
  'high-bar-back-squat': [
    { date: '2026-01-03', weight: 175, reps: 6 },
    { date: '2026-01-10', weight: 175, reps: 6 },
    { date: '2026-01-17', weight: 185, reps: 5 },
    { date: '2026-01-24', weight: 185, reps: 6 },
    { date: '2026-01-31', weight: 190, reps: 5 },
    { date: '2026-02-07', weight: 195, reps: 5 },
    { date: '2026-02-14', weight: 195, reps: 6 },
    { date: '2026-02-21', weight: 200, reps: 5 },
    { date: '2026-02-27', weight: 205, reps: 6 },
    { date: '2026-03-05', weight: 205, reps: 6 },
  ],
  'face-pull': [
    { date: '2026-01-05', weight: 15, reps: 15 },
    { date: '2026-01-12', weight: 15, reps: 15 },
    { date: '2026-01-19', weight: 17.5, reps: 15 },
    { date: '2026-01-26', weight: 17.5, reps: 15 },
    { date: '2026-02-02', weight: 20, reps: 15 },
    { date: '2026-02-09', weight: 20, reps: 16 },
    { date: '2026-02-16', weight: 22.5, reps: 15 },
    { date: '2026-02-20', weight: 20, reps: 15 },
    { date: '2026-02-24', weight: 22.5, reps: 15 },
    { date: '2026-03-02', weight: 25, reps: 15 },
  ],
};

export const enhancedWorkoutMockData = {
  completedSessions: workoutCompletedSessions,
  feedbackFields: workoutFeedbackFields,
  enhancedExercises: workoutEnhancedExercises,
  exerciseHistory: workoutExerciseHistory,
  sessionContext: workoutSessionContext,
};

function createCompletedSession(input: CompletedSessionInput): ActiveWorkoutCompletedSession {
  return {
    customFeedback: input.customFeedback,
    duration: input.duration,
    exercises: input.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      sets: exercise.sets.map((set) => ({
        completed: true,
        reps: set.reps,
        setNumber: set.setNumber,
        timestamp: toIsoTimestamp(input.date, set.time),
        weight: set.weight,
      })),
    })),
    feedback: input.feedback,
    id: `session-${input.templateId}-${input.date}`,
    name: input.name,
    notes: input.notes,
    startedAt: toIsoTimestamp(input.date, input.startedAtTime),
    status: 'completed',
    templateId: input.templateId,
  };
}

function createEnhancedExercise(input: {
  exerciseId: string;
  formCues: ActiveWorkoutEnhancedExercise['formCues'];
  injuryCues: string[];
  phaseBadge: ActiveWorkoutEnhancedExercise['phaseBadge'];
  priority: ActiveWorkoutEnhancedExercise['priority'];
  reversePyramid: ActiveWorkoutEnhancedExercise['reversePyramid'];
  section: ActiveWorkoutEnhancedExercise['section'];
  supersetGroup: string | null;
}): ActiveWorkoutEnhancedExercise {
  const templateExercise = findTemplateExercise(input.exerciseId);
  const catalogExercise = exerciseCatalog.get(input.exerciseId);

  return {
    badges: templateExercise?.badges ?? inferBadgesFromCategory(catalogExercise?.category),
    category: catalogExercise?.category ?? 'compound',
    exerciseId: input.exerciseId,
    formCues: input.formCues,
    injuryCues: input.injuryCues,
    lastPerformance: getLastPerformance(input.exerciseId),
    name: catalogExercise?.name ?? startCase(input.exerciseId),
    phaseBadge: input.phaseBadge,
    prescribedReps: templateExercise?.reps ?? String(input.reversePyramid[0]?.targetReps ?? ''),
    prescribedSets: templateExercise?.sets ?? input.reversePyramid.length,
    priority: input.priority,
    restSeconds: templateExercise?.restSeconds ?? 60,
    reversePyramid: input.reversePyramid,
    section: input.section,
    sets: templateExercise?.sets ?? input.reversePyramid.length,
    supersetGroup: input.supersetGroup,
    tempo: templateExercise?.tempo ?? '2111',
    trackingType: resolveTrackingType({
      category: catalogExercise?.category,
      exerciseId: input.exerciseId,
      exerciseName: catalogExercise?.name,
      prescribedReps: templateExercise?.reps,
    }),
  };
}

function findTemplateExercise(exerciseId: string) {
  return templateExerciseCatalog.get(exerciseId);
}

function getLastPerformance(exerciseId: string): ActiveWorkoutLastPerformance | null {
  const session = [...workoutCompletedSessions]
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
    .find((item) => item.exercises.some((exercise) => exercise.exerciseId === exerciseId));

  const exerciseLog = session?.exercises.find((exercise) => exercise.exerciseId === exerciseId);

  if (!session || !exerciseLog) {
    return null;
  }

  return {
    date: session.startedAt.slice(0, 10),
    sessionId: session.id,
    sets: exerciseLog.sets.map((set) => ({
      completed: set.completed,
      reps: set.reps,
      setNumber: set.setNumber,
      weight: set.weight ?? null,
    })),
  };
}

function inferBadgesFromCategory(
  category: ExerciseCategory | undefined,
): WorkoutBadgeType[] {
  switch (category) {
    case 'cardio':
      return ['cardio'];
    case 'mobility':
      return ['mobility'];
    case 'isolation':
      return ['isolation'];
    default:
      return ['compound'];
  }
}

function toIsoTimestamp(date: string, time: string) {
  return `${date}T${time}`;
}
