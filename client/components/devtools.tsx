import React, { useState } from 'react';
import { Monitor, Smartphone, Settings, X, ChevronRight } from 'lucide-react';
import { useUserPreferences } from '../shared/data/settings/use-feature-flags';

/**
 * DevTools panel - Development-only tools and toggles
 * Provides utilities for development like disabling responsive behavior
 */
export function DevTools() {
  const [isOpen, setIsOpen] = useState(false);
  const { settings, setPreference } = useUserPreferences();

  const disableResponsive = settings.disableResponsive || false;

  const toggleResponsive = () => {
    setPreference('disableResponsive', !disableResponsive);
  };

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <>
      {/* DevTools Toggle Button */}
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 bg-Skriuw-darker text-Skriuw-text rounded-lg shadow-lg hover:bg-Skriuw-border/30 transition-colors text-sm font-mono border border-Skriuw-border"
          title="Development Tools"
        >
          <Settings className="w-4 h-4" />
          <span className="hidden sm:inline">Dev</span>
          {isOpen && <X className="w-4 h-4" />}
        </button>
      </div>

      {/* DevTools Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="fixed bottom-20 right-4 w-80 bg-Skriuw-darker rounded-lg shadow-xl border border-Skriuw-border z-50">
            <div className="p-4 border-b border-Skriuw-border">
              <h3 className="font-semibold text-Skriuw-text flex items-center gap-2">
                <Settings className="w-5 h-5 text-Skriuw-icon" />
                Development Tools
              </h3>
            </div>

            <div className="p-4 space-y-4">
              {/* Responsive Control */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-Skriuw-icon" />
                    <span className="text-sm font-medium text-Skriuw-text">
                      Responsive Behavior
                    </span>
                  </div>
                  <button
                    onClick={toggleResponsive}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full border border-Skriuw-border transition-colors ${
                      disableResponsive ? 'bg-Skriuw-border' : 'bg-Skriuw-dark'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-Skriuw-text transition-transform ${
                        disableResponsive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <p className="text-xs text-Skriuw-text-subtle">
                  {disableResponsive
                    ? 'Responsive behavior disabled - UI forced to desktop mode'
                    : 'Responsive behavior enabled - UI adapts to screen size'
                  }
                </p>

                {disableResponsive && (
                  <div className="flex items-center gap-2 p-2 bg-Skriuw-border/30 rounded text-xs text-Skriuw-text">
                    <Smartphone className="w-3 h-3 text-Skriuw-icon" />
                    <span>Desktop mode forced - restart recommended if changing themes</span>
                  </div>
                )}
              </div>

              {/* Additional Dev Tools - Placeholder for future expansion */}
              <div className="border-t border-Skriuw-border pt-4">
                <h4 className="text-sm font-medium text-Skriuw-text mb-3">
                  Quick Actions
                </h4>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      console.log('Current settings:', settings);
                      console.log('Breakpoint info:', {
                        width: window.innerWidth,
                        height: window.innerHeight,
                        isMobile: window.innerWidth < 768,
                        isTablet: window.innerWidth >= 768 && window.innerWidth < 1024,
                        isDesktop: window.innerWidth >= 1024,
                      });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-Skriuw-dark text-Skriuw-text rounded border border-Skriuw-border hover:bg-Skriuw-border/30 transition-colors text-left"
                  >
                    <ChevronRight className="w-3 h-3 text-Skriuw-icon" />
                    Log Screen Info
                  </button>

                  <button
                    onClick={() => {
                      const newUrl = window.location.href;
                      navigator.clipboard.writeText(newUrl);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-Skriuw-dark text-Skriuw-text rounded border border-Skriuw-border hover:bg-Skriuw-border/30 transition-colors text-left"
                  >
                    <ChevronRight className="w-3 h-3 text-Skriuw-icon" />
                    Copy Current URL
                  </button>
                </div>
              </div>

              {/* Status Info */}
              <div className="border-t border-Skriuw-border pt-4">
                <h4 className="text-sm font-medium text-Skriuw-text mb-2">
                  Current Status
                </h4>
                <div className="space-y-1 text-xs text-Skriuw-text-subtle font-mono">
                  <div>Env: {process.env.NODE_ENV}</div>
                  <div>Width: {typeof window !== 'undefined' ? window.innerWidth : 'N/A'}px</div>
                  <div>Responsive: {disableResponsive ? 'DISABLED' : 'ENABLED'}</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
