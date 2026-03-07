import { useMemo, useState, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  mockExercises,
  type WorkoutExercise,
  type WorkoutExerciseCategory,
} from '@/lib/mock-data/workouts';
import { cn } from '@/lib/utils';

import { workoutExerciseHistory } from '../lib/mock-data';
import { ExerciseTrendChart } from './exercise-trend-chart';

const categoryBadgeStyles: Record<WorkoutExerciseCategory, string> = {
  compound:
    'border-transparent bg-[var(--color-accent-pink)] text-on-pink dark:bg-pink-500/20 dark:text-pink-400',
  isolation:
    'border-transparent bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
  cardio:
    'border-transparent bg-[var(--color-accent-mint)] text-on-mint dark:bg-emerald-500/20 dark:text-emerald-400',
  mobility:
    'border-transparent bg-[var(--color-accent-cream)] text-on-cream dark:bg-amber-500/20 dark:text-amber-400',
};

type ExerciseLibraryProps = {
  className?: string;
};

export function ExerciseLibrary({ className }: ExerciseLibraryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('all');
  const [equipment, setEquipment] = useState('all');
  const [category, setCategory] = useState<'all' | WorkoutExerciseCategory>('all');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);

  const muscleGroupOptions = useMemo(
    () => Array.from(new Set(mockExercises.flatMap((exercise) => exercise.muscleGroups))).sort(),
    [],
  );
  const equipmentOptions = useMemo(
    () => Array.from(new Set(mockExercises.map((exercise) => exercise.equipment))).sort(),
    [],
  );

  const filteredExercises = useMemo(
    () =>
      mockExercises.filter((exercise) => {
        const matchesSearch = exercise.name.toLowerCase().includes(searchTerm.trim().toLowerCase());
        const matchesMuscleGroup =
          muscleGroup === 'all' || exercise.muscleGroups.includes(muscleGroup);
        const matchesEquipment = equipment === 'all' || exercise.equipment === equipment;
        const matchesCategory = category === 'all' || exercise.category === category;

        return matchesSearch && matchesMuscleGroup && matchesEquipment && matchesCategory;
      }),
    [category, equipment, muscleGroup, searchTerm],
  );

  const selectedExercise =
    mockExercises.find((exercise) => exercise.id === selectedExerciseId) ?? null;

  return (
    <section className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">Exercise Library</h2>
        <p className="max-w-2xl text-sm text-muted">
          Search the shared exercise catalog and filter by muscle group, equipment, or movement
          category.
        </p>
      </div>

      <Card className="gap-4 py-0">
        <CardContent className="grid gap-4 py-5 md:grid-cols-2 xl:grid-cols-4">
          <FilterField label="Search by name">
            <Input
              aria-label="Search exercises"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="e.g. row, squat, stretch"
              value={searchTerm}
            />
          </FilterField>

          <FilterField label="Muscle group">
            <select
              aria-label="Filter by muscle group"
              className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onChange={(event) => setMuscleGroup(event.target.value)}
              value={muscleGroup}
            >
              <option value="all">All muscle groups</option>
              {muscleGroupOptions.map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Equipment">
            <select
              aria-label="Filter by equipment"
              className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onChange={(event) => setEquipment(event.target.value)}
              value={equipment}
            >
              <option value="all">All equipment</option>
              {equipmentOptions.map((option) => (
                <option key={option} value={option}>
                  {formatLabel(option)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Category">
            <select
              aria-label="Filter by category"
              className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onChange={(event) =>
                setCategory(event.target.value as 'all' | WorkoutExerciseCategory)
              }
              value={category}
            >
              <option value="all">All categories</option>
              <option value="compound">Compound</option>
              <option value="isolation">Isolation</option>
              <option value="cardio">Cardio</option>
              <option value="mobility">Mobility</option>
            </select>
          </FilterField>
        </CardContent>
      </Card>

      <p className="text-sm text-muted">
        {`${filteredExercises.length} exercise${filteredExercises.length === 1 ? '' : 's'} shown`}
      </p>

      {filteredExercises.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted">
              No exercises match the current search and filter combination.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredExercises.map((exercise) => (
            <ExerciseCard
              exercise={exercise}
              key={exercise.id}
              onSelectTrend={() => setSelectedExerciseId(exercise.id)}
            />
          ))}
        </div>
      )}

      <Dialog onOpenChange={(open) => (!open ? setSelectedExerciseId(null) : null)} open={selectedExercise != null}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-t-3xl border-border p-0 sm:max-w-4xl sm:rounded-3xl">
          {selectedExercise ? (
            <div className="space-y-0">
              <DialogHeader className="px-6 pt-6">
                <DialogTitle>{`${selectedExercise.name} trends`}</DialogTitle>
                <DialogDescription>
                  Review weight and rep progression across completed sessions.
                </DialogDescription>
              </DialogHeader>
              <div className="px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
                <ExerciseTrendChart
                  exerciseName={selectedExercise.name}
                  history={workoutExerciseHistory[selectedExercise.id] ?? []}
                />
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ExerciseCard({
  exercise,
  onSelectTrend,
}: {
  exercise: WorkoutExercise;
  onSelectTrend: () => void;
}) {
  return (
    <Card className="gap-4 py-0">
      <CardHeader className="gap-3 py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="space-y-1">
              <h3>
                <button
                  className="cursor-pointer text-left text-xl font-semibold text-foreground underline-offset-4 transition hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={onSelectTrend}
                  type="button"
                >
                  {exercise.name}
                </button>
              </h3>
              <p className="text-sm text-muted">{formatLabel(exercise.equipment)}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {exercise.muscleGroups.map((group) => (
                <Badge className="border-border bg-secondary/65" key={group} variant="outline">
                  {formatLabel(group)}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge className="border-border bg-card" variant="outline">
              {formatLabel(exercise.equipment)}
            </Badge>
            <Badge
              className={cn(categoryBadgeStyles[exercise.category], 'capitalize')}
              variant="outline"
            >
              {exercise.category}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-5">
        <p className="text-sm text-muted">
          Targets {exercise.muscleGroups.map((group) => formatLabel(group)).join(', ')}.
        </p>
      </CardContent>
    </Card>
  );
}

function FilterField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="space-y-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function formatLabel(value: string) {
  return value
    .split(/[- ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
