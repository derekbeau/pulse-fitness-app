import { ArrowLeft, FileUp } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import {
  buildConditionDetailPath,
  resourceTypeBadgeClasses,
  resourceTypeLabels,
} from '../lib/resource-ui';
import type { Resource } from '../types';

type ResourceDetailProps = {
  resource?: Resource;
};

export function ResourceDetail({ resource }: ResourceDetailProps) {
  return (
    <section
      className={cn(
        'mx-auto flex w-full flex-col gap-6 pb-10',
        resource ? 'max-w-5xl' : 'max-w-4xl',
      )}
    >
      <Button
        asChild
        className="w-fit gap-2 px-0 text-muted-foreground hover:text-foreground"
        size="sm"
        variant="ghost"
      >
        <Link to="/profile/resources">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to Resources
        </Link>
      </Button>

      {!resource ? (
        <Card>
          <CardHeader className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">Resource not found</h1>
            <CardDescription>
              The requested resource is not available in the current prototype library.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden border-border/70 bg-card/90 py-0">
            <div className="space-y-5 bg-linear-to-br from-secondary via-card to-card px-6 py-6 sm:px-8">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge
                    className={cn(
                      'px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.14em]',
                      resourceTypeBadgeClasses[resource.type],
                    )}
                    variant="outline"
                  >
                    {resourceTypeLabels[resource.type]}
                  </Badge>
                  <p className="text-sm font-medium text-muted-foreground">{resource.author}</p>
                </div>

                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    {resource.title}
                  </h1>
                  <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                    {resource.description}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {resource.tags.map((tag) => (
                  <Badge
                    className="border-border/80 bg-background/80 px-2.5 py-1 text-[0.72rem] font-medium text-muted-foreground"
                    key={tag}
                    variant="outline"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <Card className="gap-4">
              <CardHeader className="space-y-2">
                <h2 className="text-xl font-semibold text-foreground">
                  Key Principles &amp; Methods
                </h2>
                <CardDescription>
                  Core ideas captured from this resource for quick review.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="list-decimal space-y-3 pl-5 text-sm leading-7 text-foreground marker:font-semibold marker:text-primary">
                  {resource.principles.map((principle) => (
                    <li key={principle}>{principle}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-6">
              <Card className="gap-4">
                <CardHeader className="space-y-2">
                  <h2 className="text-xl font-semibold text-foreground">
                    Exercises from this Resource
                  </h2>
                </CardHeader>
                <CardContent>
                  {resource.linkedExercises.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {resource.linkedExercises.map((exercise) => (
                        <Link
                          className={cn(
                            buttonVariants({ size: 'sm', variant: 'outline' }),
                            'rounded-full border-border bg-background/70 text-sm font-medium',
                          )}
                          key={exercise.id}
                          to={`/workouts?view=exercises&exercise=${exercise.id}`}
                        >
                          {exercise.name}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No linked exercises</p>
                  )}
                </CardContent>
              </Card>

              <Card className="gap-4">
                <CardHeader className="space-y-2">
                  <h2 className="text-xl font-semibold text-foreground">
                    Related Health Protocols
                  </h2>
                </CardHeader>
                <CardContent>
                  {resource.linkedProtocols.length > 0 ? (
                    <div className="space-y-3">
                      {resource.linkedProtocols.map((protocol) => (
                        <div
                          className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-secondary/35 p-4 sm:flex-row sm:items-center sm:justify-between"
                          key={protocol.id}
                        >
                          <div className="space-y-1">
                            <p className="font-medium text-foreground">{protocol.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {protocol.conditionName}
                            </p>
                          </div>
                          <Link
                            className={cn(
                              buttonVariants({ size: 'sm', variant: 'ghost' }),
                              'w-fit px-0 text-primary hover:text-primary',
                            )}
                            to={buildConditionDetailPath(protocol.conditionName)}
                          >
                            View condition
                          </Link>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No linked protocols</p>
                  )}
                </CardContent>
              </Card>

              <Card className="gap-4">
                <CardHeader className="space-y-2">
                  <h2 className="text-xl font-semibold text-foreground">Document Upload</h2>
                  <CardDescription>
                    Keep the source material attached to this reference.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    aria-disabled="true"
                    className="relative rounded-2xl border-2 border-dashed border-border/70 bg-secondary/25 p-6 opacity-65 grayscale"
                  >
                    <Badge className="absolute right-3 top-3" variant="secondary">
                      Coming Soon
                    </Badge>
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="rounded-full border border-border/70 bg-background/80 p-3">
                        <FileUp aria-hidden="true" className="size-5 text-muted-foreground" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">Upload Resource Document</p>
                        <p className="text-sm text-muted-foreground">PDF, EPUB, TXT</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
