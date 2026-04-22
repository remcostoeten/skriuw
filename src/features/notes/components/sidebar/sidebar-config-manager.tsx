'use client';

import { useState } from 'react';
import {
  Settings,
  GripVertical,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Sliders,
  X,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { SidebarSection as SidebarSectionType } from './types';
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

  const moveSection = (sectionId: string, direction: 'up' | 'down') => {
    const movableSections = sortedSections.filter((section) => section.type !== 'file-tree');
    const currentIndex = movableSections.findIndex((section) => section.id === sectionId);

    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= movableSections.length) return;

    const nextMovableSections = [...movableSections];
    const [movedSection] = nextMovableSections.splice(currentIndex, 1);
    nextMovableSections.splice(targetIndex, 0, movedSection);

    const pinnedSections = sortedSections
      .filter((section) => section.type === 'file-tree')
      .map((section) => section.id);

    onReorderSections([...pinnedSections, ...nextMovableSections.map((section) => section.id)]);
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
            <p className="mb-2 text-xs text-muted-foreground">
              Drag sections or use the arrows to change their order.
            </p>

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
              {sortedSections.map((section, index) => {
                const movableSections = sortedSections.filter((item) => item.type !== 'file-tree');
                const movableIndex = movableSections.findIndex((item) => item.id === section.id);
                const canMoveUp = movableIndex > 0;
                const canMoveDown = movableIndex !== -1 && movableIndex < movableSections.length - 1;

                return (
                  <div
                    key={section.id}
                    draggable={section.type !== 'file-tree'}
                    onDragStart={(e) => handleDragStart(e, section.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, section.id)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border p-2 transition-all",
                      section.type !== 'file-tree' && "cursor-move",
                      draggedSectionId === section.id
                        ? "border-primary/50 bg-accent/40 opacity-50"
                        : "border-border/60 hover:bg-accent/30",
                      !section.isVisible && "opacity-60"
                    )}
                  >
                    <div className="flex shrink-0 items-center gap-1">
                      <GripVertical
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 text-muted-foreground",
                          section.type === 'file-tree' && "opacity-30",
                        )}
                      />
                      <div className="flex flex-col">
                        <button
                          onClick={() => moveSection(section.id, 'up')}
                          disabled={!canMoveUp}
                          className="flex h-3.5 w-3.5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
                          title="Move up"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => moveSection(section.id, 'down')}
                          disabled={!canMoveDown}
                          className="flex h-3.5 w-3.5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
                          title="Move down"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{section.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                        <span>{getSectionIcon(section.type)}</span>
                        {section.type === 'file-tree' && (
                          <span className="rounded-full border border-border px-1.5 py-0.5 tracking-[0.16em]">
                            Pinned
                          </span>
                        )}
                        {index < sortedSections.length - 1 && (
                          <span className="text-muted-foreground/35">#{index + 1}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onToggleSectionVisibility(section.id)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                      title={section.isVisible ? 'Hide' : 'Show'}
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
                        className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-destructive"
                        title="Remove"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
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
