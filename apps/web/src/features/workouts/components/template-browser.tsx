import { useMemo, useState } from 'react';
import { ArrowRight, ListChecks, MoreVertical, Search, Tag } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useDeleteTemplate, useRenameTemplate } from '@/features/workouts/api/workouts';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// Minimal structural interface — satisfied by both mock and API WorkoutTemplate shapes.
interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  sections: Array<{ exercises: unknown[] }>;
}

type TemplateBrowserProps = {
  buildTemplateHref: (templateId: string) => string;
  className?: string;
  templates?: TemplateSummary[];
};

export function TemplateBrowser({
  buildTemplateHref,
  className,
  templates = [],
}: TemplateBrowserProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameTemplateMutation = useRenameTemplate();
  const deleteTemplateMutation = useDeleteTemplate();
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) => {
        if (!normalizedQuery) {
          return true;
        }

        const searchableText =
          `${template.name} ${template.description ?? ''} ${template.tags.join(' ')}`
            .trim()
            .toLowerCase();

        return searchableText.includes(normalizedQuery);
      }),
    [normalizedQuery, templates],
  );

  const trimmedRenameValue = renameValue.trim();
  const canSubmitRename =
    renameTarget != null &&
    trimmedRenameValue.length > 0 &&
    trimmedRenameValue !== renameTarget.name &&
    !renameTemplateMutation.isPending;

  return (
    <section className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">Templates</h2>
        <p className="max-w-2xl text-sm text-muted">
          Launch one of your saved templates and jump straight into an active workout.
        </p>
      </div>

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

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted">No templates yet — create your first one.</p>
          </CardContent>
        </Card>
      ) : filteredTemplates.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted">No templates match that search.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredTemplates.map((template) => {
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
                        setDeleteTarget({
                          id: template.id,
                          name: template.name,
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
                      <Badge className="border-border bg-secondary/70" key={tag} variant="outline">
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

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
        open={renameTarget != null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename template</DialogTitle>
            <DialogDescription>Update the template name.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!renameTarget || !canSubmitRename) {
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
          >
            <Input
              aria-label="Template name"
              autoFocus
              onChange={(event) => setRenameValue(event.target.value)}
              value={renameValue}
            />
            <DialogFooter>
              <Button onClick={() => setRenameTarget(null)} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={!canSubmitRename} type="submit">
                {renameTemplateMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget != null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTemplateMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteTemplateMutation.isPending}
              onClick={(event) => {
                event.preventDefault();

                if (!deleteTarget) {
                  return;
                }

                deleteTemplateMutation.mutate(
                  {
                    id: deleteTarget.id,
                  },
                  {
                    onError: (error) => {
                      const message =
                        error instanceof ApiError ? error.message : 'Unable to delete template.';
                      toast.error(message);
                    },
                    onSuccess: () => {
                      setDeleteTarget(null);
                    },
                  },
                );
              }}
            >
              {deleteTemplateMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function countTemplateExercises(template: TemplateSummary) {
  return template.sections.reduce((total, section) => total + section.exercises.length, 0);
}

function formatLabel(value: string) {
  return value
    .split(/[- ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
