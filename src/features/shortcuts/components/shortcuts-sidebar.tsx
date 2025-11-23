import { useState, useEffect } from 'react';
import { X, RotateCcw, Keyboard } from 'lucide-react';
import { ShortcutId, shortcutDefinitions } from '../shortcut-definitions';
import { ShortcutRecorder } from './shortcut-recorder';
import { getShortcuts } from '../api/queries/get-shortcuts';
import { saveShortcut } from '../api/mutations/save-shortcut';
import { resetShortcut } from '../api/mutations/reset-shortcut';
import { resetAllShortcuts } from '../api/mutations/reset-all-shortcuts';
import { KeyCombo } from '../shortcut-definitions';

type props = {
    isOpen: boolean;
    onClose: () => void;
};

type ShortcutState = {
    id: ShortcutId;
    currentKeys: KeyCombo[];
    defaultKeys: KeyCombo[];
    description: string;
    isCustomized: boolean;
};

/**
 * Sidebar panel for managing keyboard shortcuts
 * Allows users to view, customize, and reset shortcuts
 */
export function ShortcutsSidebar({ isOpen, onClose }: props) {
    const [shortcuts, setShortcuts] = useState<ShortcutState[]>([]);
    const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);

    // Load shortcuts on mount
    useEffect(() => {
        loadShortcuts();
    }, []);

    const loadShortcuts = async () => {
        const customShortcuts = await getShortcuts();

        const shortcutStates: ShortcutState[] = Object.entries(shortcutDefinitions).map(
            ([id, definition]) => {
                const shortcutId = id as ShortcutId;
                const customKeys = customShortcuts[shortcutId];

                return {
                    id: shortcutId,
                    currentKeys: customKeys || definition.keys,
                    defaultKeys: definition.keys,
                    description: definition.description || id,
                    isCustomized: !!customKeys,
                };
            }
        );

        setShortcuts(shortcutStates);
    };

    const handleShortcutChange = async (id: ShortcutId, keys: KeyCombo[]) => {
        await saveShortcut(id, keys);
        await loadShortcuts();
        setRecordingId(null);

        // Dispatch custom event to notify the app of shortcut changes
        window.dispatchEvent(new CustomEvent('shortcuts-updated'));
    };

    const handleResetShortcut = async (id: ShortcutId) => {
        await resetShortcut(id);
        await loadShortcuts();

        // Dispatch custom event to notify the app of shortcut changes
        window.dispatchEvent(new CustomEvent('shortcuts-updated'));
    };

    const handleResetAll = async () => {
        if (confirm('Reset all shortcuts to defaults?')) {
            await resetAllShortcuts();
            await loadShortcuts();

            // Dispatch custom event to notify the app of shortcut changes
            window.dispatchEvent(new CustomEvent('shortcuts-updated'));
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/50 z-40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                onClick={onClose}
            />

            {/* Sidebar */}
            <div
                className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-popover border-l border-border z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
                    }`}
            >
                <div className="flex items-center justify-between p-4 px-6 border-border">
                    <h2 className="text-lg font-semibold text-foreground">
                        Keyboard Shortcuts
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md hover:bg-accent/50 transition-colors"
                        aria-label="Close shortcuts panel"
                    >
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Click on a shortcut to record a new key combination. You can use
                        single keys or modifier combinations (Ctrl, Meta, Shift, Alt).
                    </p>

                    {shortcuts.map((shortcut) => (
                        <div
                            key={shortcut.id}
                            className="p-3 rounded-lg border border-border bg-card space-y-2"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-medium text-foreground truncate">
                                        {shortcut.description}
                                    </h3>
                                    <p className="text-xs text-muted-foreground/50 mt-0.5">
                                        {shortcut.id}
                                    </p>
                                </div>
                                {shortcut.isCustomized && (
                                    <button
                                        onClick={() => handleResetShortcut(shortcut.id)}
                                        className="p-1.5 rounded-md hover:bg-accent/50 transition-colors shrink-0"
                                        aria-label="Reset to default"
                                        title="Reset to default"
                                    >
                                        <RotateCcw className="w-4 h-4 text-muted-foreground" />
                                    </button>
                                )}
                            </div>

                            <ShortcutRecorder
                                value={shortcut.currentKeys}
                                onChange={(keys) => handleShortcutChange(shortcut.id, keys)}
                                isRecording={recordingId === shortcut.id}
                                onStartRecording={() => setRecordingId(shortcut.id)}
                                onStopRecording={() => setRecordingId(null)}
                                onCancel={() => setRecordingId(null)}
                            />
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border">
                    <button
                        onClick={handleResetAll}
                        className="w-full px-4 py-2 rounded-md border border-border hover:bg-accent/30 transition-colors text-sm text-foreground"
                    >
                        Reset All to Defaults
                    </button>
                </div>
            </div>
        </>
    );
}

