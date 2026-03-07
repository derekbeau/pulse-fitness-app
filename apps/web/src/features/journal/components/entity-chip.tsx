import { Activity, Dumbbell, Heart, ListChecks } from 'lucide-react';
import { Link } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { LinkedEntity, LinkedEntityType } from '../types';

const iconByType: Record<LinkedEntityType, typeof Dumbbell> = {
  activity: Activity,
  habit: ListChecks,
  injury: Heart,
  workout: Dumbbell,
};

const hrefByType: Partial<Record<LinkedEntityType, string>> = {
  activity: '/activity',
  habit: '/habits',
  workout: '/workouts',
};

type EntityChipProps = {
  entity: LinkedEntity;
};

export function EntityChip({ entity }: EntityChipProps) {
  const Icon = iconByType[entity.type];
  const href = hrefByType[entity.type];
  const content = (
    <>
      <Icon aria-hidden="true" className="size-3.5" />
      <span>{entity.name}</span>
    </>
  );

  if (href) {
    return (
      <Badge
        asChild
        className={cn(
          'cursor-pointer rounded-full border-border/70 bg-background/75 px-3 py-1 text-xs font-medium text-muted shadow-sm transition-colors hover:border-primary/40 hover:bg-card hover:text-foreground',
        )}
        variant="outline"
      >
        <Link to={href}>{content}</Link>
      </Badge>
    );
  }

  return (
    <Badge
      className={cn(
        'cursor-pointer rounded-full border-border/70 bg-background/75 px-3 py-1 text-xs font-medium text-muted shadow-sm',
      )}
      variant="outline"
    >
      {content}
    </Badge>
  );
}
