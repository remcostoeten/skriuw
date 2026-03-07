'use client';

import { useEffect, useRef, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Calendar,
  Check,
  ChevronDown,
  Grip,
  Hash,
  MoreHorizontal,
  Plus,
  Smile,
  X,
} from 'lucide-react';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/modules/settings';
import { MOOD_OPTIONS, MoodLevel } from '@/types/notes';

export type PropertyType = 'tags' | 'mood' | 'date' | 'text' | 'select';

export type DocumentProperty = {
  id: string;
  type: PropertyType;
  name: string;
  value: unknown;
};

type Props = {
  properties: DocumentProperty[];
  onPropertyChange: (id: string, value: unknown) => void;
  onAddProperty?: (type: PropertyType, name: string) => void;
  onRemoveProperty?: (id: string) => void;
  createdAt?: Date;
  updatedAt?: Date;
  compact?: boolean;
};

type RowProps = {
  property: DocumentProperty;
  onValueChange: (value: unknown) => void;
  onRemove?: () => void;
};

type ValueProps = {
  property: DocumentProperty;
  isEditing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onValueChange: (value: unknown) => void;
};

type TagsProps = {
  value: string[];
  onChange: (value: string[]) => void;
};

type MoodProps = {
  value: MoodLevel | undefined;
  onChange: (value: MoodLevel | undefined) => void;
};

type DateProps = {
  value: Date | undefined;
  onStartEdit: () => void;
};

type TextProps = {
  value: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onChange: (value: string) => void;
};

type AddProps = {
  onAdd: (type: PropertyType, name: string) => void;
};

function PropertyRow({ property, onValueChange, onRemove }: RowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const PropertyIcon = {
    tags: Hash,
    mood: Smile,
    date: Calendar,
    text: MoreHorizontal,
    select: ChevronDown,
  }[property.type];

  return (
    <div
      className="group -mx-2 flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50"
      onMouseEnter={function handleEnter() {
        setIsHovered(true);
      }}
      onMouseLeave={function handleLeave() {
        setIsHovered(false);
      }}
    >
      <div
        className={cn(
          'flex h-4 w-4 cursor-grab items-center justify-center text-muted-foreground/40',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}
      >
        <Grip className="h-3 w-3" />
      </div>

      <div className="flex w-24 shrink-0 items-center gap-1.5 text-muted-foreground">
        <PropertyIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
        <span className="truncate text-xs">{property.name}</span>
      </div>

      <div className="min-w-0 flex-1">
        <PropertyValue
          property={property}
          isEditing={isEditing}
          onStartEdit={function handleStart() {
            setIsEditing(true);
          }}
          onEndEdit={function handleEnd() {
            setIsEditing(false);
          }}
          onValueChange={onValueChange}
        />
      </div>

      {onRemove && isHovered && (
        <button
          onClick={onRemove}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function PropertyValue({
  property,
  isEditing,
  onStartEdit,
  onEndEdit,
  onValueChange,
}: ValueProps) {
  switch (property.type) {
    case 'tags':
      return (
        <TagsPropertyValue
          value={(property.value as string[]) || []}
          onChange={onValueChange}
        />
      );

    case 'mood':
      return (
        <MoodPropertyValue
          value={property.value as MoodLevel | undefined}
          onChange={onValueChange}
        />
      );

    case 'date':
      return (
        <DatePropertyValue
          value={property.value as Date | undefined}
          onStartEdit={onStartEdit}
        />
      );

    case 'text':
      return (
        <TextPropertyValue
          value={(property.value as string) || ''}
          isEditing={isEditing}
          onStartEdit={onStartEdit}
          onEndEdit={onEndEdit}
          onChange={onValueChange}
        />
      );

    default:
      return <span className="text-xs text-muted-foreground">Empty</span>;
  }
}

function TagsPropertyValue({ value, onChange }: TagsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { getSavedTags, addTag, updateTagUsage } = useSettingsStore();
  const savedTags = getSavedTags();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(function bindClick() {
    function handleClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
    }

    return function cleanup() {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen]);

  const filteredTags = savedTags.filter(function filterTag(tag) {
    return tag.name.toLowerCase().includes(search.toLowerCase());
  });

  function handleToggleTag(tagName: string) {
    if (value.includes(tagName)) {
      onChange(
        value.filter(function filterValue(item) {
          return item !== tagName;
        })
      );
      return;
    }

    onChange([...value, tagName]);

    const tag = savedTags.find(function findTag(item) {
      return item.name === tagName;
    });

    if (tag) {
      updateTagUsage(tag.id);
    }
  }

  function handleCreateTag() {
    const next = search.trim().toLowerCase();

    if (!next) {
      return;
    }

    const exists = savedTags.find(function findTag(tag) {
      return tag.name === next;
    });

    if (exists) {
      return;
    }

    addTag(next);
    onChange([...value, next]);
    setSearch('');
  }

  return (
    <div ref={boxRef} className="relative">
      <div
        onClick={function handleOpen() {
          setIsOpen(true);
        }}
        className="flex min-h-[24px] cursor-pointer flex-wrap items-center gap-1"
      >
        {value.length > 0 ? (
          value.map(function renderTag(tagName) {
            const tag = savedTags.find(function findTag(item) {
              return item.name === tagName;
            });

            return (
              <span
                key={tagName}
                className={cn(
                  'inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium',
                  tag?.color || 'border-zinc-500/30 bg-zinc-500/20 text-zinc-400'
                )}
              >
                {tagName}
              </span>
            );
          })
        ) : (
          <span className="text-xs text-muted-foreground/60">Empty</span>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="border-b border-border p-2">
            <input
              type="text"
              value={search}
              onChange={function handleChange(e) {
                setSearch(e.target.value);
              }}
              placeholder="Search or create tag..."
              className="w-full text-xs bg-transparent outline-hidden placeholder:text-muted-foreground/50"
              autoFocus
              onKeyDown={function handleKey(e) {
                if (e.key === 'Enter' && search.trim()) {
                  handleCreateTag();
                }
              }}
            />
          </div>

          <div className="max-h-48 overflow-y-auto p-1">
            {filteredTags.map(tag => (
              <button
                key={tag.id}
                onClick={() => handleToggleTag(tag.name)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 transition-colors"
              >
                <span className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center",
                  value.includes(tag.name) ? "bg-foreground border-foreground" : "border-border"
                )}>
                  {value.includes(tag.name) && <Check className="w-3 h-3 text-background" />}
                </span>
                <span className={cn(
                  "px-1.5 py-0.5 rounded text-[11px] border",
                  tag.color
                )}>
                  {tag.name}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground/50">
                  {tag.usageCount}
                </span>
              </button>
            ))}
            {search.trim() && !savedTags.find(t => t.name === search.toLowerCase()) && (
              <button
                onClick={handleCreateTag}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 transition-colors text-xs text-muted-foreground"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create &quot;{search}&quot;</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MoodPropertyValue({ value, onChange }: MoodProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { recordMood } = useSettingsStore();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(function bindClick() {
    function handleClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
    }

    return function cleanup() {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen]);

  function handleSelect(level: MoodLevel) {
    if (value === level) {
      onChange(undefined);
      setIsOpen(false);
      return;
    }

    onChange(level);
    recordMood(level);
    setIsOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={function handleOpen() {
          setIsOpen(!isOpen);
        }}
        className="flex min-h-[24px] items-center gap-1.5"
      >
        {value ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] font-medium',
              MOOD_OPTIONS[value].color
            )}
          >
            <span className="font-mono">{MOOD_OPTIONS[value].icon}</span>
            {MOOD_OPTIONS[value].label}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/60">Empty</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="p-1">
            {Object.entries(MOOD_OPTIONS).map(function renderMood([level, mood]) {
              const active = value === level;

              return (
                <button
                  key={level}
                  onClick={function handlePick() {
                    handleSelect(level as MoodLevel);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-3 py-1.5 transition-colors hover:bg-accent/50',
                    active && 'bg-accent'
                  )}
                >
                  <span className={cn('font-mono text-xs', mood.color)}>{mood.icon}</span>
                  <span className="text-xs">{mood.label}</span>
                  {active && <Check className="ml-auto h-3 w-3" />}
                </button>
              );
            })}

            {value && (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  onClick={function handleClear() {
                    onChange(undefined);
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DatePropertyValue({ value, onStartEdit }: DateProps) {
  return (
    <button
      onClick={onStartEdit}
      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {value ? format(value, 'MMM d, yyyy') : 'Empty'}
    </button>
  );
}

function TextPropertyValue({
  value,
  isEditing,
  onStartEdit,
  onEndEdit,
  onChange,
}: TextProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(function syncFocus() {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={function handleChange(e) {
          onChange(e.target.value);
        }}
        onBlur={onEndEdit}
        onKeyDown={function handleKey(e) {
          if (e.key === 'Enter' || e.key === 'Escape') {
            onEndEdit();
          }
        }}
        className="w-full text-xs bg-transparent outline-hidden"
      />
    );
  }

  return (
    <button onClick={onStartEdit} className="w-full truncate text-left text-xs">
      {value || <span className="text-muted-foreground/60">Empty</span>}
    </button>
  );
}

function AddPropertyButton({ onAdd }: AddProps) {
  const [isOpen, setIsOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(function bindClick() {
    function handleClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
    }

    return function cleanup() {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen]);

  const propertyTypes: { type: PropertyType; name: string; icon: typeof Hash }[] = [
    { type: 'tags', name: 'Tags', icon: Hash },
    { type: 'mood', name: 'Mood', icon: Smile },
    { type: 'date', name: 'Date', icon: Calendar },
    { type: 'text', name: 'Text', icon: MoreHorizontal },
  ];

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={function handleOpen() {
          setIsOpen(!isOpen);
        }}
        className="-mx-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Add a property
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          <div className="p-1">
            {propertyTypes.map(function renderType(item) {
              const Icon = item.icon;

              return (
                <button
                  key={item.type}
                  onClick={function handleAdd() {
                    onAdd(item.type, item.name);
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-3 py-1.5 transition-colors hover:bg-accent/50"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs">{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function DocumentProperties({
  properties,
  onPropertyChange,
  onAddProperty,
  onRemoveProperty,
  createdAt,
  updatedAt,
  compact = false,
}: Props) {
  return (
    <div className={cn('space-y-1', compact ? 'text-xs' : '')}>
      {properties.map(function renderProperty(property) {
        return (
          <PropertyRow
            key={property.id}
            property={property}
            onValueChange={function handleValue(value) {
              onPropertyChange(property.id, value);
            }}
            onRemove={
              onRemoveProperty
                ? function handleRemove() {
                  onRemoveProperty(property.id);
                }
                : undefined
            }
          />
        );
      })}

      {onAddProperty && <AddPropertyButton onAdd={onAddProperty} />}

      {(createdAt || updatedAt) && (
        <div className="mt-3 space-y-0.5 border-t border-border/50 pt-3">
          {createdAt && (
            <p className="text-[10px] text-muted-foreground/50">
              Created {formatDistanceToNow(createdAt, { addSuffix: true })}
            </p>
          )}

          {updatedAt && updatedAt !== createdAt && (
            <p className="text-[10px] text-muted-foreground/50">
              Edited {formatDistanceToNow(updatedAt, { addSuffix: true })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}