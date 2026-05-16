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
import type { Priority } from "../types";

export type SectionItemDraftValue = {
  title: string;
  content: string;
  priority: Priority | null;
  tags: string[];
};

export const emptySectionItemDraft: SectionItemDraftValue = {
  title: "",
  content: "",
  priority: null,
  tags: [],
};

type Props = {
  open: boolean;
  title: string;
  initial: SectionItemDraftValue;
  submitLabel?: string;
  onSubmit: (value: SectionItemDraftValue) => void;
  onOpenChange: (open: boolean) => void;
};

const priorityChoices: { value: Priority | "none"; label: string }[] = [
  { value: "none", label: "None" },
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "critical", label: "critical" },
];

export function EditSectionItemDialog({
  open,
  title,
  initial,
  submitLabel = "Save",
  onSubmit,
  onOpenChange,
}: Props) {
  const [draft, setDraft] = useState<SectionItemDraftValue>(initial);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(initial);
      setTagInput("");
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
    if (!trimmed) return;
    onSubmit({
      title: trimmed,
      content: draft.content.trim(),
      priority: draft.priority,
      tags: draft.tags,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-sidebar border-border sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription className="sr-only">Edit section item.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="si-title" className="text-xs text-muted-foreground">
              Title
            </Label>
            <Input
              id="si-title"
              autoFocus
              required
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="si-content" className="text-xs text-muted-foreground">
              Content
            </Label>
            <textarea
              id="si-content"
              rows={4}
              value={draft.content}
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
              className="flex min-h-[60px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <Label id="si-priority-label" className="text-xs text-muted-foreground">
              Priority
            </Label>
            <Select
              value={draft.priority ?? "none"}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, priority: v === "none" ? null : (v as Priority) }))
              }
            >
              <SelectTrigger
                aria-labelledby="si-priority-label"
                className="bg-background border-border"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorityChoices.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="si-tags" className="text-xs text-muted-foreground">
              Tags
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
                    aria-label={`Remove tag ${t}`}
                    className="rounded-sm p-0.5 hover:bg-accent/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                id="si-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
                placeholder={draft.tags.length ? "" : "Add a tag and press Enter"}
                className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
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
