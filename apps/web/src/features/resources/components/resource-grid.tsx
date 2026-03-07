import { useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { resourceTypeBadgeClasses, resourceTypeLabels } from '../lib/resource-ui';
import type { Resource, ResourceType } from '../types';

type ResourceGridProps = {
  resources: Resource[];
};

type ResourceFilter = 'all' | ResourceType;

const FILTER_OPTIONS: Array<{ label: string; value: ResourceFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Programs', value: 'program' },
  { label: 'Books', value: 'book' },
  { label: 'Creators', value: 'creator' },
];

export function ResourceGrid({ resources }: ResourceGridProps) {
  const [activeFilter, setActiveFilter] = useState<ResourceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredResources = resources.filter((resource) => {
    const matchesType = activeFilter === 'all' || resource.type === activeFilter;
    const matchesSearch =
      normalizedQuery.length === 0 ||
      resource.title.toLowerCase().includes(normalizedQuery) ||
      resource.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));

    return matchesType && matchesSearch;
  });

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-10">
      <header className="space-y-4">
        <Button
          asChild
          className="w-fit gap-2 px-0 text-muted hover:text-foreground"
          size="sm"
          variant="ghost"
        >
          <Link to="/profile">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to Profile
          </Link>
        </Button>

        <div className="space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold text-primary">Resources</h1>
              <p className="max-w-3xl text-sm text-muted">
                Browse saved programs, books, and creators with quick tag search and type filters.
              </p>
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {`${filteredResources.length} resource${filteredResources.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
      </header>

      <Card className="gap-4 border-border/70 bg-card/80 py-4">
        <CardContent className="space-y-4 px-4 sm:px-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="resource-search">
              Search
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="border-border bg-background/70 pl-9"
                id="resource-search"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search titles or tags"
                type="search"
                value={searchQuery}
              />
            </div>
          </div>

          <div
            aria-label="Resource types"
            className="flex gap-2 overflow-x-auto pb-1"
            role="tablist"
          >
            {FILTER_OPTIONS.map((option) => {
              const isActive = option.value === activeFilter;

              return (
                <Button
                  aria-selected={isActive}
                  className="rounded-full"
                  key={option.value}
                  onClick={() => setActiveFilter(option.value)}
                  role="tab"
                  size="sm"
                  type="button"
                  variant={isActive ? 'default' : 'ghost'}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {filteredResources.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredResources.map((resource) => {
            const visibleTags = resource.tags.slice(0, 4);
            const hiddenTagCount = resource.tags.length - visibleTags.length;

            return (
              <Link
                aria-label={`Open ${resource.title}`}
                className="block cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                key={resource.id}
                to={`/profile/resources/${resource.id}`}
              >
                <Card className="h-full gap-4 py-0 transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                  <CardHeader className="gap-3 py-5">
                    <div className="flex items-center justify-between gap-3">
                      <Badge
                        className={cn(
                          'cursor-pointer px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]',
                          resourceTypeBadgeClasses[resource.type],
                        )}
                        variant="outline"
                      >
                        {resourceTypeLabels[resource.type]}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <CardTitle className="text-xl text-foreground">{resource.title}</CardTitle>
                      <CardDescription>{resource.author}</CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pb-5">
                    <p className="overflow-hidden text-sm leading-6 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {resource.description}
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {visibleTags.map((tag) => (
                        <Badge
                          className="cursor-pointer border-border/80 bg-secondary/65 px-2.5 py-1 text-[0.68rem] font-medium text-muted-foreground"
                          key={tag}
                          variant="outline"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {hiddenTagCount > 0 ? (
                        <Badge
                          className="cursor-pointer border-dashed border-border/80 bg-background/70 px-2.5 py-1 text-[0.68rem] font-medium text-muted-foreground"
                          variant="outline"
                        >
                          {`+${hiddenTagCount}`}
                        </Badge>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed border-border/80 bg-card/60">
          <CardHeader className="gap-2">
            <CardTitle>No resources found</CardTitle>
            <CardDescription>
              Adjust the search term or switch the type filter to see more results.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </section>
  );
}
