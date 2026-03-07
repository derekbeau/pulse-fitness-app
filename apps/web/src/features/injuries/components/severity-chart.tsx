import { useId, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SeverityPoint, TimelineEvent, TimelineEventType } from '../types';

type SeverityChartProps = {
  severityHistory: SeverityPoint[];
  timeline: TimelineEvent[];
};

type SeverityChartDatum = {
  date: string;
  events: TimelineEvent[];
  primaryEventType?: TimelineEventType;
  timestamp: number;
  value: number;
};

type EventMarkerDotProps = {
  cx?: number;
  cy?: number;
  payload?: SeverityChartDatum;
};

type HoveredEventState = {
  datum: SeverityChartDatum;
  x: number;
  y: number;
};

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

const EVENT_META: Record<
  TimelineEventType,
  {
    badgeTextColor: string;
    dotFill: string;
    dotStroke: string;
    label: string;
  }
> = {
  onset: {
    badgeTextColor: '#ffffff',
    dotFill: 'var(--color-destructive)',
    dotStroke: 'color-mix(in srgb, var(--color-destructive) 30%, var(--color-card))',
    label: 'Onset',
  },
  flare: {
    badgeTextColor: 'var(--color-on-cream)',
    dotFill: 'color-mix(in srgb, var(--color-destructive) 68%, var(--color-accent-cream))',
    dotStroke: 'color-mix(in srgb, var(--color-destructive) 28%, var(--color-card))',
    label: 'Flare',
  },
  improvement: {
    badgeTextColor: 'var(--color-on-mint)',
    dotFill: 'var(--color-accent-mint)',
    dotStroke: 'var(--color-on-mint)',
    label: 'Improvement',
  },
  treatment: {
    badgeTextColor: '#ffffff',
    dotFill: 'var(--color-primary)',
    dotStroke: 'color-mix(in srgb, var(--color-primary) 35%, var(--color-card))',
    label: 'Treatment',
  },
  milestone: {
    badgeTextColor: 'var(--color-on-cream)',
    dotFill: 'var(--color-accent-cream)',
    dotStroke: 'var(--color-on-cream)',
    label: 'Milestone',
  },
};

function parseDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

function toTimestamp(date: string) {
  return parseDate(date).getTime();
}

function formatFullDate(date: string) {
  return fullDateFormatter.format(parseDate(date));
}

function interpolateSeverity(
  history: Array<{ timestamp: number; value: number }>,
  timestamp: number,
): number {
  const firstPoint = history[0];
  const lastPoint = history.at(-1);

  if (!firstPoint || !lastPoint) {
    return 0;
  }

  if (timestamp <= firstPoint.timestamp) {
    return firstPoint.value;
  }

  if (timestamp >= lastPoint.timestamp) {
    return lastPoint.value;
  }

  for (let index = 0; index < history.length - 1; index += 1) {
    const currentPoint = history[index];
    const nextPoint = history[index + 1];

    if (timestamp === currentPoint.timestamp) {
      return currentPoint.value;
    }

    if (timestamp < nextPoint.timestamp) {
      const progress =
        (timestamp - currentPoint.timestamp) / (nextPoint.timestamp - currentPoint.timestamp);

      return Number((currentPoint.value + (nextPoint.value - currentPoint.value) * progress).toFixed(2));
    }
  }

  return lastPoint.value;
}

function buildChartData(severityHistory: SeverityPoint[], timeline: TimelineEvent[]): SeverityChartDatum[] {
  const sortedHistory = [...severityHistory].sort(
    (left, right) => toTimestamp(left.date) - toTimestamp(right.date),
  );
  const historyByDate = new Map(sortedHistory.map((entry) => [entry.date, entry.value]));
  const eventMap = new Map<string, TimelineEvent[]>();

  for (const item of timeline) {
    const existingEvents = eventMap.get(item.date) ?? [];
    eventMap.set(item.date, [...existingEvents, item]);
  }

  const severitySeries = sortedHistory.map((entry) => ({
    timestamp: toTimestamp(entry.date),
    value: entry.value,
  }));
  const dates = Array.from(new Set([...historyByDate.keys(), ...eventMap.keys()])).sort(
    (left, right) => toTimestamp(left) - toTimestamp(right),
  );

  return dates.map((date) => {
    const events = eventMap.get(date) ?? [];
    const timestamp = toTimestamp(date);

    return {
      date,
      events,
      primaryEventType: events[0]?.type,
      timestamp,
      value: historyByDate.get(date) ?? interpolateSeverity(severitySeries, timestamp),
    };
  });
}

function EventTooltip({ hoveredEvent }: { hoveredEvent: HoveredEventState }) {
  return (
    <div
      className="pointer-events-none absolute z-10 max-w-xs rounded-2xl border border-border/70 bg-card/95 px-3 py-3 shadow-lg backdrop-blur"
      role="tooltip"
      style={{
        left: hoveredEvent.x,
        top: hoveredEvent.y - 16,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {formatFullDate(hoveredEvent.datum.date)}
      </p>
      <div className="mt-2 grid gap-2">
        {hoveredEvent.datum.events.map((event) => (
          <div className="space-y-1" key={`${event.date}-${event.type}-${event.event}`}>
            <Badge
              className="border-transparent"
              style={{
                backgroundColor: EVENT_META[event.type].dotFill,
                color: EVENT_META[event.type].badgeTextColor,
              }}
            >
              {EVENT_META[event.type].label}
            </Badge>
            <p className="text-sm font-medium leading-5 text-foreground">{event.event}</p>
            {event.notes ? (
              <p className="text-xs leading-5 text-muted-foreground">{event.notes}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SeverityChart({ severityHistory, timeline }: SeverityChartProps) {
  const chartId = useId();
  const [hoveredEvent, setHoveredEvent] = useState<HoveredEventState | null>(null);

  if (severityHistory.length < 2) {
    return (
      <Card className="py-6 shadow-sm">
        <CardHeader className="gap-2">
          <CardTitle className="text-2xl text-foreground">Pain / Severity Over Time</CardTitle>
          <CardDescription>
            Severity is tracked on a 1-10 scale, where 10 is the worst.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
            Not enough data to show a trend yet. Add at least two severity check-ins.
          </p>
        </CardContent>
      </Card>
    );
  }

  const data = buildChartData(severityHistory, timeline);
  const gradientId = `severity-gradient-${chartId.replace(/:/g, '-')}`;

  const renderEventDot = ({ cx, cy, payload }: EventMarkerDotProps) => {
    if (
      typeof cx !== 'number' ||
      typeof cy !== 'number' ||
      !payload?.primaryEventType ||
      payload.events.length === 0
    ) {
      return null;
    }

    const eventMeta = EVENT_META[payload.primaryEventType];

    return (
      <g>
        <circle
          aria-label={`${eventMeta.label} event on ${formatFullDate(payload.date)}`}
          className="cursor-pointer outline-none"
          cx={cx}
          cy={cy}
          data-slot="severity-event-marker"
          fill={eventMeta.dotFill}
          onBlur={() => setHoveredEvent(null)}
          onFocus={() => setHoveredEvent({ datum: payload, x: cx, y: cy })}
          onMouseEnter={() => setHoveredEvent({ datum: payload, x: cx, y: cy })}
          onMouseLeave={() => setHoveredEvent(null)}
          r={6}
          stroke={eventMeta.dotStroke}
          strokeWidth={2}
          tabIndex={0}
        />
        <circle
          cx={cx}
          cy={cy}
          fill="none"
          pointerEvents="none"
          r={10}
          stroke={eventMeta.dotFill}
          strokeOpacity={0.2}
          strokeWidth={6}
        />
      </g>
    );
  };

  return (
    <Card className="py-6 shadow-sm">
      <CardHeader className="gap-2">
        <CardTitle className="text-2xl text-foreground">Pain / Severity Over Time</CardTitle>
        <CardDescription>
          Severity is tracked on a 1-10 scale, where 10 is the worst. Markers line up with
          key recovery events.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {hoveredEvent ? <EventTooltip hoveredEvent={hoveredEvent} /> : null}

          <div
            aria-label="Pain / Severity Over Time chart"
            className="aspect-[16/9] w-full"
            data-slot="severity-chart"
            role="img"
          >
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart
                data={data}
                margin={{ bottom: 8, left: 4, right: 12, top: 16 }}
                onMouseLeave={() => setHoveredEvent(null)}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.34} />
                    <stop offset="100%" stopColor="var(--color-accent-mint)" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  opacity={0.35}
                  stroke="var(--color-border)"
                  strokeDasharray="4 4"
                  vertical={false}
                />
                <XAxis
                  axisLine={false}
                  dataKey="timestamp"
                  domain={['dataMin', 'dataMax']}
                  minTickGap={28}
                  scale="time"
                  tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                  tickFormatter={(value: number) => shortDateFormatter.format(new Date(value))}
                  tickLine={false}
                  type="number"
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  domain={[1, 10]}
                  label={{
                    angle: -90,
                    fill: 'var(--color-muted)',
                    position: 'insideLeft',
                    style: { textAnchor: 'middle' },
                    value: 'Severity',
                  }}
                  tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
                  tickLine={false}
                  ticks={[1, 3, 5, 7, 10]}
                  width={46}
                />
                <Area
                  dataKey="value"
                  dot={renderEventDot}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                  stroke="var(--color-primary)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  type="linear"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
