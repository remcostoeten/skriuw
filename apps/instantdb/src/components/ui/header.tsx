'use client';

import React, { useEffect, useState } from 'react';
import { Button } from './button';
import { WindowManager } from '@/utils/native-utils';
import { Minus, Maximize2, X } from 'lucide-react';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  controlsAlign?: 'left' | 'right';
}

function useIsTauri(): boolean {
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    // Check for Tauri in multiple ways
    const checkTauri = () => {
      if (typeof window === 'undefined') return false;

      const win = window as any;

      // Check for Tauri 2.0 internals (always present in Tauri 2.0)
      if (win.__TAURI_INTERNALS__) return true;

      // Check for Tauri global (may require withGlobalTauri config)
      if (win.__TAURI__) return true;

      // Check user agent - Tauri apps have a specific user agent
      if (typeof navigator !== 'undefined') {
        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('tauri')) return true;
      }

      // Try to detect by checking if WindowManager methods would work
      // This is a fallback that checks for Tauri runtime capabilities
      try {
        // Check for Tauri metadata or other indicators
        if (typeof win.__TAURI_METADATA__ !== 'undefined') {
          return true;
        }
        // Check if we're in a Tauri context by looking for IPC capabilities
        if (typeof win.__TAURI_IPC__ !== 'undefined') {
          return true;
        }
      } catch {
        // Ignore errors
      }

      return false;
    };

    // Check immediately
    const initialCheck = checkTauri();
    setIsTauri(initialCheck);

    // If not detected initially, check multiple times with increasing delays
    // This handles cases where Tauri loads asynchronously
    if (!initialCheck) {
      const timeouts: NodeJS.Timeout[] = [];

      // Check at 50ms, 100ms, 200ms, 500ms, 1000ms
      [50, 100, 200, 500, 1000].forEach((delay) => {
        const timeout = setTimeout(() => {
          const result = checkTauri();
          if (result) {
            setIsTauri(true);
            // Clear remaining timeouts once we detect Tauri
            timeouts.forEach((t) => clearTimeout(t));
          }
        }, delay);
        timeouts.push(timeout);
      });

      return () => {
        timeouts.forEach((t) => clearTimeout(t));
      };
    }

    return undefined;
  }, []);

  return isTauri;
}

export function Header({
  title,
  subtitle,
  actions,
  className = '',
  controlsAlign = 'right'
}: HeaderProps) {
  const isDesktop = useIsTauri();
  const controlsOnLeft = controlsAlign === 'left';

  const renderActions = () => (
    <div className="flex gap-[4px]">
      {actions || (
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
              <Button
                href="https://go.haptic.md/github"
                variant="static"
                size="static"
              >
                Star on Github
              </Button>
              <Button
                href="https://go.haptic.md/download"
                variant="primary"
                size="static"
              >
                Download
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <header
      data-tauri-drag-region
      className={`items-center border-b flex justify-between gap-3 absolute w-full h-8 top-0 bg-background border-border pt-0 pr-[6px] pb-0 z-[40] ${className}`}
    >
      {controlsOnLeft && renderActions()}

      <div className="flex items-center gap-4 flex-1">
        {title && (
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
        )}

        {!title && (
          <p
            className="outline-solid pointer-events-none text-foreground/85 text-[14px] leading-[20px] outline-black/0 outline-offset-[2px] outline-[2px]"
            style={{ textDecoration: 'none solid rgba(3, 7, 18, 0.85)' }}
          >
            Skriuw InstantDB
            {/* Empty paragraph from original design */}
          </p>
        )}
      </div>

      {!controlsOnLeft && renderActions()}
    </header>
  );
}
