// Preview data — replace with API calls when feature is implemented
import type { JournalEntry, LinkedEntity } from '../types';

const workouts = {
  fullBody: {
    id: 'full-body',
    name: 'Full Body',
    type: 'workout',
  },
  lowerQuadDominant: {
    id: 'lower-quad-dominant',
    name: 'Lower Quad-Dominant',
    type: 'workout',
  },
  upperPush: {
    id: 'upper-push',
    name: 'Upper Push',
    type: 'workout',
  },
} satisfies Record<string, LinkedEntity>;

const activities = {
  eveningWalk: {
    id: 'activity-evening-zone-2-walk',
    name: 'Evening Zone 2 Walk',
    type: 'activity',
  },
  recoveryBike: {
    id: 'activity-recovery-bike-spin',
    name: 'Recovery Bike Spin',
    type: 'activity',
  },
  tibialisCircuit: {
    id: 'activity-tibialis-circuit',
    name: 'Tibialis and Foot Prep Circuit',
    type: 'activity',
  },
} satisfies Record<string, LinkedEntity>;

const habits = {
  hydrate: {
    id: 'hydrate',
    name: 'Hydrate',
    type: 'habit',
  },
  mobility: {
    id: 'mobility',
    name: 'Mobility warm-up',
    type: 'habit',
  },
  protein: {
    id: 'protein',
    name: 'Protein goal',
    type: 'habit',
  },
  sleep: {
    id: 'sleep',
    name: 'Sleep',
    type: 'habit',
  },
  vitamins: {
    id: 'vitamins',
    name: 'Take vitamins',
    type: 'habit',
  },
} satisfies Record<string, LinkedEntity>;

const injuries = {
  leftAchilles: {
    id: 'injury-left-achilles-insertion',
    name: 'Left Achilles insertion',
    type: 'injury',
  },
  rightKnee: {
    id: 'injury-right-patellar-tendon',
    name: 'Right patellar tendon irritation',
    type: 'injury',
  },
  rightShoulder: {
    id: 'injury-right-shoulder-slap',
    name: 'Right shoulder SLAP rehab',
    type: 'injury',
  },
} satisfies Record<string, LinkedEntity>;

export const mockJournalEntries: JournalEntry[] = [
  {
    id: 'journal-shoulder-slap-clearance',
    date: '2026-03-06',
    title: 'Shoulder SLAP Clearance',
    type: 'injury-update',
    content: `## Clearance update

**Sports med check-in:** cleared to reintroduce overhead work at a moderate RPE as long as the first working set stays pain-free.

### What changed
- Internal rotation tolerance was better than the last appointment.
- Clicking is now occasional instead of showing up every pressing session.
- I can use a controlled eccentric without feeling the shoulder shift.

### Guardrails for the next block
- Keep the first overhead press set at **RPE 6-7**.
- Pair every upper session with band external rotations before the first compound set.
- Stop the set if pain rises above **2/10** or if range shortens rep to rep.`,
    linkedEntities: [injuries.rightShoulder, habits.mobility],
    createdBy: 'user',
  },
  {
    id: 'journal-upper-a-session-notes',
    date: '2026-03-05',
    title: 'Upper A Session Notes',
    type: 'post-workout',
    content: `## Coach notes

**Session focus:** keep incline press progression moving while protecting the right shoulder.

### Wins
- Bar path on incline dumbbell press stayed cleaner than last week.
- Scap position held up well once the warm-up band work was finished.
- Tempo stayed honest even after the top set climbed.

### Next adjustments
- Keep elbows about **30-45 degrees** off the torso on the first two sets.
- Add a one-count pause at the bottom if shoulder tension returns.
- Triceps pushdowns can move up next week if pressing recovery still feels normal.`,
    linkedEntities: [workouts.upperPush, injuries.rightShoulder],
    createdBy: 'agent',
  },
  {
    id: 'journal-knee-feeling-better',
    date: '2026-03-04',
    title: 'Knee feeling better after 2 weeks of tibialis work',
    type: 'observation',
    content: `## Trend

**Noticeable improvement:** stairs are almost pain-free in the morning and the knee is warming up faster before squats.

### Signals worth keeping
- The tibialis raises seem to cut down the stiff first few reps.
- Split squat depth is coming back without the usual tug under the kneecap.
- The ankle feels more stable when I stay consistent with the foot prep circuit.

### Keep doing
- Tibialis circuit before lower sessions.
- A short mobility check on non-lifting days.
- Track whether the knee still improves when squat load goes up next week.`,
    linkedEntities: [injuries.rightKnee, activities.tibialisCircuit],
    createdBy: 'user',
  },
  {
    id: 'journal-incline-press-pr',
    date: '2026-03-03',
    title: 'Hit 55lb Incline Press PR',
    type: 'milestone',
    content: `## Personal record

Moved the top set to **55 lb dumbbells** for a clean set of 8. This is the first time the load moved up without the shoulder getting cranky afterward.

### Why it mattered
- Warm-up sequencing was better than the last two push sessions.
- Sleep was solid for three nights in a row.
- I stayed patient on the eccentric instead of rushing the first rep.

### Next target
- Repeat the load and own all working sets before chasing another jump.`,
    linkedEntities: [workouts.upperPush, habits.sleep],
    createdBy: 'user',
  },
  {
    id: 'journal-week-12-training-summary',
    date: '2026-03-02',
    title: 'Week 12 Training Summary',
    type: 'weekly-summary',
    content: `## Week 12 snapshot

**Theme:** solid training week with enough recovery to push load on both upper and lower sessions.

### Highlights
- Pressing volume went up without aggravating the shoulder.
- Quad work felt more stable, especially in the second half of the session.
- Bench and squat both showed better position under fatigue.

### Watch next week
- Keep hydration up before lower days.
- Do not stack hard conditioning on the day before squat work.
- Continue logging soreness by region instead of just saying "felt tight."`,
    linkedEntities: [workouts.upperPush, workouts.lowerQuadDominant, workouts.fullBody],
    createdBy: 'agent',
  },
  {
    id: 'journal-recovery-walk-observation',
    date: '2026-03-01',
    title: 'Outdoor walk kept recovery high between lower sessions',
    type: 'observation',
    content: `## Recovery note

The longer evening walk seemed to make the next morning feel better rather than more fatigued.

### What I noticed
- Legs felt looser after dinner and less heavy the following morning.
- Sleep onset was quicker on the same day as the walk.
- Appetite stayed steadier, which made the protein target easier to hit.

### Repeatable version
- Keep the pace conversational.
- Cap it around **35-45 minutes**.
- Use it on high-stress days instead of adding more gym work.`,
    linkedEntities: [activities.eveningWalk, habits.sleep, habits.protein],
    createdBy: 'user',
  },
  {
    id: 'journal-lower-session-pacing-notes',
    date: '2026-02-28',
    title: 'Lower Session Pacing Notes',
    type: 'post-workout',
    content: `## Post-session review

**Big win:** squat positions improved when the first two warm-up jumps stayed smaller.

### Form notes
- The knee tracked cleaner when I let the ankle move instead of sitting back early.
- Bulgarian split squats were much smoother with a slower descent.
- Leg press depth stayed consistent when I did not rush the turnaround.

### For the next lower day
- Add one more ramp set before the first top squat set.
- Keep rest periods at **2-3 minutes** for the bilateral work.
- Finish with a short tibialis circuit if the knee feels sticky coming out of the rack.`,
    linkedEntities: [workouts.lowerQuadDominant, injuries.rightKnee],
    createdBy: 'agent',
  },
  {
    id: 'journal-sleep-consistency-milestone',
    date: '2026-02-26',
    title: 'Seven straight nights over 8 hours',
    type: 'milestone',
    content: `## Recovery milestone

Closed out a full week with **8+ hours** every night, and the difference showed up immediately in training readiness.

### Outcomes
- Morning soreness came down faster.
- Upper body pressing felt more coordinated.
- Cravings were lower, which made meals easier to keep on plan.

### What helped
- Water and vitamins were done earlier in the day.
- Screens were off before bed most nights.
- The walk after dinner made it easier to wind down.`,
    linkedEntities: [habits.sleep, habits.hydrate, habits.vitamins],
    createdBy: 'user',
  },
  {
    id: 'journal-achilles-bike-update',
    date: '2026-02-22',
    title: 'Easy bike flush settled Achilles stiffness',
    type: 'injury-update',
    content: `## Injury check

The Achilles was stiff first thing in the morning, but a very easy spin loosened it up without the rebound soreness I usually get from extra walking.

### Helpful details
- Low resistance worked better than trying to "open it up" with a harder effort.
- Cadence above **85 rpm** felt smoother than pushing torque.
- Heel raises afterward were tolerable and did not spike symptoms.

### Plan
- Use the bike flush the day after full-body sessions.
- Keep calf loading separate from the spin.
- Recheck whether the morning stiffness stays under **3/10** this weekend.`,
    linkedEntities: [injuries.leftAchilles, activities.recoveryBike],
    createdBy: 'agent',
  },
];
