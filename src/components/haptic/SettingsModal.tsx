'use client';

import { useEffect } from 'react';
import { useState } from 'react';
import { Check, FileText, BookOpen, Calendar, Info, HelpCircle, ArrowLeft } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useSettingsStore, TEMPLATE_OPTIONS, TemplateStyle } from '@/modules/settings';
import { getAuth } from '@/modules/auth';
import { TroubleshootingGuide } from './TroubleshootingGuide';
import { Button } from '@/components/ui/button';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const TEMPLATE_ICONS: Record<TemplateStyle, typeof FileText> = {
  simple: FileText,
  notion: BookOpen,
  journal: Calendar,
};

function SettingsSection({ 
  title, 
  children 
}: { 
  title: string; 
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <div className="border-t border-border" />
      {children}
    </div>
  );
}

function TemplateCard({
  template,
  isSelected,
  onSelect,
}: {
  template: typeof TEMPLATE_OPTIONS[number];
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = TEMPLATE_ICONS[template.id];
  
  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative flex flex-col gap-3 p-4 rounded-lg border text-left transition-colors',
        isSelected
          ? 'border-foreground/50 bg-accent'
          : 'border-border hover:border-foreground/30 hover:bg-accent/50'
      )}
    >
      {isSelected && (
        <div className="absolute top-3 right-3">
          <Check className="w-4 h-4 text-foreground" strokeWidth={2} />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
        <span className="text-sm font-medium text-foreground">{template.name}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {template.description}
      </p>
      <pre className="mt-2 p-3 rounded bg-background text-[11px] text-muted-foreground font-mono whitespace-pre-wrap overflow-x-auto border border-border">
        {template.preview}
      </pre>
    </button>
  );
}

export function SettingsModal({ open, onOpenChange }: Props) {
  const [view, setView] = useState<'settings' | 'troubleshooting'>('settings');
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
      setView('settings');
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      initializeSettings();
      logActivity('settings_opened');
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
  if (view === 'troubleshooting') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setView('settings')}
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
              onClick={() => setView('troubleshooting')}
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
              Rich text mode remains exactly as it behaves today. This setting only affects the default mode for new notes.
            </p>
          </SettingsSection>

          {/* Template Settings */}
          <SettingsSection title="Note Template Settings">
            <p className="text-sm text-muted-foreground mb-4">
              Choose a default template for new notes.
            </p>
            <div className="grid gap-4">
              {TEMPLATE_OPTIONS.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  isSelected={settings.templateStyle === template.id}
                  onSelect={() => updateTemplateStyle(template.id)}
                />
              ))}
            </div>
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
              This feature is coming soon. When it ships, it will become the default layout for new notes when enabled.
            </p>
          </SettingsSection>

          {/* User Note */}
          <div className="rounded-lg bg-accent/50 border border-border p-4">
            <div className="flex gap-3">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.5} />
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Developer Note</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  &ldquo;Eventually I want the editor to support multiple workflows, from simple note taking to more structured journaling. The settings should allow switching between minimal notes, Notion like structured documents, and a journal format.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
