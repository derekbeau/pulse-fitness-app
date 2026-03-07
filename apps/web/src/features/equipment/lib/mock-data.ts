import { Activity, Dumbbell, Layers3, Settings, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { EquipmentCategory, EquipmentLocation } from '../types';

export const equipmentCategoryOrder: EquipmentCategory[] = [
  'free-weights',
  'machines',
  'cables',
  'cardio',
  'accessories',
];

export const equipmentCategoryMeta: Record<EquipmentCategory, { icon: LucideIcon; label: string }> =
  {
    accessories: {
      icon: Layers3,
      label: 'Accessories',
    },
    cables: {
      icon: Wrench,
      label: 'Cables',
    },
    cardio: {
      icon: Activity,
      label: 'Cardio',
    },
    'free-weights': {
      icon: Dumbbell,
      label: 'Free Weights',
    },
    machines: {
      icon: Settings,
      label: 'Machines',
    },
  };

export function getEquipmentCategoryLabel(category: EquipmentCategory) {
  return equipmentCategoryMeta[category].label;
}

export function getEquipmentCategoryIcon(category: EquipmentCategory) {
  return equipmentCategoryMeta[category].icon;
}

export const equipmentLocations: EquipmentLocation[] = [
  {
    id: 'home-gym',
    name: 'Home Gym',
    notes: 'Primary garage setup for weekday training and quick conditioning sessions.',
    equipment: [
      {
        id: 'adjustable-dumbbells',
        name: 'Adjustable Dumbbells',
        category: 'free-weights',
        details: 'Pair covering 5-80 lbs.',
      },
      {
        id: 'adjustable-kettlebell',
        name: 'Adjustable Kettlebell',
        category: 'free-weights',
        details: 'Adjustable from 35-100 lbs.',
      },
      {
        id: 'barbells',
        name: 'Barbells',
        category: 'free-weights',
        details: 'Olympic bars for squats, presses, pulls, and landmine work.',
      },
      {
        id: 'dual-cable-machine',
        name: 'Dual Cable Machine',
        category: 'cables',
        details: 'Adjustable columns for unilateral and bilateral cable work.',
      },
      {
        id: 'peloton-bike',
        name: 'Peloton Bike',
        category: 'cardio',
        details: 'Used for low-impact conditioning and interval rides.',
      },
      {
        id: 'squat-rack',
        name: 'Squat Rack',
        category: 'accessories',
        details: 'Main rack for barbell lifts and rack-supported setup work.',
      },
      {
        id: 'landmine-attachment',
        name: 'Landmine Attachment',
        category: 'accessories',
        details: 'Rack-mounted attachment for presses, rows, and rotations.',
      },
      {
        id: 'decline-bench',
        name: 'Decline Bench',
        category: 'accessories',
        details: 'Fixed bench for decline pressing and core work.',
      },
      {
        id: 'adjustable-bench',
        name: 'Adjustable Bench',
        category: 'accessories',
        details: 'Flat-to-incline bench for pressing and support work.',
      },
      {
        id: 'pull-up-bar',
        name: 'Pull-Up Bar',
        category: 'accessories',
        details: 'Mounted station for pull-ups, chin-ups, and hangs.',
      },
      {
        id: 'resistance-bands',
        name: 'Resistance Bands',
        category: 'accessories',
        details: 'Loop and handled bands for warm-ups, mobility, and assistance.',
      },
      {
        id: 'slant-board',
        name: 'Slant Board',
        category: 'accessories',
        details: 'Used for calf work, ankle mobility, and quad-biased squats.',
      },
      {
        id: 'metal-step',
        name: 'Metal Step',
        category: 'accessories',
        details: 'Stable platform for step-ups, deficit work, and setup support.',
      },
    ],
  },
  {
    id: 'franklin-athletic-center',
    name: 'Franklin Athletic Center',
    notes: 'Commercial gym access for machine volume, cable work, and boxing conditioning.',
    equipment: [
      {
        id: 'leg-extension',
        name: 'Leg Extension',
        category: 'machines',
      },
      {
        id: 'leg-curl',
        name: 'Leg Curl',
        category: 'machines',
      },
      {
        id: 'leg-press',
        name: 'Leg Press',
        category: 'machines',
      },
      {
        id: 'hack-squat',
        name: 'Hack Squat',
        category: 'machines',
      },
      {
        id: 'hip-thrust-machine',
        name: 'Hip Thrust Machine',
        category: 'machines',
      },
      {
        id: 'adductor-machine',
        name: 'Adductor Machine',
        category: 'machines',
      },
      {
        id: 'abductor-machine',
        name: 'Abductor Machine',
        category: 'machines',
      },
      {
        id: 'calf-raise',
        name: 'Calf Raise',
        category: 'machines',
      },
      {
        id: 'smith-machine',
        name: 'Smith Machine',
        category: 'machines',
      },
      {
        id: 'shoulder-press-machine',
        name: 'Shoulder Press Machine',
        category: 'machines',
      },
      {
        id: 'hammer-strength-press',
        name: 'Hammer Strength Press',
        category: 'machines',
      },
      {
        id: 'hammer-strength-row',
        name: 'Hammer Strength Row',
        category: 'machines',
      },
      {
        id: 'pec-deck',
        name: 'Pec Deck',
        category: 'machines',
      },
      {
        id: 'rear-delt-machine',
        name: 'Rear Delt Machine',
        category: 'machines',
      },
      {
        id: 'assisted-pull-up',
        name: 'Assisted Pull-Up',
        category: 'machines',
      },
      {
        id: 'lat-pulldown',
        name: 'Lat Pulldown',
        category: 'cables',
      },
      {
        id: 'cable-stations',
        name: 'Cable Stations',
        category: 'cables',
        details: 'Multiple adjustable columns for rows, presses, and isolation work.',
      },
      {
        id: 'heavy-bags',
        name: 'Heavy Bags',
        category: 'accessories',
        details: 'Boxing area for conditioning rounds and striking practice.',
      },
      {
        id: 'medicine-balls',
        name: 'Medicine Balls',
        category: 'accessories',
        details: 'Useful for throws, slams, and rotational core work.',
      },
    ],
  },
];
