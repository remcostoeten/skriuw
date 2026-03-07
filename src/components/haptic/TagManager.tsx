'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Hash, MoreHorizontal, Plus, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useSettingsStore, TAG_COLORS, SavedTag } from '@/modules/settings';
import { Plus, MoreHorizontal, Trash2, Hash } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function TagManager() {
  const { getSavedTags, addTag, removeTag } = useSettingsStore();
  const savedTags = getSavedTags();

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(TAG_COLORS[0].value);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    function syncFocus() {
      if (isAddingTag && inputRef.current) {
        inputRef.current.focus();
      }
    },
    [isAddingTag]
  );

  function handleAddTag() {
    const trimmed = newTagName.trim().toLowerCase();

    if (
      trimmed &&
      !savedTags.find(function findTag(tag) {
        return tag.name === trimmed;
      })
    ) {
      addTag(trimmed, selectedColor);
    }

    setNewTagName('');
    setSelectedColor(TAG_COLORS[0].value);
    setIsAddingTag(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
      return;
    }

    if (e.key === 'Escape') {
      setIsAddingTag(false);
      setNewTagName('');
      setSelectedColor(TAG_COLORS[0].value);
    }
  }

  const sortedTags = [...savedTags].sort(function sortTags(a, b) {
    return b.usageCount - a.usageCount;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Manage Tags</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {savedTags.length} tags created
          </p>
        </div>

        {!isAddingTag && (
          <button
            onClick={function handleOpen() {
              setIsAddingTag(true);
            }}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            New tag
          </button>
        )}
      </div>

      {isAddingTag && (
        <div className="space-y-3 rounded-lg border border-border bg-card/50 p-3">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={newTagName}
              onChange={function handleChange(e) {
                setNewTagName(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Tag name..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          <div className="space-y-2">
            <span className="text-xs text-muted-foreground">Color</span>
            <div className="flex flex-wrap gap-1.5">
              {TAG_COLORS.map(function renderColor(color) {
                return (
                  <button
                    key={color.name}
                    onClick={function handlePick() {
                      setSelectedColor(color.value);
                    }}
                    className={cn(
                      'h-6 w-6 rounded-md border-2 transition-all',
                      color.value.split(' ')[0],
                      selectedColor === color.value
                        ? 'scale-110 border-foreground'
                        : 'border-transparent hover:scale-105'
                    )}
                    title={color.name}
                    type="button"
                  />
                );
              })}
            </div>
          </div>

          {newTagName && (
            <div className="border-t border-border/50 pt-2">
              <span className="text-xs text-muted-foreground">Preview:</span>
              <span
                className={cn(
                  'ml-1 inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium',
                  selectedColor
                )}
              >
                {newTagName.toLowerCase()}
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={function handleCancel() {
                setIsAddingTag(false);
                setNewTagName('');
                setSelectedColor(TAG_COLORS[0].value);
              }}
              className="px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              type="button"
            >
              Cancel
            </button>

            <button
              onClick={handleAddTag}
              disabled={!newTagName.trim()}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs transition-colors',
                newTagName.trim()
                  ? 'bg-foreground text-background hover:bg-foreground/90'
                  : 'cursor-not-allowed bg-muted text-muted-foreground'
              )}
              type="button"
            >
              Create tag
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {sortedTags.map(function renderTag(tag) {
          return (
            <TagRow
              key={tag.id}
              tag={tag}
              isEditing={editingTagId === tag.id}
              onEdit={function handleEdit() {
                setEditingTagId(tag.id);
              }}
              onStopEdit={function handleStop() {
                setEditingTagId(null);
              }}
              onDelete={function handleDelete() {
                removeTag(tag.id);
              }}
            />
          );
        })}

        {savedTags.length === 0 && !isAddingTag && (
          <div className="py-8 text-center">
            <Hash className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No tags yet</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Create your first tag to organize your notes
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

type RowProps = {
  tag: SavedTag;
  onDelete: () => void;
};

function TagRow({ tag, isEditing, onEdit, onStopEdit, onDelete }: RowProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(
    function bindClick() {
      function handleClickOutside(e: MouseEvent) {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setShowMenu(false);
        }
      }

      if (showMenu) {
        document.addEventListener('mousedown', handleClickOutside);
      }

      return function cleanup() {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    },
    [showMenu]
  );

  return (
    <div className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/30">
      <span
        className={cn(
          'inline-flex min-w-[60px] items-center rounded border px-2 py-0.5 text-xs font-medium',
          tag.color
        )}
      >
        {tag.name}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{tag.usageCount} uses</span>
          {tag.lastUsedAt && (
            <span className="truncate">
              Last used {formatDistanceToNow(new Date(tag.lastUsedAt), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={function handleMenu() {
            setShowMenu(!showMenu);
          }}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground',
            showMenu ? 'bg-accent' : 'opacity-0 group-hover:opacity-100'
          )}
          type="button"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            <div className="p-1">
              <button
                onClick={function handleDelete() {
                  onDelete();
                  setShowMenu(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete tag
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}