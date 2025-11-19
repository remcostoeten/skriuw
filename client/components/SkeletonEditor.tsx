import React from 'react';

export function SkeletonEditor() {
  return (
    <div className="flex-1 bg-Skriuw-dark overflow-hidden flex flex-col">
      {/* Editor content skeleton - matches BlockNote editor structure */}
      <div className="flex-1 p-6 space-y-3">
        {/* Title skeleton (H1) */}
        <div className="h-10 w-3/4 bg-Skriuw-border rounded animate-pulse" style={{ minHeight: '2.5rem' }}></div>

        {/* Paragraph line skeletons - realistic text line heights */}
        <div className="space-y-2">
          <div className="h-5 bg-Skriuw-border rounded animate-pulse w-full" style={{ minHeight: '1.25rem' }}></div>
          <div className="h-5 bg-Skriuw-border rounded animate-pulse w-11/12" style={{ minHeight: '1.25rem' }}></div>
          <div className="h-5 bg-Skriuw-border rounded animate-pulse w-4/5" style={{ minHeight: '1.25rem' }}></div>
        </div>

        {/* Subheading skeleton (H2) */}
        <div className="h-8 w-1/2 bg-Skriuw-border rounded animate-pulse mt-6" style={{ minHeight: '2rem' }}></div>

        {/* More paragraph skeletons */}
        <div className="space-y-2">
          <div className="h-5 bg-Skriuw-border rounded animate-pulse w-full" style={{ minHeight: '1.25rem' }}></div>
          <div className="h-5 bg-Skriuw-border rounded animate-pulse w-10/12" style={{ minHeight: '1.25rem' }}></div>
          <div className="h-5 bg-Skriuw-border rounded animate-pulse w-3/4" style={{ minHeight: '1.25rem' }}></div>
        </div>

        {/* Bullet point skeleton */}
        <div className="flex items-start space-x-2">
          <div className="h-5 w-5 bg-Skriuw-border rounded-full animate-pulse mt-0.5" style={{ minHeight: '1.25rem' }}></div>
          <div className="h-5 bg-Skriuw-border rounded animate-pulse w-11/12 flex-1" style={{ minHeight: '1.25rem' }}></div>
        </div>

        {/* Code block skeleton */}
        <div className="h-24 bg-Skriuw-border rounded animate-pulse w-full mt-4 p-3" style={{ minHeight: '6rem' }}>
          <div className="h-4 bg-Skriuw-darker rounded w-1/4 mb-2"></div>
          <div className="space-y-1">
            <div className="h-4 bg-Skriuw-darker rounded w-full"></div>
            <div className="h-4 bg-Skriuw-darker rounded w-5/6"></div>
            <div className="h-4 bg-Skriuw-darker rounded w-4/5"></div>
          </div>
        </div>

        {/* Final paragraph skeletons */}
        <div className="space-y-2">
          <div className="h-5 bg-Skriuw-border rounded animate-pulse w-full" style={{ minHeight: '1.25rem' }}></div>
          <div className="h-5 bg-Skriuw-border rounded animate-pulse w-2/3" style={{ minHeight: '1.25rem' }}></div>
        </div>
      </div>

      {/* Bottom padding to ensure content doesn't jump */}
      <div className="h-20 bg-Skriuw-dark"></div>
    </div>
  );
}