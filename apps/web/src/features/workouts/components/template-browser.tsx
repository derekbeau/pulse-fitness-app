import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ListChecks, MoreVertical, Search, Tag, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import type { WorkoutTemplateSort } from '@pulse/shared';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { PerPageSelector } from '@/components/ui/per-page-selector';
import { SortSelector, type SortOption } from '@/components/ui/sort-selector';
import {
  useDeleteTemplate,
  useRenameTemplate,
  useScheduleWorkout,
} from '@/features/workouts/api/workouts';
import { toDateKey } from '@/lib/date-utils';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { ScheduleWorkoutDialog } from '@/features/workouts/components/schedule-workout-dialog';
import {
  formatWorkoutConflictDescription,
  getDayWorkoutConflicts,
} from '@/features/workouts/lib/day-workout-conflicts';
import { normalizeTemplateTag } from '@/features/workouts/lib/template-tags';

// Minimal structural interface — satisfied by both mock and API WorkoutTemplate shapes.
interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
  sections: Array<{ exercises: unknown[] }>;
}

type TemplateBrowserProps = {
  buildTemplateHref: (templateId: string) => string;
  className?: string;
  totalTemplates?: number;
  templates?: TemplateSummary[];
};

const templateSortValues: WorkoutTemplateSort[] = [
  'name-asc',
  'name-desc',
  'newest',
  'oldest',
  'recently-updated',
];
const templateSortOptions: SortOption[] = [
  { value: 'newest', label: 'Newest', direction: 'desc' },
  { value: 'oldest', label: 'Oldest', direction: 'asc' },
  { value: 'name-asc', label: 'Name (A-Z)', direction: 'asc' },
  { value: 'name-desc', label: 'Name (Z-A)', direction: 'desc' },
  { value: 'recently-updated', label: 'Recently Updated', direction: 'desc' },
];
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const pageSizeOptions = [10, 25, 50] as const;

export function TemplateBrowser({
  buildTemplateHref,
  className,
  totalTemplates,
  templates = [],
}: TemplateBrowserProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { confirm, dialog } = useConfirmation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameTemplateMutation = useRenameTemplate();
  const deleteTemplateMutation = useDeleteTemplate();
  const scheduleWorkoutMutation = useScheduleWorkout();
  const sort = parseTemplateSort(searchParams.get('sort'));
  const page = parsePage(searchParams.get('page'));
  const limit = parsePageSize(searchParams.get('limit'));
  const resolvedTotalTemplates = totalTemplates ?? templates.length;
  const requestedDate = searchParams.get('date');
  const scheduleInitialDate =
    requestedDate != null && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : toDateKey(new Date());
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();

    templates.forEach((template) => {
      template.tags.forEach((tag) => {
        const normalizedTag = normalizeTemplateTag(tag);
        if (normalizedTag) {
          tagSet.add(normalizedTag);
        }
      });
    });

    return Array.from(tagSet).sort((left, right) => left.localeCompare(right));
  }, [templates]);

  const activeSelectedTags = useMemo(
    () => selectedTags.filter((tag) => availableTags.includes(tag)),
    [availableTags, selectedTags],
  );

  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) => {
        const templateTags = template.tags.map((tag) => normalizeTemplateTag(tag));
        const matchesTags = activeSelectedTags.every((tag) => templateTags.includes(tag));
        if (!matchesTags) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const searchableText =
          `${template.name} ${template.description ?? ''} ${template.tags.join(' ')}`
            .trim()
            .toLowerCase();

        return searchableText.includes(normalizedQuery);
      }),
    [activeSelectedTags, normalizedQuery, templates],
  );
  const sortedTemplates = useMemo(() => sortTemplates(filteredTemplates, sort), [filteredTemplates, sort]);
  const totalPages = Math.max(1, Math.ceil(resolvedTotalTemplates / limit));

  const trimmedRenameValue = renameValue.trim();
  const canSubmitRename =
    renameTarget != null &&
    trimmedRenameValue.length > 0 &&
    trimmedRenameValue !== renameTarget.name &&
    !renameTemplateMutation.isPending;

  useEffect(() => {
    if (page <= totalPages) {
      return;
    }

    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('page', String(totalPages));
        return next;
      },
      { replace: true },
    );
  }, [page, setSearchParams, totalPages]);

  async function handleDeleteTemplate(templateId: string) {
    try {
      await deleteTemplateMutation.mutateAsync({
        id: templateId,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to delete template.';
      toast.error(message);
      throw error;
    }
  }

  async function confirmDuplicateDayWorkouts(dateKey: string) {
    const conflicts = await getDayWorkoutConflicts(dateKey);

    if (conflicts.length === 0) {
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      confirm({
        title: 'This day already has a workout',
        description: formatWorkoutConflictDescription(conflicts),
        cancelLabel: 'Cancel',
        confirmLabel: 'Create another anyway',
        variant: 'default',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }

  function toggleTagFilter(tag: string) {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag],
    );
  }

  return (
    <section className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">Templates</h2>
        <p className="max-w-2xl text-sm text-muted">
          Launch one of your saved templates and jump straight into an active workout.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-end">
        <label className="relative block" htmlFor="template-search">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            aria-label="Search templates by name"
            autoComplete="off"
            className="pl-9"
            id="template-search"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search templates by name"
            type="search"
            value={searchQuery}
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-muted">Sort</span>
          <SortSelector
            ariaLabel="Sort templates"
            onChange={(value) => {
              if (!isTemplateSort(value)) {
                return;
              }

              setSearchParams((current) => {
                const next = new URLSearchParams(current);
                next.set('sort', value);
                next.set('page', String(DEFAULT_PAGE));
                return next;
              });
            }}
            options={templateSortOptions}
            value={sort}
          />
        </label>
      </div>

      {availableTags.length > 0 ? (
        <div className="space-y-2" role="group" aria-label="Filter templates by tag">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-muted">Filter by tags</p>
            {activeSelectedTags.length > 0 ? (
              <Button
                className="h-7 px-2 text-xs"
                onClick={() => setSelectedTags([])}
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-3.5" />
                Clear filters
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <Button
                  aria-label={`Filter by tag ${formatLabel(tag)}`}
                  aria-pressed={isSelected}
                  className={cn(
                    'h-7 rounded-full px-3 text-xs',
                    isSelected && 'border-primary bg-primary/10 text-primary',
                  )}
                  key={tag}
                  onClick={() => toggleTagFilter(tag)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {formatLabel(tag)}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      {resolvedTotalTemplates > limit ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">{`Showing ${sortedTemplates.length} of ${resolvedTotalTemplates} templates`}</p>
          <div className="flex items-center gap-2">
            <PerPageSelector
              ariaLabel="Templates per page"
              onChange={(value) => {
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set('limit', String(value));
                  next.set('page', String(DEFAULT_PAGE));
                  return next;
                });
              }}
              value={limit}
            />
            <Button
              disabled={page <= DEFAULT_PAGE}
              onClick={() => {
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set('page', String(Math.max(DEFAULT_PAGE, page - 1)));
                  return next;
                });
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Previous
            </Button>
            <span className="text-sm text-muted">{`Page ${page} of ${totalPages}`}</span>
            <Button
              disabled={page >= totalPages}
              onClick={() => {
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set('page', String(Math.min(totalPages, page + 1)));
                  return next;
                });
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted">No templates yet — create your first one.</p>
          </CardContent>
        </Card>
      ) : sortedTemplates.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted">No templates match the selected filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {sortedTemplates.map((template) => {
            const exerciseCount = countTemplateExercises(template);

            return (
              <div
                className="relative rounded-xl border border-border bg-card p-5 pr-14 text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                key={template.id}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={`Template actions for ${template.name}`}
                      className="absolute top-3 right-3"
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <MoreVertical aria-hidden="true" className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() =>
                        setScheduleTarget({
                          id: template.id,
                          name: template.name,
                        })
                      }
                    >
                      Schedule workout
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setRenameTarget({
                          id: template.id,
                          name: template.name,
                        });
                        setRenameValue(template.name);
                      }}
                    >
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        confirm({
                          title: 'Delete template?',
                          description: `This will permanently remove "${template.name}" from your templates.`,
                          confirmLabel: 'Delete template',
                          variant: 'destructive',
                          onConfirm: () => handleDeleteTemplate(template.id),
                        })
                      }
                      variant="destructive"
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Link
                  aria-label={template.name}
                  className="block rounded-lg focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  to={buildTemplateHref(template.id)}
                >
                  <div className="flex flex-col gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-xl font-semibold text-foreground">{template.name}</h3>
                        <ArrowRight aria-hidden="true" className="size-4 text-muted" />
                      </div>
                      {template.description ? (
                        <p className="text-sm text-muted">{template.description}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {template.tags.map((tag) => (
                        <Badge
                          className="border-border bg-secondary/70"
                          key={tag}
                          variant="outline"
                        >
                          {formatLabel(tag)}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm text-muted">
                      <div className="inline-flex items-center gap-2">
                        <ListChecks aria-hidden="true" className="size-4" />
                        <span>{`${exerciseCount} exercises`}</span>
                      </div>
                      <div className="inline-flex items-center gap-2">
                        <Tag aria-hidden="true" className="size-4" />
                        <span>{`${template.tags.length} tags`}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <Dialog onOpenChange={(open) => !open && setRenameTarget(null)} open={renameTarget !== null}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename template</DialogTitle>
            <DialogDescription>Update the template name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="template-rename-input">
              Template name
            </label>
            <Input
              autoFocus
              id="template-rename-input"
              onChange={(event) => setRenameValue(event.target.value)}
              value={renameValue}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setRenameTarget(null);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!canSubmitRename}
              onClick={() => {
                if (!renameTarget) {
                  return;
                }

                renameTemplateMutation.mutate(
                  {
                    id: renameTarget.id,
                    name: trimmedRenameValue,
                  },
                  {
                    onError: (error) => {
                      const message =
                        error instanceof ApiError ? error.message : 'Unable to rename template.';
                      toast.error(message);
                    },
                    onSuccess: () => {
                      setRenameTarget(null);
                    },
                  },
                );
              }}
              type="button"
            >
              {renameTemplateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScheduleWorkoutDialog
        description={`Pick a date for ${scheduleTarget?.name ?? 'this template'}.`}
        initialDate={scheduleInitialDate}
        isPending={scheduleWorkoutMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setScheduleTarget(null);
          }
        }}
        onSubmitDate={async (dateKey: string) => {
          if (!scheduleTarget) {
            return;
          }

          const shouldProceed = await confirmDuplicateDayWorkouts(dateKey);
          if (!shouldProceed) {
            return;
          }

          await scheduleWorkoutMutation.mutateAsync({
            date: dateKey,
            templateId: scheduleTarget.id,
          });

          setScheduleTarget(null);
        }}
        open={scheduleTarget !== null}
        submitLabel="Schedule"
        title="Schedule workout"
      />

      {dialog}
    </section>
  );
}

function isTemplateSort(value: string): value is WorkoutTemplateSort {
  return templateSortValues.includes(value as WorkoutTemplateSort);
}

function parseTemplateSort(value: string | null): WorkoutTemplateSort {
  return value !== null && isTemplateSort(value) ? value : 'newest';
}

function parsePage(value: string | null) {
  const page = Number.parseInt(value ?? String(DEFAULT_PAGE), 10);

  return Number.isNaN(page) || page < DEFAULT_PAGE ? DEFAULT_PAGE : page;
}

function parsePageSize(value: string | null) {
  const limit = Number.parseInt(value ?? String(DEFAULT_PAGE_SIZE), 10);

  return pageSizeOptions.includes(limit as (typeof pageSizeOptions)[number])
    ? limit
    : DEFAULT_PAGE_SIZE;
}

function sortTemplates(templates: TemplateSummary[], sort: WorkoutTemplateSort) {
  const copy = [...templates];
  const byName = (left: TemplateSummary, right: TemplateSummary) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });

  switch (sort) {
    case 'name-asc':
      return copy.sort(byName);
    case 'name-desc':
      return copy.sort((left, right) => byName(right, left));
    case 'oldest':
      return copy.sort(
        (left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0) || byName(left, right),
      );
    case 'recently-updated':
      return copy.sort(
        (left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0) || byName(left, right),
      );
    case 'newest':
    default:
      return copy.sort(
        (left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0) || byName(left, right),
      );
  }
}

function countTemplateExercises(template: TemplateSummary) {
  return template.sections.reduce((total, section) => total + section.exercises.length, 0);
}

function formatLabel(value: string) {
  return value
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(' ');
}
