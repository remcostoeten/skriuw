"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type { Issue, IssueStatus, Priority } from "../types";

export type IssueDraft = Pick<
  Issue,
  "title" | "description" | "status" | "priority" | "assignee" | "tags" | "notes"
>;

export const emptyIssueDraft: IssueDraft = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  assignee: "",
  tags: [],
  notes: "",
};

type Props = {
  open: boolean;
  title: string;
  initial: IssueDraft;
  submitLabel?: string;
  onSubmit: (value: IssueDraft) => void;
  onOpenChange: (open: boolean) => void;
};

const statuses: IssueStatus[] = ["todo", "in_progress", "blocked", "done"];
const priorities: Priority[] = ["low", "medium", "high", "critical"];

export function EditIssueDialog({
  open,
  title,
  initial,
  submitLabel = "Create issue",
  onSubmit,
  onOpenChange,
}: Props) {
  const [draft, setDraft] = useState<IssueDraft>(initial);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(initial);
      setTagInput("");
      setError(null);
    }
  }, [open, initial]);

  function addTag() {
    const t = tagInput.trim();
    if (!t || draft.tags.includes(t)) {
      setTagInput("");
      return;
    }
    setDraft((d) => ({ ...d, tags: [...d.tags, t] }));
    setTagInput("");
  }

  function removeTag(t: string) {
    setDraft((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) }));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !tagInput && draft.tags.length) {
      removeTag(draft.tags[draft.tags.length - 1]);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.title.trim();
    if (!trimmed) {
      setError("Title is required.");
      return;
    }
    onSubmit({
      ...draft,
      title: trimmed,
      description: draft.description.trim(),
      assignee: draft.assignee?.trim() || undefined,
      notes: draft.notes?.trim() || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-sidebar border-border sm:max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription className="text-xs">
              Capture the work like a ticket: a concise title, the context, and how to prioritise
              it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="iss-title" className="text-xs text-muted-foreground">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="iss-title"
              autoFocus
              required
              placeholder="Short, descriptive summary"
              value={draft.title}
              onChange={(e) => {
                setDraft((d) => ({ ...d, title: e.target.value }));
                if (error) setError(null);
              }}
              aria-invalid={!!error}
              aria-describedby={error ? "iss-title-error" : undefined}
              className="bg-background border-border"
            />
            {error && (
              <p id="iss-title-error" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="iss-desc" className="text-xs text-muted-foreground">
              Description
            </Label>
            <textarea
              id="iss-desc"
              rows={4}
              placeholder="What's the problem? Steps to reproduce, acceptance criteria, links…"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              className="flex min-h-[60px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="iss-status" className="text-xs text-muted-foreground">
                Status
              </Label>
              <Select
                value={draft.status}
                onValueChange={(v) => setDraft((d) => ({ ...d, status: v as IssueStatus }))}
              >
                <SelectTrigger id="iss-status" className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="iss-priority" className="text-xs text-muted-foreground">
                Priority
              </Label>
              <Select
                value={draft.priority}
                onValueChange={(v) => setDraft((d) => ({ ...d, priority: v as Priority }))}
              >
                <SelectTrigger id="iss-priority" className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="iss-assignee" className="text-xs text-muted-foreground">
                Assignee
              </Label>
              <Input
                id="iss-assignee"
                placeholder="e.g. @alex"
                value={draft.assignee ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, assignee: e.target.value }))}
                className="bg-background border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="iss-tags" className="text-xs text-muted-foreground">
              Labels
            </Label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
              {draft.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-sm border border-border bg-accent/60 px-1.5 py-0.5 text-xs"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    aria-label={`Remove label ${t}`}
                    className="rounded-sm hover:bg-accent/80 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                id="iss-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
                placeholder={draft.tags.length ? "" : "Add a label and press Enter"}
                className="flex-1 min-w-[8rem] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="iss-notes" className="text-xs text-muted-foreground">
              Notes
            </Label>
            <textarea
              id="iss-notes"
              rows={2}
              placeholder="Internal notes (optional)"
              value={draft.notes ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              className="flex min-h-[60px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
