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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type { NiceToHave, Priority } from "../types";

export type NiceDraft = Pick<NiceToHave, "title" | "description" | "reason" | "priority">;

type Props = {
  open: boolean;
  title: string;
  initial: NiceDraft;
  onSubmit: (value: NiceDraft) => void;
  onOpenChange: (open: boolean) => void;
};

const priorities: Priority[] = ["low", "medium", "high", "critical"];

export function EditNiceToHaveDialog({ open, title, initial, onSubmit, onOpenChange }: Props) {
  const [draft, setDraft] = useState<NiceDraft>(initial);

  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.title.trim();
    if (!trimmed) return;
    onSubmit({ ...draft, title: trimmed });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-sidebar border-border sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base">{title}</DialogTitle>
            <DialogDescription className="sr-only">Edit nice to have item.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="nth-title" className="text-xs text-muted-foreground">
              Title
            </Label>
            <Input
              id="nth-title"
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              className="bg-background border-border"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nth-desc" className="text-xs text-muted-foreground">
              Description
            </Label>
            <textarea
              id="nth-desc"
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              className="flex min-h-[60px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nth-reason" className="text-xs text-muted-foreground">
              Reason
            </Label>
            <textarea
              id="nth-reason"
              rows={2}
              value={draft.reason}
              onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
              className="flex min-h-[60px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Priority</Label>
            <Select
              value={draft.priority}
              onValueChange={(v) => setDraft((d) => ({ ...d, priority: v as Priority }))}
            >
              <SelectTrigger className="bg-background border-border">
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

          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
