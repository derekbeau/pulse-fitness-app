import { cn } from '@/lib/utils';

export type ChartLegendItem = {
  color: string;
  label: string;
  style?: 'line' | 'dashed' | 'dot' | 'pattern';
};

type ChartLegendProps = {
  className?: string;
  items: readonly ChartLegendItem[];
  label?: string;
};

export function ChartLegend({ className, items, label = 'Chart legend' }: ChartLegendProps) {
  return (
    <ul
      aria-label={label}
      className={cn('flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground', className)}
    >
      {items.map((item) => (
        <li className="inline-flex items-center gap-2" key={item.label}>
          <span
            aria-hidden="true"
            className={cn(
              'inline-block shrink-0',
              item.style === 'dot' ? 'size-2.5 rounded-full' : 'h-2 w-6',
              item.style === 'pattern' && 'border border-current opacity-70',
              (!item.style || item.style === 'line') && 'border-t-2',
              item.style === 'dashed' && 'border-t-2 border-dashed',
            )}
            style={
              item.style === 'dot'
                ? { backgroundColor: item.color }
                : item.style === 'pattern'
                  ? {
                      backgroundImage: `repeating-linear-gradient(135deg, transparent 0 3px, ${item.color} 3px 4px)`,
                      color: item.color,
                    }
                  : { borderColor: item.color }
            }
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
