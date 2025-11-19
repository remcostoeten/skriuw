import React from 'react';
import { Sidebar } from "@/components/sidebar";
import { SkeletonSidebar } from "@/components/SkeletonSidebar";
import { useStreamingData } from "@/hooks/useStreamingData";
import { SKELETON_ITEMS } from "@/shared/ui/skeleton-data";
import { getStorage } from "@/features/notes";
import type { Item } from "@/features/notes";

type props = {
  activeNoteId?: string;
}

export function StreamingSidebar({ activeNoteId }: props) {
  const {
    data: items,
    isLoading,
    isHydrating,
    error,
  } = useStreamingData({
    skeletonData: SKELETON_ITEMS,
    fetchData: () => getStorage().getItems(),
    skeletonDelay: 50, // Small delay to avoid flash on fast connections
    minSkeletonTime: 300, // Minimum skeleton time for smooth UX
  });

  if (error) {
    return (
      <div className="w-[210px] h-full bg-Skriuw-darker flex flex-col border-r border-Skriuw-border">
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-red-400 mb-2">Failed to load notes</p>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1 bg-Skriuw-border hover:bg-Skriuw-border/80 rounded-md text-xs text-Skriuw-text transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show skeleton while loading
  if (isLoading) {
    return <SkeletonSidebar />;
  }

  // Show real sidebar with hydration effect
  return (
    <div className={`${isHydrating ? 'animate-pulse' : ''} transition-opacity duration-300`}>
      <Sidebar activeNoteId={activeNoteId} />
    </div>
  );
}