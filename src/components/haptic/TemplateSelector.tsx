'use client';

import { Check, Calendar, RotateCw, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore, TEMPLATE_OPTIONS, TemplateStyle } from '@/modules/settings';
import { formatDistanceToNow, format } from 'date-fns';

interface TemplateSelectorProps {
  selectedTemplate: TemplateStyle;
  onSelectTemplate: (template: TemplateStyle) => void;
}

function formatDate(date: Date | null): string {
  if (!date) return 'Never used';
  return format(date, 'MMM d, yyyy');
}

function formatRelativeDate(date: Date | null): string {
  if (!date) return 'Never';
  return formatDistanceToNow(date, { addSuffix: true });
}

export function TemplateSelector({ selectedTemplate, onSelectTemplate }: TemplateSelectorProps) {
  const { getTemplateTimestamp } = useSettingsStore();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Template Style</h3>
        <span className="text-xs text-muted-foreground">
          Choose your default note template
        </span>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 gap-3">
        {TEMPLATE_OPTIONS.map((template) => {
          const timestamp = getTemplateTimestamp(template.id);
          const isSelected = selectedTemplate === template.id;

          return (
            <div
              key={template.id}
              onClick={() => onSelectTemplate(template.id)}
              className={cn(
                'group relative cursor-pointer transition-all duration-200',
                'border-2 rounded-lg p-4',
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:border-primary/50 hover:bg-card/80'
              )}
            >
              {/* Header with selection indicator */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-foreground">
                      {template.name}
                    </h4>
                    {isSelected && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary/20">
                        <Check className="w-3 h-3 text-primary" />
                        <span className="text-xs text-primary font-medium">Active</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {template.description}
                  </p>
                </div>
              </div>

              {/* Stats section */}
              <div className="grid grid-cols-3 gap-2 mb-3 p-2 rounded bg-background/50">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Created</span>
                  <span className="text-xs font-medium text-foreground">
                    {formatDate(timestamp.createdAt)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70">
                    {formatRelativeDate(timestamp.createdAt)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Modified</span>
                  <span className="text-xs font-medium text-foreground">
                    {formatDate(timestamp.updatedAt)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70">
                    {formatRelativeDate(timestamp.updatedAt)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Used</span>
                  <span className="text-xs font-medium text-foreground">
                    {timestamp.useCount} times
                  </span>
                  {timestamp.lastUsedAt && (
                    <span className="text-[10px] text-muted-foreground/70">
                      {formatRelativeDate(timestamp.lastUsedAt)}
                    </span>
                  )}
                </div>
              </div>

              {/* Preview section */}
              <div className="rounded border border-border/50 bg-background p-3 mb-3">
                <pre className="text-xs text-foreground/70 font-mono whitespace-pre-wrap break-words overflow-hidden max-h-24">
                  {template.preview}
                </pre>
              </div>

              {/* Icons row */}
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>Created {formatRelativeDate(timestamp.createdAt)}</span>
                </div>
                {timestamp.lastUsedAt && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <div className="flex items-center gap-1">
                      <RotateCw className="w-3 h-3" />
                      <span>Last used {formatRelativeDate(timestamp.lastUsedAt)}</span>
                    </div>
                  </>
                )}
                {timestamp.useCount > 0 && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      <span>{timestamp.useCount} notes created</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info box */}
      <div className="p-3 rounded-lg bg-background/50 border border-border/50">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Templates track creation, modification, and usage statistics. These timestamps update 
          automatically when you change settings or create notes using each template.
        </p>
      </div>
    </div>
  );
}
