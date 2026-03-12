import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type TagChipsProps = {
  className?: string;
  tags: string[];
};

export function TagChips({ className, tags }: TagChipsProps) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {tags.map((tag) => (
        <Badge
          className="border-border/70 bg-secondary/45 text-xs font-medium text-muted-foreground"
          key={tag}
          variant="outline"
        >
          {formatTag(tag)}
        </Badge>
      ))}
    </div>
  );
}

function formatTag(value: string) {
  return value
    .split(/[- ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
