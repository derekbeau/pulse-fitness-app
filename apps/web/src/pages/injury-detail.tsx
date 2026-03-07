import { ArrowLeftIcon } from 'lucide-react';
import { Link, useParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConditionDetail, mockHealthConditions } from '@/features/injuries';

export function InjuryDetailPage() {
  const { conditionId } = useParams();
  const condition = mockHealthConditions.find((item) => item.id === conditionId);

  if (!condition) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-10">
        <Button asChild className="w-fit gap-2" size="sm" variant="ghost">
          <Link to="/profile/injuries">
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
            Back to Health Tracking
          </Link>
        </Button>

        <Card className="py-6 shadow-sm">
          <CardHeader className="gap-2">
            <CardTitle className="text-2xl text-foreground">Condition not found</CardTitle>
            <CardDescription>
              The requested condition ID is not present in the mock injuries dataset.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Return to the health tracking list and pick one of the available conditions.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return <ConditionDetail condition={condition} />;
}
