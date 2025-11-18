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
          className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-lg shadow-lg hover:bg-gray-800 transition-colors text-sm font-mono border border-gray-700"
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
          <div className="fixed bottom-20 right-4 w-80 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-500" />
                Development Tools
              </h3>
            </div>

            <div className="p-4 space-y-4">
              {/* Responsive Control */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Responsive Behavior
                    </span>
                  </div>
                  <button
                    onClick={toggleResponsive}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      disableResponsive
                        ? 'bg-blue-600'
                        : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        disableResponsive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {disableResponsive
                    ? 'Responsive behavior disabled - UI forced to desktop mode'
                    : 'Responsive behavior enabled - UI adapts to screen size'
                  }
                </p>

                {disableResponsive && (
                  <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs text-yellow-800 dark:text-yellow-200">
                    <Smartphone className="w-3 h-3" />
                    <span>Desktop mode forced - restart recommended if changing themes</span>
                  </div>
                )}
              </div>

              {/* Additional Dev Tools - Placeholder for future expansion */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
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
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <ChevronRight className="w-3 h-3" />
                    Log Screen Info
                  </button>

                  <button
                    onClick={() => {
                      const newUrl = window.location.href;
                      navigator.clipboard.writeText(newUrl);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                  >
                    <ChevronRight className="w-3 h-3" />
                    Copy Current URL
                  </button>
                </div>
              </div>

              {/* Status Info */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Current Status
                </h4>
                <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400 font-mono">
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