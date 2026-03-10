// Preview data — replace with API calls when feature is implemented
import type { Resource } from '../types';

export const mockResources: Resource[] = [
  {
    id: 'atg-knees-over-toes-guy',
    title: 'ATG (Knees Over Toes Guy)',
    type: 'creator',
    author: 'Ben Patrick',
    description:
      'Joint-focused training methodology centered on rebuilding knees, ankles, and hips with progressive full-range loading.',
    tags: ['joint health', 'knee rehab', 'longevity'],
    principles: [
      'Tibialis raises for knee protection',
      'Full ROM strength through stretching',
      'Backward walking for knee health',
    ],
    linkedExercises: [
      { id: 'tibialis-raises', name: 'Tibialis Raises' },
      { id: 'spanish-squats', name: 'Spanish Squats' },
      { id: 'split-squats', name: 'Split Squats' },
      { id: 'calf-raises', name: 'Calf Raises' },
    ],
    linkedProtocols: [],
  },
  {
    id: 'strength-side',
    title: 'Strength Side',
    type: 'creator',
    author: 'Josh Hash',
    description:
      'Movement practice blending calisthenics, mobility, and playful strength progressions to improve control through larger ranges.',
    tags: ['movement quality', 'calisthenics', 'mobility'],
    principles: ['Ground movement flows', 'L-sit progression', 'Pancake flexibility'],
    linkedExercises: [
      { id: 'l-sit', name: 'L-Sit' },
      { id: 'pancake-stretch', name: 'Pancake Stretch' },
      { id: 'ground-movement-flow', name: 'Ground Movement Flow' },
    ],
    linkedProtocols: [],
  },
  {
    id: 'starting-strength',
    title: 'Starting Strength',
    type: 'book',
    author: 'Mark Rippetoe',
    description:
      'Foundational barbell training text focused on teaching efficient mechanics and simple novice progression.',
    tags: ['barbell', 'strength', 'compound lifts'],
    principles: ['Linear progression', 'Compound barbell movements', 'Progressive overload'],
    linkedExercises: [
      { id: 'high-bar-back-squat', name: 'High-Bar Back Squat' },
      { id: 'barbell-bench-press', name: 'Barbell Bench Press' },
      { id: 'romanian-deadlift', name: 'Romanian Deadlift' },
    ],
    linkedProtocols: [],
  },
  {
    id: 'mcgill-big-3',
    title: 'McGill Big 3',
    type: 'program',
    author: 'Dr. Stuart McGill',
    description:
      'Spine-sparing core stability sequence used to improve trunk stiffness and reduce symptom flare-ups during rehab.',
    tags: ['spine health', 'core', 'rehabilitation'],
    principles: ['Modified curl-up', 'Side plank', 'Bird dog'],
    linkedExercises: [
      { id: 'modified-curl-up', name: 'Modified Curl-Up' },
      { id: 'side-plank', name: 'Side Plank' },
      { id: 'bird-dog', name: 'Bird Dog' },
    ],
    linkedProtocols: [
      {
        id: 'lower-back-disc-herniation-mcgill-big-3',
        name: 'McGill Big 3',
        conditionName: 'Lower Back Disc Herniation',
        conditionSlug: 'lower-back-disc-herniation',
      },
    ],
  },
  {
    id: 'reverse-pyramid-training',
    title: 'Reverse Pyramid Training',
    type: 'program',
    author: 'Martin Berkhan',
    description:
      'A high-intensity lifting structure that prioritizes the heaviest set first, then reduces load as fatigue builds.',
    tags: ['hypertrophy', 'efficiency', 'strength'],
    principles: ['Start heavy, drop weight each set', 'Low volume, high intensity'],
    linkedExercises: [
      { id: 'incline-dumbbell-press', name: 'Incline Dumbbell Press' },
      { id: 'lat-pulldown', name: 'Lat Pulldown' },
      { id: 'leg-press', name: 'Leg Press' },
    ],
    linkedProtocols: [],
  },
  {
    id: 'yoga-with-adriene',
    title: 'Yoga with Adriene',
    type: 'creator',
    author: 'Adriene Mishler',
    description:
      'Accessible yoga instruction emphasizing consistency, breathing, and low-pressure mobility work for recovery days.',
    tags: ['yoga', 'flexibility', 'mindfulness'],
    principles: ['Find what feels good', 'Breath-led movement'],
    linkedExercises: [
      { id: 'couch-stretch', name: 'Couch Stretch' },
      { id: 'worlds-greatest-stretch', name: "World's Greatest Stretch" },
    ],
    linkedProtocols: [],
  },
];
