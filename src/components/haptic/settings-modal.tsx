"use client";

import { useEffect } from "react";
import { useState } from "react";
import { Info, HelpCircle, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/ui/dialog";
import { Switch } from "@/shared/ui/switch";
import { Label } from "@/shared/ui/label";
import { useSettingsStore } from "@/modules/settings";
import { getAuth } from "@/modules/auth";
import { TroubleshootingGuide } from "./troubleshooting-guide";
import { TemplateSelector } from "./template-selector";
import { TagManager } from "./tag-manager";
import { Button } from "@/shared/ui/button-component";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <div className="border-t border-border" />
      {children}
    </div>
  );
}

export function SettingsModal({ open, onOpenChange }: Props) {
  const [view, setView] = useState<"settings" | "troubleshooting">("settings");
  const {
    settings,
    isLoading,
    initializeSettings,
    updateTemplateStyle,
    updateDefaultMode,
    toggleDiaryMode,
    logActivity,
  } = useSettingsStore();

  const user = getAuth();

  // Reset view when modal closes
  useEffect(() => {
    if (!open) {
      setView("settings");
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      initializeSettings();
      logActivity("settings_opened");
    }
  }, [open, initializeSettings, logActivity]);

  if (isLoading || !settings) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground text-sm">Loading settings...</div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Troubleshooting view
  if (view === "troubleshooting") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView("settings")}
                className="h-8 w-8 p-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <DialogTitle className="text-lg">Troubleshooting</DialogTitle>
            </div>
            <DialogDescription className="text-muted-foreground">
              Diagnose and resolve issues with note settings.
            </DialogDescription>
          </DialogHeader>
          <TroubleshootingGuide />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg">Settings</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView("troubleshooting")}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="text-xs">Help</span>
            </Button>
          </div>
          <DialogDescription className="text-muted-foreground">
            Customize your editing and note-taking experience.
          </DialogDescription>
          {user && (
            <p className="text-xs text-muted-foreground mt-1">
              Signed in as {user.name} ({user.email})
            </p>
          )}
        </DialogHeader>

        <div className="space-y-8 py-4">
          {/* Editor Settings */}
          <SettingsSection title="Editor Settings">
            <div className="flex items-center justify-between py-2">
              <div className="space-y-1">
                <Label htmlFor="default-mode" className="text-sm font-medium">
                  Default to Markdown
                </Label>
                <p className="text-xs text-muted-foreground">
                  New notes will open in Markdown mode instead of Rich Text.
                </p>
              </div>
              <Switch
                id="default-mode"
                checked={settings.defaultModeMarkdown}
                onCheckedChange={updateDefaultMode}
              />
            </div>
            <p className="text-xs text-muted-foreground/70 italic">
              Rich text mode remains exactly as it behaves today. This setting only affects the
              default mode for new notes.
            </p>
          </SettingsSection>

          {/* Template Settings */}
          <SettingsSection title="Note Template Settings">
            <TemplateSelector
              selectedTemplate={settings.templateStyle}
              onSelectTemplate={updateTemplateStyle}
            />
          </SettingsSection>

          {/* Tag Management */}
          <SettingsSection title="Tag Management">
            <TagManager />
          </SettingsSection>

          {/* Future Features */}
          <SettingsSection title="Future Features">
            <div className="flex items-center justify-between py-2">
              <div className="space-y-1">
                <Label htmlFor="diary-mode" className="text-sm font-medium">
                  Diary View
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enable a different layout optimized for chronological journaling.
                </p>
              </div>
              <Switch
                id="diary-mode"
                checked={settings.diaryModeEnabled}
                onCheckedChange={toggleDiaryMode}
              />
            </div>
            <p className="text-xs text-muted-foreground/70 italic">
              This feature is coming soon. When it ships, it will become the default layout for new
              notes when enabled.
            </p>
          </SettingsSection>

          {/* User Note */}
          <div className="rounded-lg bg-accent/50 border border-border p-4">
            <div className="flex gap-3">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.5} />
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Developer Note</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  &ldquo;Eventually I want the editor to support multiple workflows, from simple
                  note taking to more structured journaling. The settings should allow switching
                  between minimal notes, Notion like structured documents, and a journal
                  format.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
