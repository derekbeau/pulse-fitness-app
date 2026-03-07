import { useParams } from 'react-router';

import { mockResources, ResourceDetail } from '@/features/resources';

export function ResourceDetailPage() {
  const { resourceId = '' } = useParams();
  const resource = mockResources.find((item) => item.id === resourceId);

  return <ResourceDetail resource={resource} />;
}
