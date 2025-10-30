/**
 * DockManager
 *
 * Minimal cross-platform abstraction for dock/taskbar behaviors.
 * - On Linux/Windows/Web: methods are intentional no-ops (zero overhead).
 * - On macOS desktop builds: can be wired to a real dock badge via Tauri.
 *
 * Design goals:
 * - Keep UI code simple and platform-agnostic.
 * - Avoid bundling platform libs on the web path (no imports here).
 * - Provide a stable surface area; implementation can be extended per-platform later.
 */
export const DockManager = {
    /**
     * Set the application dock badge count.
     *
     * Notes:
     * - No-op on non-macOS and in the browser.
     * - Safe to call frequently; does nothing if unsupported.
     * - To implement on macOS desktop: create a Tauri-side command and call it here.
     */
    setBadge(count: number) {
        // No-op for web; Tauri implementation can hook here if needed
        void count;
    },
};


