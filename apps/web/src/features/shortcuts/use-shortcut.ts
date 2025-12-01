import { useContext, useEffect, useRef } from "react";

import { ShortcutContext } from "./global-shortcut-provider";
import { ShortcutId } from "./shortcut-definitions";

/**
 * Hook to access the shortcut context.
 * Separated for single responsibility - context access only.
 */
function useShortcutContext() {
    const context = useContext(ShortcutContext);
    if (!context) {
        throw new Error("useShortcut must be used within a ShortcutProvider");
    }
    return context;
}

/**
 * Hook to register a keyboard shortcut.
 * 
 * Separated concerns:
 * - Context access: useShortcutContext()
 * - Handler stability: useRef to avoid re-registration on handler changes
 * - Registration lifecycle: separate effect for registration/unregistration
 */
export function useShortcut(id: ShortcutId, handler: (e: KeyboardEvent) => void) {
    const context = useShortcutContext();
    const handlerRef = useRef(handler);

    // Keep handler ref up to date without causing re-registration
    // This separates handler updates from registration lifecycle
    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    // Registration effect - only re-runs when id or keys change
    // Handler changes don't trigger re-registration thanks to ref
    useEffect(() => {
        const shortcutHandler = (e: KeyboardEvent) => handlerRef.current(e);
        context.register(id, shortcutHandler);
        return () => context.unregister(id);
    }, [context, id]);
}

