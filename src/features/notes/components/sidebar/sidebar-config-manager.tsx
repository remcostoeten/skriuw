'use client';

import { useState } from 'react';
import { Settings, GripVertical, Eye, EyeOff, Plus, RotateCcw, Sliders, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SidebarSection as SidebarSectionType } from '@/modules/sidebar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { Switch } from '@/shared/ui/switch';
import { Label } from '@/shared/ui/label';

type Props = {
  sections: SidebarSectionType[];
  showSectionHeaders: boolean;
  compactMode: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  onReorderSections: (sectionIds: string[]) => void;
  onToggleSectionVisibility: (sectionId: string) => void;
  onAddCustomSection: (name: string) => void;
  onRemoveSection: (sectionId: string) => void;
  onRenameSection: (sectionId: string, name: string) => void;
  onToggleShowSectionHeaders: () => void;
  onToggleCompactMode: () => void;
  onResetToDefaults: () => void;
};

export function SidebarConfigManager({
  sections,
  showSectionHeaders,
  compactMode,
  open,
  onOpenChange,
  hideTrigger = false,
  onReorderSections,
  onToggleSectionVisibility,
  onAddCustomSection,
  onRemoveSection,
  onRenameSection: _onRenameSection,
  onToggleShowSectionHeaders,
  onToggleCompactMode,
  onResetToDefaults,
}: Props) {
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const isOpen = open ?? isOpenInternal;
  const setIsOpen = onOpenChange ?? setIsOpenInternal;

  // Sort sections by order
  const sortedSections = [...sections].sort((a, b) => {
    if (a.type === 'file-tree' && b.type !== 'file-tree') return -1;
    if (b.type === 'file-tree' && a.type !== 'file-tree') return 1;
    return a.order - b.order;
  });

  const handleAddSection = () => {
    if (newSectionName.trim()) {
      onAddCustomSection(newSectionName.trim());
      setNewSectionName('');
      setIsAddingSection(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, sectionId: string) => {
    setDraggedSectionId(sectionId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sectionId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetSectionId: string) => {
    e.preventDefault();

    if (draggedSectionId === 'file-tree' || targetSectionId === 'file-tree') {
      setDraggedSectionId(null);
      return;
    }

    if (!draggedSectionId || draggedSectionId === targetSectionId) {
      setDraggedSectionId(null);
      return;
    }

    const currentOrder = sortedSections.map(s => s.id);
    const draggedIndex = currentOrder.indexOf(draggedSectionId);
    const targetIndex = currentOrder.indexOf(targetSectionId);
    
    // Remove dragged item and insert at target position
    currentOrder.splice(draggedIndex, 1);
    currentOrder.splice(targetIndex, 0, draggedSectionId);
    
    onReorderSections(currentOrder);
    setDraggedSectionId(null);
  };

  const handleDragEnd = () => {
    setDraggedSectionId(null);
  };

  const getSectionIcon = (type: string) => {
    switch (type) {
      case 'search': return 'Search';
      case 'favorites': return 'Star';
      case 'recents': return 'Clock';
      case 'projects': return 'Briefcase';
      case 'file-tree': return 'Files';
      case 'tags': return 'Tag';
      default: return 'Folder';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <button
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Configure sidebar"
          >
            <Sliders className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Sidebar Configuration
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Section management */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Sections</h4>
              <button
                onClick={() => setIsAddingSection(true)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add section
              </button>
            </div>

            {/* Add new section input */}
            {isAddingSection && (
              <div className="flex items-center gap-2 mb-2 p-2 rounded bg-accent/30 border border-border">
                <input
                  type="text"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddSection();
                    if (e.key === 'Escape') {
                      setIsAddingSection(false);
                      setNewSectionName('');
                    }
                  }}
                  placeholder="Section name..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  autoFocus
                />
                <button
                  onClick={handleAddSection}
                  className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setIsAddingSection(false);
                    setNewSectionName('');
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Section list */}
            <div className="space-y-1">
              {sortedSections.map((section) => (
                <div
                  key={section.id}
                  draggable={section.type !== 'file-tree'}
                  onDragStart={(e) => handleDragStart(e, section.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, section.id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border border-transparent p-2 transition-all",
                    section.type !== 'file-tree' && "cursor-move",
                    draggedSectionId === section.id 
                      ? "opacity-50 border-primary/50" 
                      : "hover:bg-accent/30",
                    !section.isVisible && "opacity-60"
                  )}
                >
                  <GripVertical
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-muted-foreground",
                      section.type === 'file-tree' && "opacity-30",
                    )}
                  />
                  <span className="flex-1 text-sm truncate">{section.name}</span>
                  {section.type === 'file-tree' ? (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
                      Pinned
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                      {getSectionIcon(section.type)}
                    </span>
                  )}
                  <button
                    onClick={() => onToggleSectionVisibility(section.id)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    title={section.isVisible ? 'Hide section' : 'Show section'}
                  >
                    {section.isVisible ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {section.type === 'custom' && (
                    <button
                      onClick={() => onRemoveSection(section.id)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove section"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Display options */}
          <div className="space-y-4 pt-4 border-t border-border">
            <h4 className="text-sm font-medium">Display Options</h4>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="show-headers" className="text-sm text-muted-foreground">
                Show section headers
              </Label>
              <Switch
                id="show-headers"
                checked={showSectionHeaders}
                onCheckedChange={onToggleShowSectionHeaders}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="compact-mode" className="text-sm text-muted-foreground">
                Compact mode
              </Label>
              <Switch
                id="compact-mode"
                checked={compactMode}
                onCheckedChange={onToggleCompactMode}
              />
            </div>
          </div>

          {/* Reset button */}
          <div className="pt-4 border-t border-border">
            <button
              onClick={onResetToDefaults}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded hover:bg-accent/30 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to defaults
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
