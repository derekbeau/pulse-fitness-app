import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DASHBOARD_WIDGET_IDS, type Habit } from '@pulse/shared';
import { ChevronDown, GripVertical, Settings2 } from 'lucide-react';
import { type ReactNode, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  getHabitIdFromDailyWidgetId,
  isDashboardStaticWidgetId,
  isHabitDailyWidgetId,
  toHabitDailyWidgetId,
  type DashboardStaticWidgetId,
  type HabitDailyWidgetId,
} from '@/features/dashboard/lib/widget-utils';
import { cn } from '@/lib/utils';

const ACTIVE_CONTAINER_ID = 'active-widgets';
const HIDDEN_CONTAINER_ID = 'hidden-widgets';
const HABIT_DAILY_GROUP_ID = 'habit-daily-group';
const HABIT_CHAIN_GROUP_ID = 'habit-chain-group';

type WidgetContainerId = typeof ACTIVE_CONTAINER_ID | typeof HIDDEN_CONTAINER_ID;
type EditableWidgetId = DashboardStaticWidgetId | typeof HABIT_DAILY_GROUP_ID | typeof HABIT_CHAIN_GROUP_ID;
type DashboardWidgetId = DashboardStaticWidgetId | HabitDailyWidgetId;

type WidgetSectionProps = {
  children: ReactNode;
  containerId: WidgetContainerId;
  description: string;
  title: string;
};

type SortableWidgetCardProps = {
  children: ReactNode;
  hidden: boolean;
  id: EditableWidgetId;
  label: string;
};

type DashboardEditModeProps = {
  habitChainIds: string[];
  habits: Habit[];
  onHabitChainIdsChange: (nextHabitChainIds: string[]) => void;
  onVisibleWidgetsChange: (nextVisibleWidgets: DashboardWidgetId[]) => void;
  renderHabitChainWidget: () => ReactNode;
  renderHabitDailyWidget: (habitId: string) => ReactNode;
  renderStaticWidget: (widgetId: DashboardStaticWidgetId) => ReactNode;
  visibleWidgets: DashboardWidgetId[];
};

function getAllStaticEditableWidgetIds() {
  return (Object.keys(DASHBOARD_WIDGET_IDS) as DashboardStaticWidgetId[]).filter(
    (widgetId) => widgetId !== 'habit-chain',
  );
}

function getInitialVisibleHabitDailyWidgetIds(visibleWidgets: DashboardWidgetId[]) {
  return visibleWidgets.filter(isHabitDailyWidgetId);
}

function getInitialActiveWidgetItems(visibleWidgets: DashboardWidgetId[]) {
  const activeWidgetIds: EditableWidgetId[] = [];
  let hasHabitDailyGroup = false;
  let hasHabitChainGroup = false;

  for (const widgetId of visibleWidgets) {
    if (isHabitDailyWidgetId(widgetId)) {
      if (!hasHabitDailyGroup) {
        activeWidgetIds.push(HABIT_DAILY_GROUP_ID);
        hasHabitDailyGroup = true;
      }
      continue;
    }

    if (!isDashboardStaticWidgetId(widgetId)) {
      continue;
    }

    if (widgetId === 'habit-chain') {
      if (!hasHabitChainGroup) {
        activeWidgetIds.push(HABIT_CHAIN_GROUP_ID);
        hasHabitChainGroup = true;
      }
      continue;
    }

    activeWidgetIds.push(widgetId);
  }

  return activeWidgetIds;
}

function getInitialHiddenWidgetItems(activeWidgetIds: EditableWidgetId[]) {
  const allWidgetIds: EditableWidgetId[] = [
    ...getAllStaticEditableWidgetIds(),
    HABIT_DAILY_GROUP_ID,
    HABIT_CHAIN_GROUP_ID,
  ];

  return allWidgetIds.filter((widgetId) => !activeWidgetIds.includes(widgetId));
}

function buildVisibleWidgetsFromState(
  activeWidgetIds: EditableWidgetId[],
  visibleHabitDailyWidgetIds: HabitDailyWidgetId[],
): DashboardWidgetId[] {
  const visibleWidgets: DashboardWidgetId[] = [];

  for (const widgetId of activeWidgetIds) {
    if (widgetId === HABIT_DAILY_GROUP_ID) {
      visibleWidgets.push(...visibleHabitDailyWidgetIds);
      continue;
    }

    if (widgetId === HABIT_CHAIN_GROUP_ID) {
      visibleWidgets.push('habit-chain');
      continue;
    }

    visibleWidgets.push(widgetId);
  }

  return visibleWidgets;
}

function resolveDropIndex(items: EditableWidgetId[], overId: string, overContainerId: WidgetContainerId) {
  if (overId === overContainerId) {
    return items.length;
  }

  const overIndex = items.indexOf(overId as EditableWidgetId);
  return overIndex < 0 ? items.length : overIndex;
}

function reorderItems(items: EditableWidgetId[], activeId: string, overId: string) {
  const oldIndex = items.indexOf(activeId as EditableWidgetId);
  const newIndex = items.indexOf(overId as EditableWidgetId);

  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
    return items;
  }

  const reordered = [...items];
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);
  return reordered;
}

function resolveContainer(
  id: UniqueIdentifier,
  activeWidgetIds: EditableWidgetId[],
  hiddenWidgetIds: EditableWidgetId[],
): WidgetContainerId | null {
  const value = String(id);

  if (value === ACTIVE_CONTAINER_ID || value === HIDDEN_CONTAINER_ID) {
    return value;
  }

  if (activeWidgetIds.includes(value as EditableWidgetId)) {
    return ACTIVE_CONTAINER_ID;
  }

  if (hiddenWidgetIds.includes(value as EditableWidgetId)) {
    return HIDDEN_CONTAINER_ID;
  }

  return null;
}

function SortableWidgetCard({ children, hidden, id, label }: SortableWidgetCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      className={cn('relative', isDragging ? 'z-40' : undefined)}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        aria-label={`Drag ${label}`}
        className="absolute top-2 left-2 z-20 rounded-md border border-border/80 bg-background/95 p-1 text-muted-foreground shadow-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className={cn(hidden ? 'opacity-55 saturate-50' : undefined)}>{children}</div>
    </div>
  );
}

function WidgetSection({ children, containerId, description, title }: WidgetSectionProps) {
  const { isOver, setNodeRef } = useDroppable({ id: containerId });

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div
        className={cn(
          'space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3 transition-colors',
          isOver ? 'border-primary/50 bg-primary/8' : undefined,
        )}
        ref={setNodeRef}
      >
        {children}
      </div>
    </section>
  );
}

function HabitDailyWidgetGroupCard({
  habitIds,
  habits,
  onToggleHabit,
  renderHabitDailyWidget,
}: {
  habitIds: string[];
  habits: Habit[];
  onToggleHabit: (habitId: string, checked: boolean) => void;
  renderHabitDailyWidget: (habitId: string) => ReactNode;
}) {
  return (
    <Card className="border-dashed border-border/70 bg-card/85">
      <CardHeader className="gap-2 pl-12">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Habit Daily Status</CardTitle>
            <CardDescription>Grouped daily status cards for selected habits.</CardDescription>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" type="button" variant="outline">
                <Settings2 className="size-4" />
                Configure
                <ChevronDown className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3 p-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Toggle habits
              </p>
              <ul className="space-y-2">
                {habits.map((habit) => (
                  <li className="flex items-center justify-between gap-3" key={habit.id}>
                    <span className="text-sm text-foreground">{habit.name}</span>
                    <Switch
                      aria-label={`Toggle ${habit.name} daily status widget`}
                      checked={habitIds.includes(habit.id)}
                      onCheckedChange={(checked) => onToggleHabit(habit.id, checked)}
                    />
                  </li>
                ))}
                {habits.length === 0 ? (
                  <li className="text-sm text-muted-foreground">No habits available.</li>
                ) : null}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {habitIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No habit daily status cards selected.</p>
        ) : (
          habitIds.map((habitId) => <div key={habitId}>{renderHabitDailyWidget(habitId)}</div>)
        )}
      </CardContent>
    </Card>
  );
}

function HabitChainWidgetGroupCard({
  habitChainIds,
  habits,
  onToggleHabit,
  renderHabitChainWidget,
}: {
  habitChainIds: string[];
  habits: Habit[];
  onToggleHabit: (habitId: string, checked: boolean) => void;
  renderHabitChainWidget: () => ReactNode;
}) {
  return (
    <Card className="border-dashed border-border/70 bg-card/85">
      <CardHeader className="gap-2 pl-12">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Habit Chain</CardTitle>
            <CardDescription>Grouped habit chain filters for the chain widget.</CardDescription>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" type="button" variant="outline">
                <Settings2 className="size-4" />
                Filters
                <ChevronDown className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3 p-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Habit chain filters
              </p>
              <ul className="space-y-2">
                {habits.map((habit) => (
                  <li className="flex items-center justify-between gap-3" key={habit.id}>
                    <span className="text-sm text-foreground">{habit.name}</span>
                    <Switch
                      aria-label={`Toggle ${habit.name} in habit chain`}
                      checked={habitChainIds.includes(habit.id)}
                      onCheckedChange={(checked) => onToggleHabit(habit.id, checked)}
                    />
                  </li>
                ))}
                {habits.length === 0 ? (
                  <li className="text-sm text-muted-foreground">No habits available.</li>
                ) : null}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent>{renderHabitChainWidget()}</CardContent>
    </Card>
  );
}

export function DashboardEditMode({
  habitChainIds,
  habits,
  onHabitChainIdsChange,
  onVisibleWidgetsChange,
  renderHabitChainWidget,
  renderHabitDailyWidget,
  renderStaticWidget,
  visibleWidgets,
}: DashboardEditModeProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const [activeDragId, setActiveDragId] = useState<EditableWidgetId | null>(null);
  const [activeWidgetIds, setActiveWidgetIds] = useState<EditableWidgetId[]>(() =>
    getInitialActiveWidgetItems(visibleWidgets),
  );
  const [hiddenWidgetIds, setHiddenWidgetIds] = useState<EditableWidgetId[]>(() =>
    getInitialHiddenWidgetItems(getInitialActiveWidgetItems(visibleWidgets)),
  );
  const [visibleHabitDailyWidgetIds, setVisibleHabitDailyWidgetIds] = useState<HabitDailyWidgetId[]>(
    () => getInitialVisibleHabitDailyWidgetIds(visibleWidgets),
  );
  const movedAcrossContainersRef = useRef(false);

  const visibleHabitIds = useMemo(
    () => visibleHabitDailyWidgetIds.map(getHabitIdFromDailyWidgetId),
    [visibleHabitDailyWidgetIds],
  );

  function syncVisibleWidgets(nextActiveWidgetIds: EditableWidgetId[], nextHabitDailyWidgetIds: HabitDailyWidgetId[]) {
    onVisibleWidgetsChange(buildVisibleWidgetsFromState(nextActiveWidgetIds, nextHabitDailyWidgetIds));
  }

  function handleHabitChainToggle(habitId: string, checked: boolean) {
    if (checked) {
      if (habitChainIds.includes(habitId)) {
        return;
      }
      onHabitChainIdsChange([...habitChainIds, habitId]);
      return;
    }

    onHabitChainIdsChange(habitChainIds.filter((id) => id !== habitId));
  }

  function handleHabitDailyToggle(habitId: string, checked: boolean) {
    setVisibleHabitDailyWidgetIds((current) => {
      const targetWidgetId = toHabitDailyWidgetId(habitId);
      const hasWidget = current.includes(targetWidgetId);
      const nextWidgetIds = checked
        ? hasWidget
          ? current
          : [...current, targetWidgetId]
        : current.filter((widgetId) => widgetId !== targetWidgetId);

      if (nextWidgetIds.length > 0 && !activeWidgetIds.includes(HABIT_DAILY_GROUP_ID)) {
        const nextHidden = hiddenWidgetIds.filter((widgetId) => widgetId !== HABIT_DAILY_GROUP_ID);
        const nextActive: EditableWidgetId[] = [...activeWidgetIds, HABIT_DAILY_GROUP_ID];
        setHiddenWidgetIds(nextHidden);
        setActiveWidgetIds(nextActive);
        syncVisibleWidgets(nextActive, nextWidgetIds);
        return nextWidgetIds;
      }

      if (nextWidgetIds.length === 0 && activeWidgetIds.includes(HABIT_DAILY_GROUP_ID)) {
        const nextActive: EditableWidgetId[] = activeWidgetIds.filter(
          (widgetId) => widgetId !== HABIT_DAILY_GROUP_ID,
        );
        const nextHidden: EditableWidgetId[] = [...hiddenWidgetIds, HABIT_DAILY_GROUP_ID];
        setActiveWidgetIds(nextActive);
        setHiddenWidgetIds(nextHidden);
        syncVisibleWidgets(nextActive, nextWidgetIds);
        return nextWidgetIds;
      }

      syncVisibleWidgets(activeWidgetIds, nextWidgetIds);
      return nextWidgetIds;
    });
  }

  function getWidgetLabel(widgetId: EditableWidgetId) {
    if (widgetId === HABIT_DAILY_GROUP_ID) {
      return 'Habit Daily Status';
    }

    if (widgetId === HABIT_CHAIN_GROUP_ID) {
      return 'Habit Chain';
    }

    return DASHBOARD_WIDGET_IDS[widgetId];
  }

  function renderWidgetContent(widgetId: EditableWidgetId) {
    if (widgetId === HABIT_DAILY_GROUP_ID) {
      return (
        <HabitDailyWidgetGroupCard
          habitIds={visibleHabitIds}
          habits={habits}
          onToggleHabit={handleHabitDailyToggle}
          renderHabitDailyWidget={renderHabitDailyWidget}
        />
      );
    }

    if (widgetId === HABIT_CHAIN_GROUP_ID) {
      return (
        <HabitChainWidgetGroupCard
          habitChainIds={habitChainIds}
          habits={habits}
          onToggleHabit={handleHabitChainToggle}
          renderHabitChainWidget={renderHabitChainWidget}
        />
      );
    }

    return renderStaticWidget(widgetId);
  }

  function handleDragOver(event: DragOverEvent) {
    if (!event.over) {
      return;
    }

    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    const activeContainer = resolveContainer(event.active.id, activeWidgetIds, hiddenWidgetIds);
    const overContainer = resolveContainer(event.over.id, activeWidgetIds, hiddenWidgetIds);

    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return;
    }
    movedAcrossContainersRef.current = true;

    const sourceItems = activeContainer === ACTIVE_CONTAINER_ID ? activeWidgetIds : hiddenWidgetIds;
    const targetItems = overContainer === ACTIVE_CONTAINER_ID ? activeWidgetIds : hiddenWidgetIds;
    const activeIndex = sourceItems.indexOf(activeId as EditableWidgetId);

    if (activeIndex < 0) {
      return;
    }

    const nextSource = [...sourceItems];
    const [movedWidgetId] = nextSource.splice(activeIndex, 1);
    const targetIndex = resolveDropIndex(targetItems, overId, overContainer);
    const nextTarget = [...targetItems];
    nextTarget.splice(targetIndex, 0, movedWidgetId);

    const nextActiveWidgetIds =
      overContainer === ACTIVE_CONTAINER_ID ? nextTarget : nextSource;
    const nextHiddenWidgetIds =
      overContainer === ACTIVE_CONTAINER_ID ? nextSource : nextTarget;

    setActiveWidgetIds(nextActiveWidgetIds);
    setHiddenWidgetIds(nextHiddenWidgetIds);

    if (movedWidgetId === HABIT_DAILY_GROUP_ID && overContainer === HIDDEN_CONTAINER_ID) {
      setVisibleHabitDailyWidgetIds([]);
      syncVisibleWidgets(nextActiveWidgetIds, []);
      return;
    }

    if (
      movedWidgetId === HABIT_DAILY_GROUP_ID &&
      overContainer === ACTIVE_CONTAINER_ID &&
      visibleHabitDailyWidgetIds.length === 0
    ) {
      const habitDailyIds = habits.map((habit) => toHabitDailyWidgetId(habit.id));
      setVisibleHabitDailyWidgetIds(habitDailyIds);
      syncVisibleWidgets(nextActiveWidgetIds, habitDailyIds);
      return;
    }

    syncVisibleWidgets(nextActiveWidgetIds, visibleHabitDailyWidgetIds);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const movedAcrossContainers = movedAcrossContainersRef.current;
    movedAcrossContainersRef.current = false;

    if (!event.over) {
      return;
    }

    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    const activeContainer = resolveContainer(event.active.id, activeWidgetIds, hiddenWidgetIds);
    const overContainer = resolveContainer(event.over.id, activeWidgetIds, hiddenWidgetIds);

    if (!activeContainer || !overContainer) {
      return;
    }

    if (movedAcrossContainers) {
      return;
    }

    if (activeContainer !== overContainer) {
      return;
    }

    if (activeContainer === ACTIVE_CONTAINER_ID) {
      const nextActiveWidgetIds = reorderItems(activeWidgetIds, activeId, overId);
      if (nextActiveWidgetIds === activeWidgetIds) {
        return;
      }

      setActiveWidgetIds(nextActiveWidgetIds);
      syncVisibleWidgets(nextActiveWidgetIds, visibleHabitDailyWidgetIds);
      return;
    }

    const nextHiddenWidgetIds = reorderItems(hiddenWidgetIds, activeId, overId);
    if (nextHiddenWidgetIds === hiddenWidgetIds) {
      return;
    }

    setHiddenWidgetIds(nextHiddenWidgetIds);
  }

  return (
    <div className="space-y-4" data-testid="dashboard-edit-mode">
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragStart={(event) => {
          movedAcrossContainersRef.current = false;
          setActiveDragId(String(event.active.id) as EditableWidgetId);
        }}
        sensors={sensors}
      >
        <WidgetSection
          containerId={ACTIVE_CONTAINER_ID}
          description="Drag to reorder or move to hidden."
          title="Active Widgets"
        >
          {activeWidgetIds.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 bg-background/55 px-3 py-4 text-sm text-muted-foreground">
              No active widgets selected.
            </p>
          ) : (
            <SortableContext items={activeWidgetIds} strategy={verticalListSortingStrategy}>
              {activeWidgetIds.map((widgetId) => (
                <SortableWidgetCard
                  hidden={false}
                  id={widgetId}
                  key={widgetId}
                  label={getWidgetLabel(widgetId)}
                >
                  {renderWidgetContent(widgetId)}
                </SortableWidgetCard>
              ))}
            </SortableContext>
          )}
        </WidgetSection>

        <div className="pt-1">
          <Separator />
        </div>

        <WidgetSection
          containerId={HIDDEN_CONTAINER_ID}
          description="Drag hidden widgets back into active to show them."
          title="Hidden Widgets"
        >
          {hiddenWidgetIds.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 bg-background/55 px-3 py-4 text-sm text-muted-foreground">
              All widgets are active.
            </p>
          ) : (
            <SortableContext items={hiddenWidgetIds} strategy={verticalListSortingStrategy}>
              {hiddenWidgetIds.map((widgetId) => (
                <SortableWidgetCard hidden id={widgetId} key={widgetId} label={getWidgetLabel(widgetId)}>
                  {renderWidgetContent(widgetId)}
                </SortableWidgetCard>
              ))}
            </SortableContext>
          )}
        </WidgetSection>

        <DragOverlay>
          {activeDragId ? (
            <div className="pointer-events-none w-full max-w-3xl opacity-90">{renderWidgetContent(activeDragId)}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
