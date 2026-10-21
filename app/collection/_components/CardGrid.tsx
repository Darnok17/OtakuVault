"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Entry } from "@/lib/types";
import EntryCard, { CardFace } from "./EntryCard";

// Only cards in the dragged card's rating tier count as drop targets.
const sameTier: CollisionDetection = (args) =>
  closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => c.data.current?.tier === args.active.data.current?.tier
    ),
  });

export default function CardGrid({
  items, view, reorderable, onEdit, onDelete, onReorder,
}: {
  items: Entry[];
  view: "grid" | "list";
  reorderable: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const tierSizes = new Map<number, number>();
  for (const e of items) tierSizes.set(e.rating, (tierSizes.get(e.rating) ?? 0) + 1);

  const endDrag = () => {
    setActiveId(null);
    document.body.classList.remove("is-dragging");
  };
  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    document.body.classList.add("is-dragging");
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    endDrag();
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  };

  const activeIndex = items.findIndex((e) => e.id === activeId);
  const active = activeIndex === -1 ? null : items[activeIndex];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sameTier}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
    >
      <SortableContext items={items.map((e) => e.id)} strategy={rectSortingStrategy}>
        <div className={`card-grid ${view === "list" ? "view-list" : ""}`}>
          <AnimatePresence initial={false}>
            {items.map((e, i) => (
              <EntryCard
                key={e.id}
                entry={e}
                rank={i + 1}
                draggable={reorderable && (tierSizes.get(e.rating) ?? 0) > 1}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </AnimatePresence>
        </div>
      </SortableContext>

      {/* Portaled so ancestor transforms can't offset the fixed-position overlay.
          Kept mounted so dnd-kit can play the drop animation. The grid only renders
          client-side (entries hydrate in an effect), so document is always defined. */}
      {typeof document !== "undefined" && createPortal(
        <DragOverlay>
          {active && (
            <div className={`drag-overlay ${view === "list" ? "view-list" : ""}`}>
              <CardFace
                entry={active}
                rank={activeIndex + 1}
                onEdit={onEdit}
                onDelete={onDelete}
                handle={<div className="drag-handle"></div>}
              />
            </div>
          )}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}
