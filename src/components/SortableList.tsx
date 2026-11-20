import {
  memo,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {stabilizeStringArray} from '../ui/referenceStability.ts';
import {useStableValue} from '../ui/useStableValue.ts';

/**
 * Library-agnostic drag-and-drop binding passed to each sortable row.
 * Cards attach `getHandleProps(isEditing)` to their GripVertical handle and read
 * `isDragging` / `isAnyDragging` for quiet placeholder and continuity-rail states.
 */
export interface SortableItemBinding {
  getHandleProps: (
    disabled: boolean
  ) => HTMLAttributes<HTMLDivElement> & {ref?: (node: HTMLElement | null) => void};
  isDragging: boolean;
  /** True while any item in this list is actively being dragged */
  isAnyDragging: boolean;
}

interface SortableListProps<T extends {id: string}> {
  items: readonly T[];
  /** Scopes drag announcements and accessibility IDs per pane */
  scopeId: string;
  /** Disables drag reordering entirely (e.g. read-only bundled examples) */
  disabled?: boolean;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDragStart?: (index: number) => void;
  onDragEnd?: () => void;
  /** Renders the compact elevated floating preview card following the pointer */
  renderOverlay?: (item: T, index: number) => ReactNode;
  renderItem: (item: T, index: number, binding: SortableItemBinding) => ReactNode;
}

const restrictToVerticalAxis: Modifier = ({transform}) => ({
  ...transform,
  x: 0,
});

const VERTICAL_AXIS_MODIFIERS: Modifier[] = [restrictToVerticalAxis];

const SLIDE_TRANSITION = 'transform 190ms cubic-bezier(0.2, 0, 0, 1)';

interface SortableRowProps<T extends {id: string}> {
  item: T;
  index: number;
  disabled: boolean;
  isAnyDragging: boolean;
  renderItem: (item: T, index: number, binding: SortableItemBinding) => ReactNode;
}

function SortableRowInner<T extends {id: string}>({
  item,
  index,
  disabled,
  isAnyDragging,
  renderItem,
}: SortableRowProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({id: item.id, disabled});

  // Apply live sibling sliding strictly while a drag is active so positional AST IDs
  // settle cleanly on drop with zero reverse-slide flicker.
  const style: CSSProperties = {
    transform: isAnyDragging ? CSS.Translate.toString(transform) : undefined,
    transition: isAnyDragging ? (transition ?? SLIDE_TRANSITION) : undefined,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };

  const binding = useMemo<SortableItemBinding>(
    () => ({
      getHandleProps: (handleDisabled: boolean) => ({
        ref: setActivatorNodeRef,
        ...attributes,
        ...(disabled || handleDisabled ? {} : listeners),
        tabIndex: disabled || handleDisabled ? -1 : 0,
        style: {touchAction: 'none'},
      }),
      isDragging,
      isAnyDragging,
    }),
    [setActivatorNodeRef, attributes, listeners, disabled, isDragging, isAnyDragging]
  );

  return (
    <div ref={setNodeRef} style={style}>
      {renderItem(item, index, binding)}
    </div>
  );
}

const SortableRow = memo(SortableRowInner) as typeof SortableRowInner;

/**
 * Shared pointer- and keyboard-accessible animated vertical sortable list
 * powered by @dnd-kit. Used identically by Phase 1 Staging and Phase 2 Execution.
 */
export function SortableList<T extends {id: string}>({
  items,
  scopeId,
  disabled = false,
  onReorder,
  onDragStart,
  onDragEnd,
  renderOverlay,
  renderItem,
}: SortableListProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {distance: 4},
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const rawItemIds = useMemo(() => items.map((item) => item.id), [items]);
  const itemIds = useStableValue(rawItemIds, stabilizeStringArray);
  const activeIndex = activeId ? items.findIndex((item) => item.id === activeId) : -1;
  const activeItem = activeIndex >= 0 ? items[activeIndex] : null;
  const isAnyDragging = activeId !== null;

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    const idx = items.findIndex((item) => item.id === id);
    setActiveId(id);
    if (idx >= 0) {
      onDragStart?.(idx);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const {active, over} = event;
    setActiveId(null);
    onDragEnd?.();

    if (!over || active.id === over.id) return;

    const fromIndex = items.findIndex((item) => item.id === String(active.id));
    const toIndex = items.findIndex((item) => item.id === String(over.id));
    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex);
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    onDragEnd?.();
  };

  return (
    <DndContext
      id={`sortable-${scopeId}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={VERTICAL_AXIS_MODIFIERS}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div>
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              index={index}
              disabled={disabled}
              isAnyDragging={isAnyDragging}
              renderItem={renderItem}
            />
          ))}
        </div>
      </SortableContext>

      {renderOverlay && (
        <DragOverlay dropAnimation={null} modifiers={VERTICAL_AXIS_MODIFIERS}>
          {activeItem && activeIndex >= 0 ? renderOverlay(activeItem, activeIndex) : null}
        </DragOverlay>
      )}
    </DndContext>
  );
}
