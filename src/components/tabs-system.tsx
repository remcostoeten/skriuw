"use client";

import { useState, useCallback, useEffect } from 'react';
import { X, Plus, GripVertical } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { Note } from '@/api/db/schema';

interface Tab {
  id: string;
  noteId: string;
  title: string;
  isActive: boolean;
}

interface TabSystemProps {
  openTabs: Tab[];
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
  onTabReorder: (fromIndex: number, toIndex: number) => void;
  notes: Note[];
}

export function TabSystem({
  openTabs,
  onTabSelect,
  onTabClose,
  onNewTab,
  onTabReorder,
  notes
}: TabSystemProps) {
  const [draggedTab, setDraggedTab] = useState<number | null>(null);
  const [dragOverTab, setDragOverTab] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedTab(index);
    e.dataTransfer.effectAllowed = 'move';

    // Create a custom drag image
    const dragImage = e.target as HTMLElement;
    const rect = dragImage.getBoundingClientRect();
    e.dataTransfer.setDragImage(dragImage, rect.width / 2, rect.height / 2);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedTab !== null && draggedTab !== index) {
      setDragOverTab(index);
    }
  }, [draggedTab]);

  const handleDragLeave = useCallback(() => {
    setDragOverTab(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverTab(null);

    if (draggedTab !== null && draggedTab !== dropIndex) {
      onTabReorder(draggedTab, dropIndex);
    }

    setDraggedTab(null);
  }, [draggedTab, onTabReorder]);

  const handleDragEnd = useCallback(() => {
    setDraggedTab(null);
    setDragOverTab(null);
  }, []);

  const handleTabClose = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onTabClose(tabId);
  }, [onTabClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, tabId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTabSelect(tabId);
    }
  }, [onTabSelect]);

  const handleNewTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onNewTab();
    }
  }, [onNewTab]);

  // Update tab titles when note titles change
  const tabsWithUpdatedTitles = openTabs.map(tab => {
    const note = notes.find(n => n.id === tab.noteId);
    return {
      ...tab,
      title: note?.title || 'Untitled'
    };
  });

  if (openTabs.length === 0) {
    return (
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="text-sm text-muted-foreground">No tabs open</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewTab}
          onKeyDown={handleNewTabKeyDown}
          className="h-6 w-6 p-0"
          title="New Tab"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="flex flex-1 overflow-x-auto">
        {tabsWithUpdatedTitles.map((tab, index) => (
          <div
            key={tab.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            className={`
              group relative flex items-center max-w-[200px] cursor-pointer
              border-r border-border/50 transition-all duration-200
              ${tab.isActive
                ? 'bg-background border-t-2 border-t-blue-500'
                : 'bg-muted/30 hover:bg-muted/50'
              }
              ${draggedTab === index ? 'opacity-50' : ''}
              ${dragOverTab === index ? 'border-l-2 border-l-blue-400' : ''}
            `}
            onClick={() => onTabSelect(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, tab.id)}
            role="tab"
            aria-selected={tab.isActive}
            tabIndex={0}
          >
            {/* Drag Handle */}
            <div className="flex items-center px-2 py-1">
              <GripVertical className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Tab Content */}
            <div className="flex-1 min-w-0 px-1 py-1">
              <div className="truncate text-sm font-medium">
                {tab.title}
              </div>
            </div>

            {/* Close Button */}
            {openTabs.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => handleTabClose(e, tab.id)}
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20 hover:text-destructive"
                title="Close Tab"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* New Tab Button */}
      <div className="flex items-center px-2 py-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewTab}
          onKeyDown={handleNewTabKeyDown}
          className="h-6 w-6 p-0 hover:bg-muted/50"
          title="New Tab"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}