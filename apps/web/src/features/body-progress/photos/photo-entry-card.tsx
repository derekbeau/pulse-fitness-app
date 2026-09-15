import { Camera, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePhotoPreferences, usePhotoSets } from './api';
import { formatPhotoDate } from './utils';

export function PhotoEntryCard() {
  const preferences = usePhotoPreferences();
  const sets = usePhotoSets(1);
  const latest = sets.data?.data[0];

  return (
    <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/[0.06] via-background to-background">
      <CardHeader>
        <div className="flex items-center gap-2 text-primary">
          <LockKeyhole aria-hidden="true" className="size-5" />
          <span className="text-sm font-medium">Private media</span>
        </div>
        <CardTitle>Progress photos, without analysis</CardTitle>
        <CardDescription>
          Optional encrypted photo sets live separately from circumference analytics. No image loads
          on this page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preferences.isPending || sets.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : preferences.isError || sets.isError ? (
          <div role="alert">
            <p className="text-sm">
              Private-photo status could not be loaded. No state was guessed.
            </p>
            <Button
              className="mt-2"
              onClick={() => void Promise.all([preferences.refetch(), sets.refetch()])}
              variant="outline"
            >
              Retry photo status
            </Button>
          </div>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Consent</dt>
              <dd>
                <Badge
                  variant={preferences.data?.consent.state === 'granted' ? 'default' : 'secondary'}
                >
                  {preferences.data?.consent.state.replace('_', ' ')}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Schedule</dt>
              <dd className="font-medium">
                {preferences.data?.due.state} · {preferences.data?.due.dueDate}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Latest set</dt>
              <dd className="font-medium">
                {latest ? (
                  <Link
                    className="underline underline-offset-4"
                    to={`/body/photos?set=${latest.id}`}
                  >
                    {formatPhotoDate(latest.date)} · {latest.status}
                  </Link>
                ) : (
                  'No sets yet'
                )}
              </dd>
            </div>
          </dl>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/body/photos">
              <Camera aria-hidden="true" /> Open private photos
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/body/photos">Review privacy and cadence</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
