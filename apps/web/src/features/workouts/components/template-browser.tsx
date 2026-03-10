import { useMemo, useState } from 'react';
import { ArrowRight, ListChecks, Search, Tag } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
              <Link
                aria-label={template.name}
                className="cursor-pointer rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                to={buildTemplateHref(template.id)}
                key={template.id}
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
            );
          })}
        </div>
      )}
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
