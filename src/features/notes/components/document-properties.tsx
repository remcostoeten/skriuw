"use client";

import { useState, useRef, useEffect } from "react";
import { cn, coerceDate } from "@/shared/lib/utils";
import { useSettingsStore } from "@/modules/settings";
import { MOOD_OPTIONS, MoodLevel } from "@/types/notes";
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
      className="group flex items-start gap-2 py-1.5 px-2 -mx-2 rounded-md hover:bg-accent/50 transition-colors"
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
          className="w-5 h-5 flex items-center justify-center text-muted-foreground/60 hover:text-foreground rounded"
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
  const { getSavedTags, addTag, updateTagUsage } = useSettingsStore();
  const savedTags = getSavedTags();
  const containerRef = useRef<HTMLDivElement>(null);

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

  const filteredTags = savedTags.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  const handleToggleTag = (tagName: string) => {
    if (value.includes(tagName)) {
      onChange(value.filter((t) => t !== tagName));
    } else {
      onChange([...value, tagName]);
      const tag = savedTags.find((t) => t.name === tagName);
      if (tag) updateTagUsage(tag.id);
    }
  };

  const handleCreateTag = () => {
    if (search.trim() && !savedTags.find((t) => t.name === search.toLowerCase())) {
      addTag(search.trim().toLowerCase());
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
            const tag = savedTags.find((t) => t.name === tagName);
            return (
              <span
                key={tagName}
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border",
                  tag?.color || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
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
        <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
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
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 transition-colors"
              >
                <span
                  className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center",
                    value.includes(tag.name) ? "bg-foreground border-foreground" : "border-border",
                  )}
                >
                  {value.includes(tag.name) && <Check className="w-3 h-3 text-background" />}
                </span>
                <span className={cn("px-1.5 py-0.5 rounded text-[11px] border", tag.color)}>
                  {tag.name}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground/50">
                  {tag.usageCount}
                </span>
              </button>
            ))}
            {search.trim() && !savedTags.find((t) => t.name === search.toLowerCase()) && (
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

// Mood property with visual selector
function MoodPropertyValue({
  value,
  onChange,
}: {
  value: MoodLevel | undefined;
  onChange: (value: MoodLevel | undefined) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { recordMood } = useSettingsStore();
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
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border border-border",
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
        <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="p-1">
            {Object.entries(MOOD_OPTIONS).map(([level, mood]) => (
              <button
                key={level}
                onClick={() => handleSelect(level as MoodLevel)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 rounded hover:bg-accent/50 transition-colors",
                  value === level && "bg-accent",
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
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded hover:bg-accent/50 transition-colors text-xs text-muted-foreground"
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
        className="flex items-center gap-1.5 px-2 py-1.5 -mx-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add a property
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="p-1">
            {propertyTypes.map(({ type, name, icon: Icon }) => (
              <button
                key={type}
                onClick={() => {
                  onAdd(type, name);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded hover:bg-accent/50 transition-colors"
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
        <div className="pt-3 mt-3 border-t border-border/50 space-y-0.5">
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
