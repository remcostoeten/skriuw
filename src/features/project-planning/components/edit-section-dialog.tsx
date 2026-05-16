"use client";

import { useEffect, useState } from "react";
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

export type SectionDraftValue = {
  title: string;
  description: string;
};

type Props = {
  open: boolean;
  title: string;
  initial: SectionDraftValue;
  submitLabel?: string;
  onSubmit: (value: SectionDraftValue) => void;
  onOpenChange: (open: boolean) => void;
};

export function EditSectionDialog({
  open,
  title,
  initial,
  submitLabel = "Save",
  onSubmit,
  onOpenChange,
}: Props) {
  const [draft, setDraft] = useState<SectionDraftValue>(initial);

  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.title.trim();
    if (!trimmed) return;
    onSubmit({ title: trimmed, description: draft.description.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-sidebar border-border sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription className="text-xs">
              A category appears as a top-level section on the page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sect-title" className="text-xs text-muted-foreground">
              Title
            </Label>
            <Input
              id="sect-title"
              autoFocus
              required
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="e.g. Decisions, Risks, Milestones"
              className="bg-background border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sect-desc" className="text-xs text-muted-foreground">
              Description (optional)
            </Label>
            <Input
              id="sect-desc"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Short one-line explanation"
              className="bg-background border-border"
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
