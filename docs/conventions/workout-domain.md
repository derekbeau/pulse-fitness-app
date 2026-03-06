# Workout Domain Conventions

This document defines the prototype workout data model used across templates, sessions, mock data, and future API contracts.

## Template Structure

Workout templates represent repeatable plans that users can schedule and launch into live sessions.

- `name`: concise program label such as "Upper Push" or "Full Body"
- `description`: short summary of training intent
- `tags`: searchable labels such as `strength`, `gym`, `push`, or `beginner-friendly`
- `sections`: ordered blocks that always appear in training order

Template sections use this fixed sequence:

1. `warmup`
2. `main`
3. `cooldown`

Each section contains an ordered `exercises` array. Preserve order exactly as authored; the UI should not reorder template exercises automatically.

## Exercise In Template

Each template exercise stores prescription data, not completed performance.

- `exerciseId`: reference to the shared exercise catalog entry
- `sets`: planned number of sets
- `reps`: prescription string such as `8-10`, `12`, `6/side`, or `45 sec`
- `tempo`: 4-digit notation such as `3110`
- `restSeconds`: planned rest period between working sets
- `formCues`: short coaching prompts shown during logging
- `badges`: quick-read metadata for chips and filtering

Example shape:

```ts
{
  exerciseId: 'incline-dumbbell-press',
  sets: 3,
  reps: '8-10',
  tempo: '3110',
  restSeconds: 90,
  formCues: ['Drive feet into the floor', 'Keep wrists stacked'],
  badges: ['compound', 'push']
}
```

## Session Structure

A workout session is the user-specific execution record of a template.

- `templateId`: source template reference
- `status`: `scheduled`, `in-progress`, or `completed`
- `startedAt`: ISO timestamp for session start
- `completedAt`: ISO timestamp for session finish; optional until complete
- `duration`: total elapsed minutes for the session

Completed sessions should also store exercise-level set logs and post-workout feedback.

## Set Logging

Each logged set captures what actually happened during the session.

- `weight`: optional numeric load
- `reps`: completed reps or seconds performed
- `completed`: boolean completion flag
- `timestamp`: ISO timestamp for when the set was recorded

Recommended additional fields:

- `setNumber`: preserve set order within the exercise

## Exercise Types

Every exercise in the shared catalog belongs to exactly one category:

- `compound`: multi-joint strength lifts
  Example: barbell bench press, high-bar back squat, Romanian deadlift
- `isolation`: single-muscle or single-joint emphasis
  Example: cable lateral raise, leg extension, rope triceps pushdown
- `cardio`: conditioning-focused efforts
  Example: row erg, air bike, jump rope
- `mobility`: range-of-motion or tissue-prep work
  Example: couch stretch, world's greatest stretch, banded shoulder external rotation

## Badge Types

Badges are lightweight descriptors used in template chips, filters, and future summary cards.

Supported badge values:

- `compound`
- `isolation`
- `push`
- `pull`
- `legs`
- `cardio`
- `mobility`

Badges may overlap. For example, a lat pulldown can carry `compound` and `pull`, while a couch stretch can carry `mobility`.

## Feedback Questions

Completed sessions collect a short reflection:

- `energy`: required 1-5 score
- `recovery`: required 1-5 score
- `technique`: required 1-5 score
- `notes`: optional freeform comments

Use whole-number scores only. Treat `1` as poor and `5` as excellent.

## Tempo Notation

Tempo uses four digits in this order:

1. eccentric
2. pause at stretch
3. concentric
4. pause at lockout

Example: `3110` means `3` seconds down, `1` second pause, `1` second up, `0` second pause before the next rep.

## UI Contrast Rule

Workout UI sometimes uses accent-colored cards for schedule, readiness, or completion states. Any text placed on accent-colored backgrounds must use a dark foreground such as `--color-on-accent` or an equivalent dark text token. Do not rely on the default theme foreground on pastel accent surfaces.
