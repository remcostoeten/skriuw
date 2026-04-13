"use client";

import { useState, useRef, useEffect } from "react";
import { cn, coerceDate } from "@/shared/lib/utils";
import { usePreferencesStore } from "@/features/settings/store";
import { useJournalStore } from "@/features/journal/store";
import { MOOD_OPTIONS } from "@/features/journal/types";
import type { MoodLevel } from "@/types/journal";
import {
  X,
  Plus,
  Check,
  ChevronDown,
  Hash,
  Calendar,
  Smile,
  MoreHorizontal,
  Grip,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

// Property types that can be added to a document
export type PropertyType = "tags" | "mood" | "date" | "text" | "select";

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

// Property row component - Notion-style inline editing
function PropertyRow({
  property,
  onValueChange,
  onRemove,
}: {
  property: DocumentProperty;
  onValueChange: (value: unknown) => void;
  onRemove?: () => void;
}) {
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
      className="group -mx-2 flex items-start gap-2 border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Drag handle - shown on hover */}
      <div
        className={cn(
          "w-4 h-4 flex items-center justify-center text-muted-foreground/40 cursor-grab",
          isHovered ? "opacity-100" : "opacity-0",
        )}
      >
        <Grip className="w-3 h-3" />
      </div>

      {/* Property name */}
      <div className="flex items-center gap-1.5 w-24 shrink-0 text-muted-foreground">
        <PropertyIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
        <span className="text-xs truncate">{property.name}</span>
      </div>

      {/* Property value */}
      <div className="flex-1 min-w-0">
        <PropertyValue
          property={property}
          isEditing={isEditing}
          onStartEdit={() => setIsEditing(true)}
          onEndEdit={() => setIsEditing(false)}
          onValueChange={onValueChange}
        />
      </div>

      {/* Remove button */}
      {onRemove && isHovered && (
        <button
          onClick={onRemove}
          className="flex h-5 w-5 items-center justify-center border border-transparent text-muted-foreground/60 hover:border-border hover:bg-muted hover:text-foreground"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// Property value renderer based on type
function PropertyValue({
  property,
  isEditing,
  onStartEdit,
  onEndEdit,
  onValueChange,
}: {
  property: DocumentProperty;
  isEditing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onValueChange: (value: unknown) => void;
}) {
  switch (property.type) {
    case "tags":
      return (
        <TagsPropertyValue value={(property.value as string[]) || []} onChange={onValueChange} />
      );
    case "mood":
      return (
        <MoodPropertyValue
          value={property.value as MoodLevel | undefined}
          onChange={onValueChange}
        />
      );
    case "date":
      return (
        <DatePropertyValue
          value={property.value as Date | undefined}
          isEditing={isEditing}
          onStartEdit={onStartEdit}
          onEndEdit={onEndEdit}
          onChange={onValueChange}
        />
      );
    case "text":
      return (
        <TextPropertyValue
          value={(property.value as string) || ""}
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

// Tags property with Notion-style multi-select
function TagsPropertyValue({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const tags = useJournalStore((s) => s.config.tags);
  const createTag = useJournalStore((s) => s.createTag);
  const initializeJournal = useJournalStore((s) => s.initialize);
  const containerRef = useRef<HTMLDivElement>(null);

  const getByName = (name: string) => tags.find((tag) => tag.name === name.toLowerCase());

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    void initializeJournal();
  }, [initializeJournal]);

  const filteredTags = tags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  const handleToggleTag = (tagName: string) => {
    if (value.includes(tagName)) {
      onChange(value.filter((t) => t !== tagName));
    } else {
      onChange([...value, tagName]);
    }
  };

  const handleCreateTag = () => {
    if (search.trim() && !getByName(search.toLowerCase())) {
      createTag(search.trim().toLowerCase());
      onChange([...value, search.trim().toLowerCase()]);
      setSearch("");
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => setIsOpen(true)}
        className="flex flex-wrap items-center gap-1 min-h-[24px] cursor-pointer"
      >
        {value.length > 0 ? (
          value.map((tagName) => {
            const tag = getByName(tagName);
            return (
              <span
                key={tagName}
                className="inline-flex items-center border px-1.5 py-0.5 text-[11px] font-medium"
                style={
                  tag
                    ? {
                        borderColor: `${tag.color}55`,
                        backgroundColor: `${tag.color}1f`,
                        color: tag.color,
                      }
                    : undefined
                }
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
        <div className="absolute top-full left-0 z-50 mt-1 w-56 overflow-hidden border border-border bg-card">
          <div className="p-2 border-b border-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or create tag..."
              className="w-full text-xs bg-transparent outline-hidden placeholder:text-muted-foreground/50"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) {
                  handleCreateTag();
                }
              }}
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filteredTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleToggleTag(tag.name)}
                className="flex w-full items-center gap-2 border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted"
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center border",
                    value.includes(tag.name) ? "bg-foreground border-foreground" : "border-border",
                  )}
                >
                  {value.includes(tag.name) && <Check className="w-3 h-3 text-background" />}
                </span>
                <span
                  className="border px-1.5 py-0.5 text-[11px]"
                  style={{
                    borderColor: `${tag.color}55`,
                    backgroundColor: `${tag.color}1f`,
                    color: tag.color,
                  }}
                >
                  {tag.name}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground/50">
                  {tag.usageCount}
                </span>
              </button>
            ))}
            {search.trim() && !getByName(search.toLowerCase()) && (
              <button
                onClick={handleCreateTag}
                className="flex w-full items-center gap-2 border border-transparent px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted"
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

// Mood property with visual selector
function MoodPropertyValue({
  value,
  onChange,
}: {
  value: MoodLevel | undefined;
  onChange: (value: MoodLevel | undefined) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const recordMood = usePreferencesStore((s) => s.recordMood);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelect = (level: MoodLevel) => {
    if (value === level) {
      onChange(undefined);
    } else {
      onChange(level);
      recordMood(level);
    }
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-1.5 min-h-[24px]">
        {value ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 border border-border px-1.5 py-0.5 text-[11px] font-medium",
              MOOD_OPTIONS[value].color,
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
        <div className="absolute top-full left-0 z-50 mt-1 overflow-hidden border border-border bg-card">
          <div className="p-1">
            {Object.entries(MOOD_OPTIONS).map(([level, mood]) => (
              <button
                key={level}
                onClick={() => handleSelect(level as MoodLevel)}
                className={cn(
                  "flex w-full items-center gap-2 border border-transparent px-3 py-1.5 transition-colors hover:border-border hover:bg-muted",
                  value === level && "border-border bg-muted",
                )}
              >
                <span className={cn("font-mono text-xs", mood.color)}>{mood.icon}</span>
                <span className="text-xs">{mood.label}</span>
                {value === level && <Check className="w-3 h-3 ml-auto" />}
              </button>
            ))}
            {value && (
              <>
                <div className="h-px bg-border my-1" />
                <button
                  onClick={() => {
                    onChange(undefined);
                    setIsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 border border-transparent px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted"
                >
                  <X className="w-3 h-3" />
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

// Date property
function DatePropertyValue({
  value,
  isEditing: _isEditing,
  onStartEdit,
  onEndEdit: _onEndEdit,
  onChange: _onChange,
}: {
  value: Date | undefined;
  isEditing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onChange: (value: Date | undefined) => void;
}) {
  return (
    <button
      onClick={onStartEdit}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {value ? format(value, "MMM d, yyyy") : "Empty"}
    </button>
  );
}

// Text property
function TextPropertyValue({
  value,
  isEditing,
  onStartEdit,
  onEndEdit,
  onChange,
}: {
  value: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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
        onChange={(e) => onChange(e.target.value)}
        onBlur={onEndEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            onEndEdit();
          }
        }}
        className="w-full text-xs bg-transparent outline-hidden"
      />
    );
  }

  return (
    <button onClick={onStartEdit} className="text-xs text-left w-full truncate">
      {value || <span className="text-muted-foreground/60">Empty</span>}
    </button>
  );
}

// Add property button with dropdown
function AddPropertyButton({ onAdd }: { onAdd: (type: PropertyType, name: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const propertyTypes: { type: PropertyType; name: string; icon: typeof Hash }[] = [
    { type: "tags", name: "Tags", icon: Hash },
    { type: "mood", name: "Mood", icon: Smile },
    { type: "date", name: "Date", icon: Calendar },
    { type: "text", name: "Text", icon: MoreHorizontal },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 -mx-2 border border-transparent px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
      >
        <Plus className="w-3.5 h-3.5" />
        Add a property
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1 w-48 overflow-hidden border border-border bg-card">
          <div className="p-1">
            {propertyTypes.map(({ type, name, icon: Icon }) => (
              <button
                key={type}
                onClick={() => {
                  onAdd(type, name);
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 border border-transparent px-3 py-1.5 transition-colors hover:border-border hover:bg-muted"
              >
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs">{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Main DocumentProperties component
export function DocumentProperties({
  properties,
  onPropertyChange,
  onAddProperty,
  onRemoveProperty,
  createdAt,
  updatedAt,
  compact = false,
}: Props) {
  const normalizedCreatedAt = coerceDate(createdAt);
  const normalizedUpdatedAt = coerceDate(updatedAt);

  return (
    <div className={cn("space-y-1", compact ? "text-xs" : "")}>
      {/* Properties list */}
      {properties.map((property) => (
        <PropertyRow
          key={property.id}
          property={property}
          onValueChange={(value) => onPropertyChange(property.id, value)}
          onRemove={onRemoveProperty ? () => onRemoveProperty(property.id) : undefined}
        />
      ))}

      {/* Add property button */}
      {onAddProperty && <AddPropertyButton onAdd={onAddProperty} />}

      {/* Timestamps - subtle footer */}
      {(normalizedCreatedAt || normalizedUpdatedAt) && (
        <div className="mt-3 space-y-0.5 border-t border-border pt-3">
          {normalizedCreatedAt && (
            <p className="text-[10px] text-muted-foreground/50">
              Created {formatDistanceToNow(normalizedCreatedAt, { addSuffix: true })}
            </p>
          )}
          {normalizedUpdatedAt &&
            normalizedCreatedAt?.getTime() !== normalizedUpdatedAt.getTime() && (
            <p className="text-[10px] text-muted-foreground/50">
              Edited {formatDistanceToNow(normalizedUpdatedAt, { addSuffix: true })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
