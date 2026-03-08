"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/shared/lib/utils";
import { useSettingsStore } from "@/modules/settings";
import { MOOD_OPTIONS, MoodLevel } from "@/types/notes";
import { X, Plus, Check } from "lucide-react";

type Props = {
  selectedMood?: MoodLevel;
  selectedTags: string[];
  onMoodChange: (mood: MoodLevel | undefined) => void;
  onTagsChange: (tags: string[]) => void;
  compact?: boolean;
};

export function JournalMetadataEditor({
  selectedMood,
  selectedTags,
  onMoodChange,
  onTagsChange,
  compact = false,
}: Props) {
  const { getSavedTags, addTag, updateTagUsage, recordMood } = useSettingsStore();
  const savedTags = getSavedTags();

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAddingTag && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAddingTag]);

  const handleMoodSelect = (level: MoodLevel) => {
    if (selectedMood === level) {
      onMoodChange(undefined);
    } else {
      onMoodChange(level);
      recordMood(level);
    }
  };

  const handleTagToggle = (tagName: string) => {
    if (selectedTags.includes(tagName)) {
      onTagsChange(selectedTags.filter((t) => t !== tagName));
    } else {
      onTagsChange([...selectedTags, tagName]);
      const tag = savedTags.find((t) => t.name === tagName);
      if (tag) {
        updateTagUsage(tag.id);
      }
    }
  };

  const handleAddTag = () => {
    const trimmed = newTagName.trim().toLowerCase();
    if (trimmed && !savedTags.find((t) => t.name === trimmed)) {
      addTag(trimmed);
      onTagsChange([...selectedTags, trimmed]);
    } else if (trimmed) {
      // Tag exists, just add it to selection
      if (!selectedTags.includes(trimmed)) {
        onTagsChange([...selectedTags, trimmed]);
      }
    }
    setNewTagName("");
    setIsAddingTag(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    } else if (e.key === "Escape") {
      setIsAddingTag(false);
      setNewTagName("");
    }
  };

  // Sort tags: selected first, then by usage count
  const sortedTags = [...savedTags].sort((a, b) => {
    const aSelected = selectedTags.includes(a.name) ? 1 : 0;
    const bSelected = selectedTags.includes(b.name) ? 1 : 0;
    if (aSelected !== bSelected) return bSelected - aSelected;
    return b.usageCount - a.usageCount;
  });

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {/* Mood Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Mood
          </span>
          {selectedMood && (
            <span className={cn("text-xs", MOOD_OPTIONS[selectedMood].color)}>
              {MOOD_OPTIONS[selectedMood].label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {Object.entries(MOOD_OPTIONS).map(([level, mood]) => (
            <button
              key={level}
              onClick={() => handleMoodSelect(level as MoodLevel)}
              className={cn(
                "flex-1 h-8 rounded-md text-xs font-mono transition-all",
                "border hover:border-foreground/30",
                selectedMood === level
                  ? cn("border-foreground/50 bg-accent", mood.color)
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
              title={mood.label}
            >
              {mood.icon}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground/60 px-0.5">
          <span>rough</span>
          <span>great</span>
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Tags
          </span>
          <span className="text-[10px] text-muted-foreground">{selectedTags.length} selected</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {sortedTags.map((tag) => {
            const isSelected = selectedTags.includes(tag.name);
            return (
              <button
                key={tag.id}
                onClick={() => handleTagToggle(tag.name)}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all border",
                  isSelected
                    ? tag.color
                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {isSelected && <Check className="w-3 h-3" strokeWidth={2} />}
                <span>{tag.name}</span>
                {tag.usageCount > 0 && !isSelected && (
                  <span className="text-[10px] opacity-50">{tag.usageCount}</span>
                )}
              </button>
            );
          })}

          {/* Add tag button/input */}
          {isAddingTag ? (
            <div className="inline-flex items-center gap-1 border border-foreground/30 rounded-md overflow-hidden">
              <input
                ref={inputRef}
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  if (!newTagName.trim()) {
                    setIsAddingTag(false);
                  }
                }}
                placeholder="tag name"
                className="w-20 px-2 py-1 text-xs bg-transparent outline-hidden"
              />
              <button
                onClick={handleAddTag}
                className="px-1.5 py-1 text-muted-foreground hover:text-foreground"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onClick={() => {
                  setIsAddingTag(false);
                  setNewTagName("");
                }}
                className="px-1.5 py-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingTag(true)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-dashed border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          )}
        </div>

        {/* Recently used hint */}
        {savedTags.length > 0 && (
          <p className="text-[10px] text-muted-foreground/60">
            Tags are saved and reused across your journal entries
          </p>
        )}
      </div>
    </div>
  );
}
