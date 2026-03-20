/* eslint-disable react-refresh/only-export-components */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DASHBOARD_WIDGET_IDS, type Habit } from '@pulse/shared';
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { type ReactNode, useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';

const HABIT_DAILY_WIDGET_PREFIX = 'habit-daily:';

type WidgetCategoryId = 'overview' | 'workouts' | 'habits' | 'nutrition';
export type DashboardStaticWidgetId = keyof typeof DASHBOARD_WIDGET_IDS;
export type HabitDailyWidgetId = `${typeof HABIT_DAILY_WIDGET_PREFIX}${string}`;

type WidgetSidebarProps = {
  habitChainIds: string[];
  habits: Habit[];
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onReorderVisibleWidgets: (nextVisibleWidgets: string[]) => void;
  onSave: () => void;
  onToggleAllHabitDaily: (enabled: boolean) => void;
  onToggleHabitChain: (habitId: string, enabled: boolean) => void;
  onToggleHabitDaily: (habitId: string, enabled: boolean) => void;
  onToggleWidget: (widgetId: DashboardStaticWidgetId, enabled: boolean) => void;
  open: boolean;
  saveErrorMessage?: string;
  visibleWidgets: string[];
};

const categoryTitles: Record<WidgetCategoryId, string> = {
  overview: 'Overview',
  workouts: 'Workouts',
  habits: 'Habits',
  nutrition: 'Nutrition',
};

const staticWidgetCategoryMap: Record<DashboardStaticWidgetId, WidgetCategoryId> = {
  'snapshot-cards': 'overview',
  'trend-sparklines': 'overview',
  'log-weight': 'overview',
  'weight-trend': 'overview',
  'recent-workouts': 'workouts',
  'habit-chain': 'habits',
  'macro-rings': 'nutrition',
};

const categoryOrder: WidgetCategoryId[] = ['overview', 'workouts', 'habits', 'nutrition'];

function isDashboardStaticWidgetId(value: string): value is DashboardStaticWidgetId {
  return value in DASHBOARD_WIDGET_IDS;
}

function isHabitDailyWidgetId(value: string): value is HabitDailyWidgetId {
  return (
    value.startsWith(HABIT_DAILY_WIDGET_PREFIX) && value.length > HABIT_DAILY_WIDGET_PREFIX.length
  );
}

function toHabitDailyWidgetId(habitId: string): HabitDailyWidgetId {
  return `${HABIT_DAILY_WIDGET_PREFIX}${habitId}`;
}

function getHabitIdFromDailyWidgetId(widgetId: HabitDailyWidgetId) {
  return widgetId.slice(HABIT_DAILY_WIDGET_PREFIX.length);
}

export function reorderVisibleWidgets(widgetIds: string[], activeId: string, overId: string) {
  const oldIndex = widgetIds.indexOf(activeId);
  const newIndex = widgetIds.indexOf(overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
    return widgetIds;
  }

  return arrayMove(widgetIds, oldIndex, newIndex);
}

function SortableActiveWidgetItem({
  widgetId,
  widgetLabel,
}: {
  widgetId: string;
  widgetLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: widgetId,
  });

  return (
    <li
      className="flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        aria-label={`Drag to reorder ${widgetLabel}`}
        className="rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="text-sm font-medium text-foreground">{widgetLabel}</span>
    </li>
  );
}

function HabitSubToggle({
  checked,
  label,
  onCheckedChange,
  switchAriaLabel,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  switchAriaLabel: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/15 px-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <Switch aria-label={switchAriaLabel} checked={checked} onCheckedChange={onCheckedChange} />
    </li>
  );
}

function WidgetToggleRow({
  checked,
  description,
  label,
  onCheckedChange,
  switchAriaLabel,
}: {
  checked: boolean;
  description?: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  switchAriaLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch aria-label={switchAriaLabel} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function HabitWidgetSection({
  expanded,
  onExpandedChange,
  title,
  children,
}: {
  children: ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  title: string;
}) {
  const contentId = useId();

  return (
    <div className="space-y-2">
      <button
        aria-controls={contentId}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
        onClick={() => onExpandedChange(!expanded)}
        type="button"
      >
        <span className="text-sm font-medium text-foreground">{title}</span>
        {expanded ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </button>
      <ul className="space-y-2 pl-3" hidden={!expanded} id={contentId}>
        {children}
      </ul>
    </div>
  );
}

function getWidgetLabel(widgetId: string, habitsById: Map<string, Habit>) {
  if (isDashboardStaticWidgetId(widgetId)) {
    return DASHBOARD_WIDGET_IDS[widgetId];
  }

  if (isHabitDailyWidgetId(widgetId)) {
    const habitId = getHabitIdFromDailyWidgetId(widgetId);
    const habit = habitsById.get(habitId);
    return habit ? `${habit.name} daily status` : 'Habit daily status';
  }

  return widgetId;
}

export function DashboardWidgetSidebar({
  habitChainIds,
  habits,
  isSaving,
  onOpenChange,
  onReorderVisibleWidgets,
  onSave,
  onToggleAllHabitDaily,
  onToggleHabitChain,
  onToggleHabitDaily,
  onToggleWidget,
  open,
  saveErrorMessage,
  visibleWidgets,
}: WidgetSidebarProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const [habitDailyExpanded, setHabitDailyExpanded] = useState(true);
  const [habitChainExpanded, setHabitChainExpanded] = useState(true);
  const habitsById = useMemo(() => new Map(habits.map((habit) => [habit.id, habit])), [habits]);
  const hasAnyHabitDailyWidget = visibleWidgets.some(isHabitDailyWidgetId);
  const staticWidgetByCategory = useMemo(() => {
    const dashboardStaticWidgets = Object.keys(DASHBOARD_WIDGET_IDS) as DashboardStaticWidgetId[];

    return categoryOrder.reduce<Record<WidgetCategoryId, DashboardStaticWidgetId[]>>(
      (accumulator, categoryId) => {
        accumulator[categoryId] = dashboardStaticWidgets.filter(
          (widgetId) => staticWidgetCategoryMap[widgetId] === categoryId,
        );
        return accumulator;
      },
      {
        overview: [],
        workouts: [],
        habits: [],
        nutrition: [],
      },
    );
  }, []);

  const activeWidgetItems = visibleWidgets.map((widgetId) => ({
    widgetId,
    widgetLabel: getWidgetLabel(widgetId, habitsById),
  }));

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : '';

    if (!overId || activeId === overId) {
      return;
    }

    onReorderVisibleWidgets(reorderVisibleWidgets(visibleWidgets, activeId, overId));
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="gap-0 p-0" data-testid="dashboard-widget-sidebar" side="right">
        <SheetHeader className="border-b py-4">
          <SheetTitle>Dashboard widgets</SheetTitle>
          <SheetDescription>
            Toggle card visibility and drag active cards to set display order.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-6">
          <section className="space-y-2">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Active widgets
            </h2>
            {activeWidgetItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No visible widgets selected.</p>
            ) : (
              <DndContext
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                sensors={sensors}
              >
                <SortableContext items={visibleWidgets} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-2" data-testid="active-widget-sortable-list">
                    {activeWidgetItems.map((widget) => (
                      <SortableActiveWidgetItem
                        key={widget.widgetId}
                        widgetId={widget.widgetId}
                        widgetLabel={widget.widgetLabel}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
          </section>

          {categoryOrder.map((categoryId) => (
            <section className="space-y-2" key={categoryId}>
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                {categoryTitles[categoryId]}
              </h2>
              {staticWidgetByCategory[categoryId].map((widgetId) => (
                <WidgetToggleRow
                  checked={visibleWidgets.includes(widgetId)}
                  key={widgetId}
                  label={DASHBOARD_WIDGET_IDS[widgetId]}
                  onCheckedChange={(checked) => onToggleWidget(widgetId, checked)}
                  switchAriaLabel={`Toggle ${DASHBOARD_WIDGET_IDS[widgetId]} widget`}
                />
              ))}

              {categoryId === 'habits' ? (
                <>
                  <WidgetToggleRow
                    checked={hasAnyHabitDailyWidget}
                    description="Enable or disable all habit daily status cards."
                    label="Habit Daily Status"
                    onCheckedChange={onToggleAllHabitDaily}
                    switchAriaLabel="Toggle all habit daily status widgets"
                  />
                  <HabitWidgetSection
                    expanded={habitDailyExpanded}
                    onExpandedChange={setHabitDailyExpanded}
                    title="Habit daily cards"
                  >
                    {habits.map((habit) => (
                      <HabitSubToggle
                        checked={visibleWidgets.includes(toHabitDailyWidgetId(habit.id))}
                        key={habit.id}
                        label={habit.name}
                        onCheckedChange={(checked) => onToggleHabitDaily(habit.id, checked)}
                        switchAriaLabel={`Toggle ${habit.name} daily status widget`}
                      />
                    ))}
                    {habits.length === 0 ? (
                      <li className="text-sm text-muted-foreground">No habits available.</li>
                    ) : null}
                  </HabitWidgetSection>
                  <HabitWidgetSection
                    expanded={habitChainExpanded}
                    onExpandedChange={setHabitChainExpanded}
                    title="Habit chain filters"
                  >
                    {habits.map((habit) => (
                      <HabitSubToggle
                        checked={habitChainIds.includes(habit.id)}
                        key={habit.id}
                        label={habit.name}
                        onCheckedChange={(checked) => onToggleHabitChain(habit.id, checked)}
                        switchAriaLabel={`Toggle ${habit.name} in habit chain`}
                      />
                    ))}
                    {habits.length === 0 ? (
                      <li className="text-sm text-muted-foreground">No habits available.</li>
                    ) : null}
                  </HabitWidgetSection>
                </>
              ) : null}
            </section>
          ))}
        </div>

        <SheetFooter className="border-t py-3">
          <div className="mr-auto min-h-5 text-sm text-destructive" role="status">
            {saveErrorMessage}
          </div>
          <Button disabled={isSaving} onClick={onSave} type="button">
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export {
  getHabitIdFromDailyWidgetId,
  HABIT_DAILY_WIDGET_PREFIX,
  isDashboardStaticWidgetId,
  isHabitDailyWidgetId,
  toHabitDailyWidgetId,
};
