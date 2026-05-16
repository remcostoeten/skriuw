"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { AdminOnly } from "./admin-only";
import { FeatureStatusBadge, PriorityBadge } from "./badges";
import { MoveMenu, type Section } from "./move-menu";
import type { Feature, FeatureStatus } from "../types";

type Props = {
  features: Feature[];
  isAdmin: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, to: Section) => void;
  onChangeStatus: (id: string, status: FeatureStatus) => void;
};

const columns: { status: FeatureStatus; label: string }[] = [
  { status: "exploring", label: "Exploring" },
  { status: "planned", label: "Planned" },
  { status: "in_progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
  { status: "completed", label: "Completed" },
];

const DRAG_MIME = "application/x-feature-id";

export function KanbanBoard({
  features,
  isAdmin,
  onSelect,
  onEdit,
  onDelete,
  onMove,
  onChangeStatus,
}: Props) {
  const [dragOver, setDragOver] = useState<FeatureStatus | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent, id: string) {
    if (!isAdmin) return;
    e.dataTransfer.setData(DRAG_MIME, id);
    e.dataTransfer.effectAllowed = "move";
    setDragId(id);
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOver(null);
  }

  function handleDragOver(e: React.DragEvent, status: FeatureStatus) {
    if (!isAdmin) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOver !== status) setDragOver(status);
  }

  function handleDrop(e: React.DragEvent, status: FeatureStatus) {
    if (!isAdmin) return;
    e.preventDefault();
    const id = e.dataTransfer.getData(DRAG_MIME) || dragId;
    if (id) onChangeStatus(id, status);
    setDragOver(null);
    setDragId(null);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {columns.map((col) => {
        const items = features.filter((f) => f.status === col.status);
        const isTarget = dragOver === col.status;
        return (
          <div
            key={col.status}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={() => setDragOver((s) => (s === col.status ? null : s))}
            onDrop={(e) => handleDrop(e, col.status)}
            className={`rounded-lg border flex flex-col min-h-[200px] transition-colors ${
              isTarget
                ? "border-foreground/40 bg-accent/30"
                : "border-border bg-sidebar/30"
            }`}
          >
            <header className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {col.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{items.length}</span>
            </header>
            <ul className="flex-1 p-2 space-y-2">
              {items.length === 0 ? (
                <li className="text-[11px] text-muted-foreground px-1 py-2">
                  {isAdmin ? "Drop here" : "Empty"}
                </li>
              ) : (
                items.map((f) => {
                  const isDragging = dragId === f.id;
                  return (
                    <li
                      key={f.id}
                      draggable={isAdmin}
                      onDragStart={(e) => handleDragStart(e, f.id)}
                      onDragEnd={handleDragEnd}
                      className={`rounded-md border border-border bg-background/40 p-2 hover:bg-accent/40 transition-all ${
                        isAdmin ? "cursor-grab active:cursor-grabbing" : ""
                      } ${isDragging ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <button
                          onClick={() => onSelect(f.id)}
                          className="text-left min-w-0 flex-1"
                        >
                          <p className="text-sm font-medium text-foreground truncate">{f.title}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                            {f.description}
                          </p>
                        </button>
                        <AdminOnly isAdmin={isAdmin}>
                          <div className="flex items-center shrink-0">
                            <MoveMenu from="roadmap" onMove={(to) => onMove(f.id, to)} />
                          </div>
                        </AdminOnly>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          <FeatureStatusBadge status={f.status} />
                          <PriorityBadge priority={f.priority} />
                          <span className="text-[10px] text-muted-foreground">
                            {f.issues.length} iss
                          </span>
                        </div>
                        <AdminOnly isAdmin={isAdmin}>
                          <div className="flex items-center gap-0.5">
                            <button
                              aria-label="Edit"
                              onClick={() => onEdit(f.id)}
                              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              aria-label="Delete"
                              onClick={() => onDelete(f.id)}
                              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </AdminOnly>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
