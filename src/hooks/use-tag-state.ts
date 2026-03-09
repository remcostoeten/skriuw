import { useCallback } from "react";
import { useTagStore } from "@/store/tag-store";

/**
 * Hook for tag operations on a document.
 * Bridges the tag store with document-level tag selection.
 */
export function useTagState(
  selectedTags: string[],
  onTagsChange: (tags: string[]) => void,
) {
  const tags = useTagStore((state) => state.tags);
  const create = useTagStore((state) => state.create);
  const remove = useTagStore((state) => state.remove);
  const incrementUsage = useTagStore((state) => state.incrementUsage);
  const getByName = useTagStore((state) => state.getByName);
  const search = useTagStore((state) => state.search);

  const toggleTag = useCallback(
    (tagName: string) => {
      if (selectedTags.includes(tagName)) {
        onTagsChange(selectedTags.filter((t) => t !== tagName));
      } else {
        onTagsChange([...selectedTags, tagName]);
        const tag = getByName(tagName);
        if (tag) incrementUsage(tag.id);
      }
    },
    [selectedTags, onTagsChange, getByName, incrementUsage],
  );

  const createAndSelect = useCallback(
    (name: string) => {
      const trimmed = name.trim().toLowerCase();
      if (!trimmed) return;

      const newTag = create(trimmed);
      incrementUsage(newTag.id);
      if (!selectedTags.includes(trimmed)) {
        onTagsChange([...selectedTags, trimmed]);
      }
    },
    [create, incrementUsage, selectedTags, onTagsChange],
  );

  // Sort tags: selected first, then by usage count
  const sortedTags = [...tags].sort((a, b) => {
    const aSelected = selectedTags.includes(a.name) ? 1 : 0;
    const bSelected = selectedTags.includes(b.name) ? 1 : 0;
    if (aSelected !== bSelected) return bSelected - aSelected;
    return b.usageCount - a.usageCount;
  });

  return {
    tags,
    sortedTags,
    selectedTags,
    toggleTag,
    createAndSelect,
    removeTag: remove,
    searchTags: search,
  };
}
