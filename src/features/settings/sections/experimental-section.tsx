"use client";

import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { usePreferencesStore } from "@/features/settings/store";

export function ExperimentalSection() {
  const journal = usePreferencesStore((state) => state.journal);
  const toggleDiaryMode = usePreferencesStore((state) => state.toggleDiaryMode);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">Experimental</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Features still being shaped. Behavior may change.
        </p>
      </div>
      <div className="border-t border-border" />
      <div className="flex items-center justify-between py-2">
        <div className="space-y-1">
          <Label htmlFor="diary-mode" className="text-sm font-medium">
            Diary view
          </Label>
          <p className="text-xs text-muted-foreground pr-4">
            Enable a layout optimized for chronological journaling.
          </p>
        </div>
        <Switch
          id="diary-mode"
          checked={journal.diaryModeEnabled}
          onCheckedChange={toggleDiaryMode}
        />
      </div>
      <p className="text-xs text-muted-foreground/70 italic">
        When enabled, new-note actions in Notes open today&apos;s journal entry instead
        of creating a markdown note.
      </p>
    </div>
  );
}
