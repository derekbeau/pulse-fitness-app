import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowUpDownIcon, CalendarDaysIcon, ClipboardPlusIcon } from 'lucide-react';
import { Link } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { mockHealthConditions } from '../lib/mock-data';
import type { ConditionStatus, HealthCondition } from '../types';

type ConditionsListProps = {
  conditions?: HealthCondition[];
};

type ConditionSortOption = 'status' | 'onset-date';

type ConditionDraft = {
  bodyArea: string;
  description: string;
  name: string;
  onsetDate: string;
  status: ConditionStatus;
};

const STATUS_ORDER: Record<ConditionStatus, number> = {
  active: 0,
  monitoring: 1,
  resolved: 2,
};

const CONDITION_STATUSES = ['active', 'monitoring', 'resolved'] as const;

const SORT_OPTIONS: Array<{ description: string; label: string; value: ConditionSortOption }> = [
  {
    description: 'Active first, then monitoring and resolved.',
    label: 'Status',
    value: 'status',
  },
  {
    description: 'Newest onset date first.',
    label: 'Onset date',
    value: 'onset-date',
  },
];

const STATUS_META: Record<
  ConditionStatus,
  {
    badgeClassName: string;
    label: string;
    summaryLabel: string;
  }
> = {
  active: {
    badgeClassName:
      'border-transparent bg-destructive text-white dark:bg-destructive/70 dark:text-white',
    label: 'Active',
    summaryLabel: 'active',
  },
  monitoring: {
    badgeClassName:
      'border-transparent bg-amber-200 text-amber-950 dark:bg-amber-500/20 dark:text-amber-300',
    label: 'Monitoring',
    summaryLabel: 'monitoring',
  },
  resolved: {
    badgeClassName:
      'border-transparent bg-emerald-200 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-300',
    label: 'Resolved',
    summaryLabel: 'resolved',
  },
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const lineClampStyle: CSSProperties = {
  display: '-webkit-box',
  overflow: 'hidden',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
};

function getDefaultDraft(): ConditionDraft {
  return {
    bodyArea: '',
    description: '',
    name: '',
    onsetDate: new Date().toISOString().slice(0, 10),
    status: 'monitoring',
  };
}

function createConditionId(name: string) {
  const baseSlug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${baseSlug || 'condition'}-${Date.now().toString(36)}`;
}

function getConditionCounts(conditions: HealthCondition[]) {
  return conditions.reduce(
    (counts, condition) => {
      counts[condition.status] += 1;
      return counts;
    },
    {
      active: 0,
      monitoring: 0,
      resolved: 0,
    },
  );
}

function formatConditionSummary(conditions: HealthCondition[]) {
  const counts = getConditionCounts(conditions);
  const conditionLabel = conditions.length === 1 ? 'condition' : 'conditions';

  return `${conditions.length} ${conditionLabel} (${counts.active} ${STATUS_META.active.summaryLabel}, ${counts.monitoring} ${STATUS_META.monitoring.summaryLabel}, ${counts.resolved} ${STATUS_META.resolved.summaryLabel})`;
}

function parseDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

function sortConditions(conditions: HealthCondition[], sortBy: ConditionSortOption) {
  return [...conditions].sort((left, right) => {
    const statusDifference = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
    const onsetDifference =
      parseDate(right.onsetDate).getTime() - parseDate(left.onsetDate).getTime();

    if (sortBy === 'status') {
      if (statusDifference !== 0) {
        return statusDifference;
      }
      if (onsetDifference !== 0) {
        return onsetDifference;
      }
    } else {
      if (onsetDifference !== 0) {
        return onsetDifference;
      }
      if (statusDifference !== 0) {
        return statusDifference;
      }
    }

    return left.name.localeCompare(right.name);
  });
}

export function ConditionsList({ conditions = mockHealthConditions }: ConditionsListProps) {
  const [addedConditions, setAddedConditions] = useState<HealthCondition[]>([]);
  const [sortBy, setSortBy] = useState<ConditionSortOption>('status');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [draftCondition, setDraftCondition] = useState<ConditionDraft>(() => getDefaultDraft());

  const allConditions = useMemo(
    () => [...addedConditions, ...conditions],
    [addedConditions, conditions],
  );
  const visibleConditions = useMemo(
    () => sortConditions(allConditions, sortBy),
    [allConditions, sortBy],
  );
  const conditionCounts = useMemo(() => getConditionCounts(allConditions), [allConditions]);

  function updateDraft<K extends keyof ConditionDraft>(field: K, value: ConditionDraft[K]) {
    setDraftCondition((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
  }

  function closeDialog() {
    setIsAddDialogOpen(false);
    setDraftCondition(getDefaultDraft());
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = draftCondition.name.trim();
    const bodyArea = draftCondition.bodyArea.trim();
    const description = draftCondition.description.trim();

    if (!name || !bodyArea || !draftCondition.onsetDate || !description) {
      return;
    }

    setAddedConditions((currentConditions) => [
      {
        id: createConditionId(name),
        name,
        bodyArea,
        status: draftCondition.status,
        onsetDate: draftCondition.onsetDate,
        description,
        timeline: [],
        protocols: [],
        linkedJournalEntries: [],
        severityHistory: [],
      },
      ...currentConditions,
    ]);

    closeDialog();
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-10">
      <PageHeader
        actions={
          <Button
            className="gap-2 self-start lg:self-auto"
            onClick={() => setIsAddDialogOpen(true)}
          >
            <ClipboardPlusIcon aria-hidden="true" className="size-4" />
            Add Condition
          </Button>
        }
        description="Keep the current condition list visible, sort the recovery picture quickly, and capture new issues without leaving the prototype flow."
        showBack
        title="Health Tracking"
      />

      <Card className="gap-5 overflow-hidden border-transparent bg-gradient-to-br from-[var(--color-accent-pink)]/40 via-card to-[var(--color-accent-cream)]/45 py-0 shadow-sm dark:border-border/60 dark:from-secondary dark:via-card dark:to-secondary">
        <CardHeader className="gap-4 border-b border-border/50 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="text-xl text-foreground">Condition overview</CardTitle>
              <CardDescription className="max-w-2xl text-sm text-muted-foreground">
                {formatConditionSummary(allConditions)}
              </CardDescription>
            </div>

            <div className="w-full max-w-xs space-y-2">
              <Label className="text-sm font-medium text-foreground" htmlFor="condition-sort">
                Sort conditions
              </Label>
              <Select
                onValueChange={(value) => setSortBy(value as ConditionSortOption)}
                value={sortBy}
              >
                <SelectTrigger aria-label="Sort conditions" id="condition-sort">
                  <div className="flex items-center gap-2">
                    <ArrowUpDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {SORT_OPTIONS.find((option) => option.value === sortBy)?.description}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-3 px-6 py-5 sm:grid-cols-3">
          {CONDITION_STATUSES.map((status) => {
            return (
              <div
                className="rounded-2xl border border-border/60 bg-background/75 px-4 py-3 shadow-sm backdrop-blur"
                key={status}
              >
                <div className="flex items-center justify-between gap-3">
                  <Badge className={STATUS_META[status].badgeClassName}>
                    {STATUS_META[status].label}
                  </Badge>
                  <span className="text-2xl font-semibold text-foreground">
                    {conditionCounts[status]}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {status === 'active'
                    ? 'Needs current training adjustments or symptom management.'
                    : status === 'monitoring'
                      ? 'Stable enough to watch, but still worth tracking.'
                      : 'Resolved enough to keep as historical context.'}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {visibleConditions.map((condition) => {
          return (
            <Link
              className="block cursor-pointer"
              key={condition.id}
              to={`/profile/injuries/${condition.id}`}
            >
              <Card className="h-full gap-4 py-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-within:border-primary/50">
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={STATUS_META[condition.status].badgeClassName}>
                          {STATUS_META[condition.status].label}
                        </Badge>
                        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {condition.bodyArea}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <CardTitle
                          aria-level={3}
                          className="text-xl text-foreground"
                          role="heading"
                        >
                          {condition.name}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 text-sm">
                          <CalendarDaysIcon aria-hidden="true" className="size-4" />
                          Onset {dateFormatter.format(new Date(condition.onsetDate))}
                        </CardDescription>
                      </div>
                    </div>

                    <span className="rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Open
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  <p className="text-sm leading-6 text-muted-foreground" style={lineClampStyle}>
                    {condition.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Dialog
        onOpenChange={(open) => (open ? setIsAddDialogOpen(true) : closeDialog())}
        open={isAddDialogOpen}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Condition</DialogTitle>
            <DialogDescription>
              Create a new locally tracked condition with the core details needed for the list view.
            </DialogDescription>
          </DialogHeader>

          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Name</span>
                <Input
                  aria-label="Condition name"
                  onChange={(event) => updateDraft('name', event.target.value)}
                  placeholder="Lumbar strain"
                  required
                  value={draftCondition.name}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Body area</span>
                <Input
                  aria-label="Body area"
                  onChange={(event) => updateDraft('bodyArea', event.target.value)}
                  placeholder="Lower back"
                  required
                  value={draftCondition.bodyArea}
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Status</span>
                <Select
                  onValueChange={(value) => updateDraft('status', value as ConditionStatus)}
                  value={draftCondition.status}
                >
                  <SelectTrigger aria-label="Condition status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['active', 'monitoring', 'resolved'] as const).map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_META[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-foreground">Onset date</span>
                <Input
                  aria-label="Onset date"
                  onChange={(event) => updateDraft('onsetDate', event.target.value)}
                  required
                  type="date"
                  value={draftCondition.onsetDate}
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">Description</span>
              <Textarea
                aria-label="Condition description"
                className="min-h-28"
                onChange={(event) => updateDraft('description', event.target.value)}
                placeholder="Brief note about symptoms, triggers, or what changed."
                required
                value={draftCondition.description}
              />
            </label>

            <DialogFooter>
              <Button onClick={closeDialog} type="button" variant="outline">
                Cancel
              </Button>
              <Button type="submit">Save Condition</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
