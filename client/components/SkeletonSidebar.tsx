import React from 'react';

export function SkeletonSidebar() {
  return (
    <div className="w-[210px] h-full bg-Skriuw-darker flex flex-col border-r border-Skriuw-border">
      {/* Header skeleton - matches ActionBar structure */}
      <div className="p-3 space-y-2">
        <div className="flex gap-2">
          <div className="h-7 bg-Skriuw-border rounded animate-pulse flex-1" style={{ minHeight: '1.75rem' }}></div>
          <div className="h-7 bg-Skriuw-border rounded animate-pulse" style={{ width: '28px', height: '28px', minHeight: '1.75rem' }}></div>
        </div>
        <div className="h-7 bg-Skriuw-border rounded animate-pulse" style={{ minHeight: '1.75rem' }}></div>
      </div>

      {/* File tree skeleton - matches real sidebar structure exactly */}
      <div className="flex-1 overflow-y-auto px-1 pb-4">
        <div className="flex flex-col gap-0.5">
          {/* Folder skeletons */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              {/* Folder item */}
              <div
                className="relative flex items-center h-7 rounded-md bg-Skriuw-border/20"
                style={{ paddingLeft: `${8}px`, minHeight: '1.75rem' }}
              >
                {/* Folder icon */}
                <div className="w-3.5 h-3.5 bg-Skriuw-border rounded-sm mr-2" style={{ minWidth: '14px', minHeight: '14px' }}></div>

                {/* Folder name */}
                <div className="flex-1 h-3 bg-Skriuw-border rounded-sm mr-2" style={{ minHeight: '12px' }}></div>

                {/* Item count badge */}
                <div className="w-5 h-3 bg-Skriuw-border rounded-sm mr-2" style={{ minWidth: '20px', minHeight: '12px' }}></div>
              </div>

              {/* Nested note skeletons */}
              <div className="mt-0.5">
                {i <= 2 && [1, 2].map((j) => (
                  <div
                    key={j}
                    className="relative flex items-center h-7 rounded-md bg-Skriuw-border/10"
                    style={{ paddingLeft: `${12 + 8}px`, minHeight: '1.75rem' }}
                  >
                    {/* Note icon spacer */}
                    <div className="w-3.5 h-3.5 mr-2" style={{ minWidth: '14px' }}></div>

                    {/* Note name */}
                    <div className="flex-1 h-3 bg-Skriuw-border/50 rounded-sm" style={{ minHeight: '12px' }}></div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* More folder skeletons without children */}
          {[4, 5].map((i) => (
            <div key={i} className="animate-pulse">
              <div
                className="relative flex items-center h-7 rounded-md bg-Skriuw-border/20"
                style={{ paddingLeft: `${8}px`, minHeight: '1.75rem' }}
              >
                <div className="w-3.5 h-3.5 bg-Skriuw-border rounded-sm mr-2" style={{ minWidth: '14px', minHeight: '14px' }}></div>
                <div className="flex-1 h-3 bg-Skriuw-border rounded-sm mr-2" style={{ minHeight: '12px' }}></div>
                <div className="w-5 h-3 bg-Skriuw-border/50 rounded-sm mr-2" style={{ minWidth: '20px', minHeight: '12px' }}></div>
              </div>
            </div>
          ))}

          {/* Note skeletons (not in folders) */}
          {[6, 7].map((i) => (
            <div key={i} className="animate-pulse">
              <div
                className="relative flex items-center h-7 rounded-md bg-Skriuw-border/10"
                style={{ paddingLeft: `${8}px`, minHeight: '1.75rem' }}
              >
                <div className="w-3.5 h-3.5 mr-2" style={{ minWidth: '14px' }}></div>
                <div className="flex-1 h-3 bg-Skriuw-border/50 rounded-sm" style={{ minHeight: '12px' }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}