import { useParams } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConditionDetail, mockHealthConditions } from '@/features/injuries';

export function InjuryDetailPage() {
  const { conditionId } = useParams();
  const condition = mockHealthConditions.find((item) => item.id === conditionId);

  if (!condition) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-10">
        <PageHeader
          description="The requested condition ID is not present in the mock injuries dataset."
          title="Condition not found"
        />

        <Card className="py-6 shadow-sm">
          <CardHeader className="gap-2">
            <CardTitle className="text-2xl text-foreground">
              Requested condition unavailable
            </CardTitle>
            <CardDescription>
              This preview includes only the seeded mock conditions.
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
