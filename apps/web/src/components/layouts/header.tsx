'use client';

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { WindowManager } from '@/utils/native-utils';
import { useIsTauri } from '@/utils/native-utils';
import { Minus, Maximize2, X } from 'lucide-react';

type props = {
  hasActions?: boolean;
  className?: string;
  controlsAlign?: 'left' | 'right';
}

export function Header({
  hasActions = true,
  className = '',
  controlsAlign = 'right'
}: props) {
  const isDesktop = useIsTauri();
  const controlsOnLeft = controlsAlign === 'left';

  const renderActions = () => (
    <div className="flex gap-[4px]">
      {hasActions && (
        <>
          {isDesktop ? (
            <>
              <Button
                onClick={() => WindowManager.minimize()}
                variant="ghost"
                size="icon"
                data-tauri-drag-region="false"
                className="h-8 w-8 rounded-none text-foreground/80 hover:text-foreground transition-colors hover:bg-foreground/10 dark:hover:bg-foreground/20"
                aria-label="Minimize"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => WindowManager.maximize()}
                variant="ghost"
                size="icon"
                data-tauri-drag-region="false"
                className="h-8 w-8 rounded-none text-foreground/80 hover:text-foreground transition-colors hover:bg-foreground/10 dark:hover:bg-foreground/20"
                aria-label="Maximize"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => WindowManager.close()}
                variant="ghost"
                size="icon"
                data-tauri-drag-region="false"
                className="h-8 w-8 rounded-none text-foreground/80 hover:text-white transition-colors hover:bg-[hsl(var(--destructive))]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <a
                href="https://github.com/remcostoeten/skriuw"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
              >
                Star on Github
              </a>
              {/* <Button
                href="https://go.haptic.md/download"
                variant="primary"
                size="static"
              >
                Download
              </Button> */}
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <header
      data-tauri-drag-region
      className={`fixed top-0 left-0 right-0 items-center border-b flex justify-between gap-3 w-full h-8 bg-background border-border pt-0 pr-[6px] pb-0 z-[40] ${className}`}
    >
      {controlsOnLeft && renderActions()}

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <p
            className="text-foreground/85 text-[14px] leading-[20px] whitespace-nowrap"
            style={{ textDecoration: 'none solid rgba(3, 7, 18, 0.85)' }}
          >
            Skriuw Skriuw
          </p>
      </div>

      {!controlsOnLeft && renderActions()}
    </header>
  );
}