import { cn } from '@/lib/utils';

export type ChartAnnotation = {
  date: string;
  id: string;
  label: string;
};

type ChartAnnotationLayerProps<TAnnotation extends ChartAnnotation> = {
  annotations: readonly TAnnotation[];
  className?: string;
  formatDate: (date: string) => string;
  label?: string;
  onSelect?: (annotation: TAnnotation) => void;
  selectedId?: string | null;
};

export function ChartAnnotationLayer<TAnnotation extends ChartAnnotation>({
  annotations,
  className,
  formatDate,
  label = 'Chart annotations',
  onSelect,
  selectedId,
}: ChartAnnotationLayerProps<TAnnotation>) {
  if (annotations.length === 0) return null;

  return (
    <div aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {annotations.map((annotation) => {
        const contents = `${formatDate(annotation.date)} · ${annotation.label}`;
        return onSelect ? (
          <button
            aria-pressed={selectedId === annotation.id}
            className="min-h-11 cursor-pointer rounded-full border border-border/70 bg-background/60 px-3 text-left text-xs text-muted-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-date={annotation.date}
            key={annotation.id}
            onClick={() => onSelect(annotation)}
            type="button"
          >
            {contents}
          </button>
        ) : (
          <span
            className="rounded-full border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground"
            data-date={annotation.date}
            key={annotation.id}
          >
            {contents}
          </span>
        );
      })}
    </div>
  );
}
