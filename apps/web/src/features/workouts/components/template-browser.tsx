import { useMemo, useState } from 'react';
import { ArrowRight, ListChecks, Tag } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription as DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { mockTemplates, type WorkoutTemplate } from '@/lib/mock-data/workouts';
import { cn } from '@/lib/utils';

type TemplateBrowserProps = {
  className?: string;
  onStartTemplate: (templateId: WorkoutTemplate['id']) => void;
  templates?: WorkoutTemplate[];
};

export function TemplateBrowser({
  className,
  onStartTemplate,
  templates = mockTemplates,
}: TemplateBrowserProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<WorkoutTemplate['id'] | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  return (
    <section className={cn('space-y-4', className)}>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">Templates</h2>
        <p className="max-w-2xl text-sm text-muted">
          Launch one of the saved mock templates and jump straight into an active workout.
        </p>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted">No workout templates are available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {templates.map((template) => {
            const exerciseCount = countTemplateExercises(template);

            return (
              <button
                aria-label={template.name}
                className="cursor-pointer rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                key={template.id}
                onClick={() => setSelectedTemplateId(template.id)}
                type="button"
              >
                <div className="flex flex-col gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xl font-semibold text-foreground">{template.name}</h3>
                      <ArrowRight aria-hidden="true" className="size-4 text-muted" />
                    </div>
                    <p className="text-sm text-muted">{template.description}</p>
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
              </button>
            );
          })}
        </div>
      )}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTemplateId(null);
          }
        }}
        open={selectedTemplate !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedTemplate ? `Start ${selectedTemplate.name}?` : 'Start template?'}</DialogTitle>
            <DialogBody>
              {selectedTemplate
                ? `This mock flow will open an active workout using the ${selectedTemplate.name} template.`
                : 'Choose a workout template to start.'}
            </DialogBody>
          </DialogHeader>

          {selectedTemplate ? (
            <Card className="gap-3 bg-secondary/35 py-0">
              <CardHeader className="pb-0 pt-5">
                <CardTitle className="text-base">{selectedTemplate.name}</CardTitle>
                <CardDescription>{selectedTemplate.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 pb-5">
                <Badge className="border-border bg-card" variant="outline">
                  {`${countTemplateExercises(selectedTemplate)} exercises`}
                </Badge>
                {selectedTemplate.tags.map((tag) => (
                  <Badge className="border-border bg-card" key={tag} variant="outline">
                    {formatLabel(tag)}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={() => {
                if (!selectedTemplate) {
                  return;
                }

                onStartTemplate(selectedTemplate.id);
                setSelectedTemplateId(null);
              }}
              type="button"
            >
              Start workout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function countTemplateExercises(template: WorkoutTemplate) {
  return template.sections.reduce((total, section) => total + section.exercises.length, 0);
}

function formatLabel(value: string) {
  return value
    .split(/[- ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
