"use client";

import { useMemo } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { AdminOnly } from "./admin-only";
import { FeatureStatusBadge, PriorityBadge } from "./badges";
import { MoveMenu, type Section } from "./move-menu";
import type { Feature, Priority } from "../types";

type Props = {
  features: Feature[];
  isAdmin: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, to: Section) => void;
};

const priorityOrder: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const groupLabels: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function BacklogView({ features, isAdmin, onSelect, onEdit, onDelete, onMove }: Props) {
  const backlog = useMemo(
    () =>
      features
        .filter((f) => f.status !== "completed" && f.status !== "archived")
        .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]),
    [features],
  );

  const groups = useMemo(() => {
    const map = new Map<Priority, Feature[]>();
    for (const f of backlog) {
      const list = map.get(f.priority) ?? [];
      list.push(f);
      map.set(f.priority, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => priorityOrder[a] - priorityOrder[b]);
  }, [backlog]);

  if (backlog.length === 0) {
    return <p className="text-sm text-muted-foreground">Backlog is empty.</p>;
  }

  return (
    <div className="space-y-5">
      {groups.map(([priority, items]) => (
        <div key={priority}>
          <div className="mb-2 flex items-center gap-2">
            <PriorityBadge priority={priority} />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {groupLabels[priority]}
            </h3>
            <span className="text-[10px] text-muted-foreground">{items.length}</span>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border bg-sidebar/30 overflow-hidden">
            {items.map((f) => {
              const openIssues = f.issues.filter((i) => i.status !== "done").length;
              return (
                <li
                  key={f.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 hover:bg-accent/30"
                >
                  <button onClick={() => onSelect(f.id)} className="text-left min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">
                        {f.title}
                      </span>
                      <FeatureStatusBadge status={f.status} />
                      <span className="text-[10px] text-muted-foreground">
                        {openIssues} open · upd {f.updatedAt}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                      {f.description}
                    </p>
                  </button>
                  <AdminOnly isAdmin={isAdmin}>
                    <div className="flex items-center gap-1 shrink-0">
                      <MoveMenu from="roadmap" onMove={(to) => onMove(f.id, to)} />
                      <button
                        aria-label="Edit"
                        onClick={() => onEdit(f.id)}
                        className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        aria-label="Delete"
                        onClick={() => onDelete(f.id)}
                        className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </AdminOnly>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
