import { useParams } from 'react-router';

import { ConditionsList } from '@/features/injuries';

export function InjuriesPage() {
  const { conditionId } = useParams();

  return <ConditionsList selectedConditionId={conditionId} />;
}
