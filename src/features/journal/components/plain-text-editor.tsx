"use client";

import { useRef, useEffect, useState, useMemo, useId, useCallback } from "react";
import { cn } from "@/shared/lib/utils";
import { findActiveTagMention, replaceActiveTagMention } from "./tag-mention-utils";
import { useJournalTags } from "../hooks/use-journal-hooks";

type PlainTextEditorProps = {
  content: string;
  onChange: (content: string) => void;
  onInsertTag: (tagName: string) => void;
  placeholder?: string;
};

export function PlainTextEditor({
  content,
  onChange,
  onInsertTag,
  placeholder = "Start writing... Use @ to mention tags.",
}: PlainTextEditorProps) {
  const { data: allTags = [] } = useJournalTags();
  const [showTagPopup, setShowTagPopup] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [tagCursorStart, setTagCursorStart] = useState<number | null>(null);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popupId = useId();
  const helpTextId = `${popupId}-help`;
  const statusTextId = `${popupId}-status`;

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(400, textarea.scrollHeight)}px`;
  }, [content]);

  const suggestions = useMemo(() => {
    const lower = tagQuery.toLowerCase().trim();

    if (!lower) {
      return allTags.slice(0, 8);
    }

    return allTags.filter((tag) => tag.name.includes(lower)).slice(0, 8);
  }, [allTags, tagQuery]);

  const canCreateTag =
    tagQuery.trim().length > 0 &&
    !suggestions.some((suggestion) => suggestion.name === tagQuery.trim().toLowerCase());

  const popupOptions = useMemo(
    () => [
      ...suggestions.map((tag) => ({
        id: `${popupId}-${tag.id}`,
        key: tag.id,
        kind: "suggestion" as const,
        name: tag.name,
        color: tag.color,
        usageCount: tag.usageCount,
      })),
      ...(canCreateTag
        ? [
            {
              id: `${popupId}-create`,
              key: "__create__",
              kind: "create" as const,
              name: tagQuery.trim().toLowerCase(),
            },
          ]
        : []),
    ],
    [canCreateTag, popupId, suggestions, tagQuery],
  );

  const activeOptionId =
    showTagPopup && popupOptions[selectedSuggestionIdx]
      ? popupOptions[selectedSuggestionIdx].id
      : undefined;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(newContent);

    const activeMention = findActiveTagMention(newContent, cursorPos);

    if (activeMention) {
      setShowTagPopup(true);
      setTagQuery(activeMention.query);
      setTagCursorStart(activeMention.start);
      setSelectedSuggestionIdx(0);
    } else {
      setShowTagPopup(false);
      setTagQuery("");
      setTagCursorStart(null);
    }
  };

  const insertTag = useCallback(
    (tagName: string) => {
      if (tagCursorStart === null) return;

      const cursorPos = textareaRef.current?.selectionStart ?? content.length;
      const replacement = replaceActiveTagMention(content, tagCursorStart, cursorPos, tagName);
      
      onChange(replacement.content);
      onInsertTag(tagName);

      setShowTagPopup(false);
      setTagQuery("");
      setTagCursorStart(null);
      setSelectedSuggestionIdx(0);

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(
            replacement.cursorPosition,
            replacement.cursorPosition,
          );
        }
      });
    },
    [content, tagCursorStart, onChange, onInsertTag],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showTagPopup || popupOptions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) => (prev + 1) % popupOptions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIdx((prev) => (prev - 1 + popupOptions.length) % popupOptions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const option = popupOptions[selectedSuggestionIdx];
      if (!option) return;
      if (option.kind === "create") {
        const normalizedTag = tagQuery.trim().toLowerCase();
        insertTag(normalizedTag);
      } else {
        insertTag(option.name);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowTagPopup(false);
      setSelectedSuggestionIdx(0);
    }
  };

  return (
    <div className="relative">
      <span id={helpTextId} className="sr-only">
        Type at-sign to open tag suggestions. Use arrow keys to move through results, Enter or Tab
        to insert a tag, and Escape to close the menu.
      </span>
      <span id={statusTextId} className="sr-only" aria-live="polite" aria-atomic="true">
        {showTagPopup
          ? popupOptions.length > 0
            ? `${popupOptions.length} tag option${popupOptions.length === 1 ? "" : "s"} available.`
            : "No tag options available."
          : ""}
      </span>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Small delay to allow clicking suggestions
          setTimeout(() => {
            setShowTagPopup(false);
            setSelectedSuggestionIdx(0);
          }, 150);
        }}
        placeholder={placeholder}
        aria-label="Journal entry"
        aria-describedby={`${helpTextId} ${statusTextId}`}
        aria-autocomplete="list"
        aria-controls={showTagPopup ? popupId : undefined}
        aria-expanded={showTagPopup}
        aria-activedescendant={activeOptionId}
        className="w-full resize-none bg-transparent text-[16px] leading-[1.75] text-foreground outline-none placeholder:text-muted-foreground/30 md:text-[17px]"
        style={{ minHeight: "400px" }}
        spellCheck
      />

      {showTagPopup && (
        <div
          id={popupId}
          role="listbox"
          aria-label="Tag suggestions"
          className="absolute left-0 top-8 z-50 w-64 overflow-hidden border border-border bg-popover"
        >
          {popupOptions.length > 0 ? (
            <div className="max-h-[220px] overflow-y-auto p-1.5">
              {popupOptions.map((option, idx) => (
                <button
                  key={option.key}
                  id={option.id}
                  role="option"
                  type="button"
                  aria-selected={idx === selectedSuggestionIdx}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (option.kind === "create") {
                      const normalizedTag = tagQuery.trim().toLowerCase();
                      insertTag(normalizedTag);
                    } else {
                      insertTag(option.name);
                    }
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 border border-transparent px-3 py-2 text-left text-[13px] transition-colors",
                    idx === selectedSuggestionIdx
                      ? "border-border bg-muted text-foreground"
                      : "text-foreground/70 hover:border-border hover:bg-muted",
                    option.kind === "create" && "border-t border-border text-indigo-400",
                  )}
                >
                  {option.kind === "create" ? (
                    <span className="text-[11px]">+</span>
                  ) : (
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: option.color }}
                    />
                  )}
                  <span className="truncate">
                    {option.kind === "create" ? `Create @${option.name}` : `@${option.name}`}
                  </span>
                  {option.kind === "suggestion" ? (
                    <span className="ml-auto text-[10px] text-muted-foreground/40">
                      {option.usageCount}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 text-[13px] text-muted-foreground/70">
              Continue typing to find or create a tag.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
