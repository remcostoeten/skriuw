"use client";

import { Pencil, Trash2, Plus } from "lucide-react";
import { AdminOnly } from "./admin-only";
import { Badge, PriorityBadge } from "./badges";
import type { CustomSection, CustomSectionItem } from "../types";

type Props = {
  section: CustomSection;
  isAdmin: boolean;
  onEditSection: (id: string) => void;
  onDeleteSection: (id: string) => void;
  onCreateItem: (sectionId: string) => void;
  onEditItem: (sectionId: string, itemId: string) => void;
  onDeleteItem: (sectionId: string, itemId: string) => void;
};

export function CustomSectionView({
  section,
  isAdmin,
  onEditSection,
  onDeleteSection,
  onCreateItem,
  onEditItem,
  onDeleteItem,
}: Props) {
  return (
    <section>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
          {section.description && (
            <p className="text-xs text-muted-foreground">{section.description}</p>
          )}
        </div>
        <AdminOnly isAdmin={isAdmin}>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => onCreateItem(section.id)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> New item
            </button>
            <button
              aria-label="Rename section"
              onClick={() => onEditSection(section.id)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label="Delete section"
              onClick={() => onDeleteSection(section.id)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </AdminOnly>
      </header>

      {section.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {section.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              isAdmin={isAdmin}
              onEdit={() => onEditItem(section.id, item.id)}
              onDelete={() => onDeleteItem(section.id, item.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ItemCard({
  item,
  isAdmin,
  onEdit,
  onDelete,
}: {
  item: CustomSectionItem;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="rounded-lg border border-border bg-sidebar/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{item.title}</h3>
            {item.priority && <PriorityBadge priority={item.priority} />}
          </div>
          {item.content && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              {item.content}
            </p>
          )}
          {item.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {item.tags.map((t) => (
                <Badge key={t} tone="muted">
                  #{t}
                </Badge>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">{item.updatedAt}</p>
        </div>
        <AdminOnly isAdmin={isAdmin}>
          <div className="flex shrink-0 items-center gap-1">
            <button
              aria-label="Edit"
              onClick={onEdit}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label="Delete"
              onClick={onDelete}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </AdminOnly>
      </div>
    </li>
  );
}
