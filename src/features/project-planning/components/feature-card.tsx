"use client";

import { Pencil, Trash2, Plus } from "lucide-react";
import { AdminOnly } from "./admin-only";
import { Badge, FeatureStatusBadge, IssueStatusBadge, PriorityBadge } from "./badges";
import { MoveMenu, type Section } from "./move-menu";
import type { Feature, Issue } from "../types";

type Props = {
  feature: Feature;
  isAdmin: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAddIssue: (id: string) => void;
  onEditIssue: (featureId: string, issueId: string) => void;
  onDeleteIssue: (featureId: string, issueId: string) => void;
  onMove: (id: string, to: Section) => void;
};

export function FeatureCard({
  feature,
  isAdmin,
  onEdit,
  onDelete,
  onAddIssue,
  onEditIssue,
  onDeleteIssue,
  onMove,
}: Props) {
  return (
    <article className="rounded-lg border border-border bg-sidebar/40">
      <header className="flex items-start justify-between gap-3 p-4 border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-foreground">{feature.title}</h3>
            <FeatureStatusBadge status={feature.status} />
            <PriorityBadge priority={feature.priority} />
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{feature.description}</p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {feature.tags.map((t) => (
              <Badge key={t} tone="muted">
                #{t}
              </Badge>
            ))}
            <span className="text-[11px] text-muted-foreground">
              {feature.issues.length} issue{feature.issues.length === 1 ? "" : "s"} · updated{" "}
              {feature.updatedAt}
            </span>
          </div>
        </div>
        <AdminOnly isAdmin={isAdmin}>
          <div className="flex items-center gap-1 shrink-0">
            <MoveMenu from="roadmap" onMove={(to) => onMove(feature.id, to)} />
            <IconBtn label="Edit topic" onClick={() => onEdit(feature.id)}>
              <Pencil className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn label="Delete topic" onClick={() => onDelete(feature.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        </AdminOnly>
      </header>

      <div className="p-2">
        {feature.issues.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">No issues yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {feature.issues.map((iss) => (
              <IssueRow
                key={iss.id}
                issue={iss}
                isAdmin={isAdmin}
                onEdit={() => onEditIssue(feature.id, iss.id)}
                onDelete={() => onDeleteIssue(feature.id, iss.id)}
              />
            ))}
          </ul>
        )}
        <AdminOnly isAdmin={isAdmin}>
          <button
            onClick={() => onAddIssue(feature.id)}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50"
          >
            <Plus className="h-3.5 w-3.5" /> Add issue
          </button>
        </AdminOnly>
      </div>
    </article>
  );
}

function IssueRow({
  issue,
  isAdmin,
  onEdit,
  onDelete,
}: {
  issue: Issue;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 px-2 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{issue.title}</span>
          <IssueStatusBadge status={issue.status} />
          <PriorityBadge priority={issue.priority} />
          {issue.assignee && <Badge tone="muted">@{issue.assignee}</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{issue.description}</p>
        {issue.tags.length > 0 && (
          <div className="mt-1 flex items-center gap-1 flex-wrap">
            {issue.tags.map((t) => (
              <span key={t} className="text-[10px] text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
      <AdminOnly isAdmin={isAdmin}>
        <div className="flex items-center gap-1 shrink-0">
          <IconBtn label="Edit issue" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn label="Delete issue" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </AdminOnly>
    </li>
  );
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50"
    >
      {children}
    </button>
  );
}
