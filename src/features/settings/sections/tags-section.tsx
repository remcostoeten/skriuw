"use client";

import dynamic from "next/dynamic";

const TagManager = dynamic(
  () =>
    import("@/features/settings/components/tag-manager").then((mod) => ({
      default: mod.TagManager,
    })),
  { ssr: false, loading: () => null },
);

export function TagsSection() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">Tags</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Manage the tag vocabulary across notes and journal entries.
        </p>
      </div>
      <div className="border-t border-border" />
      <TagManager />
    </div>
  );
}
