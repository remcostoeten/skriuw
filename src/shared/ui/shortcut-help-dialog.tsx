"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

export type ShortcutHelpGroup = {
  id: string;
  title: string;
  shortcuts: Array<{
    id: string;
    label: string;
    combo: string;
    description?: string;
  }>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  groups: ShortcutHelpGroup[];
};

export function ShortcutHelpDialog({
  open,
  onOpenChange,
  title = "Keyboard Shortcuts",
  description = "The current route-specific shortcut map.",
  groups,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto border-border/70 bg-card/96 shadow-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.id} className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-background/55 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{shortcut.label}</div>
                      {shortcut.description ? (
                        <div className="text-xs text-muted-foreground">{shortcut.description}</div>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-md border border-border/60 bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground">
                      {shortcut.combo}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
