import { useState, useEffect } from 'react';
import { X, RotateCcw, Keyboard } from 'lucide-react';
import { ShortcutId, shortcutDefinitions } from '../shortcut-definitions';
import { ShortcutRecorder } from './shortcut-recorder';
import { getShortcutStorage } from '../api';
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
    const storage = getShortcutStorage();

    // Load shortcuts on mount
    useEffect(() => {
        loadShortcuts();
    }, []);

    const loadShortcuts = async () => {
        const customShortcuts = await storage.getCustomShortcuts();

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
        await storage.saveCustomShortcut(id, keys);
        await loadShortcuts();
        setRecordingId(null);

        // Dispatch custom event to notify the app of shortcut changes
        window.dispatchEvent(new CustomEvent('shortcuts-updated'));
    };

    const handleResetShortcut = async (id: ShortcutId) => {
        await storage.resetShortcut(id);
        await loadShortcuts();

        // Dispatch custom event to notify the app of shortcut changes
        window.dispatchEvent(new CustomEvent('shortcuts-updated'));
    };

    const handleResetAll = async () => {
        if (confirm('Reset all shortcuts to defaults?')) {
            await storage.resetAllShortcuts();
            await loadShortcuts();

            // Dispatch custom event to notify the app of shortcut changes
            window.dispatchEvent(new CustomEvent('shortcuts-updated'));
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Sidebar */}
            <div className="fixed top-0 right-0 h-full w-full sm:w-96 bg-Skriuw-dark border-l border-Skriuw-border z-50 flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-Skriuw-border">
                    <div className="flex items-center gap-2">
                        <Keyboard className="w-5 h-5 text-Skriuw-icon" />
                        <h2 className="text-lg font-semibold text-Skriuw-text">
                            Keyboard Shortcuts
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md hover:bg-Skriuw-border/50 transition-colors"
                        aria-label="Close shortcuts panel"
                    >
                        <X className="w-5 h-5 text-Skriuw-icon" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <p className="text-sm text-Skriuw-text/70">
                        Click on a shortcut to record a new key combination. You can use
                        single keys or modifier combinations (Ctrl, Meta, Shift, Alt).
                    </p>

                    {shortcuts.map((shortcut) => (
                        <div
                            key={shortcut.id}
                            className="p-3 rounded-lg border border-Skriuw-border bg-Skriuw-dark/50 space-y-2"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-medium text-Skriuw-text truncate">
                                        {shortcut.description}
                                    </h3>
                                    <p className="text-xs text-Skriuw-text/50 mt-0.5">
                                        {shortcut.id}
                                    </p>
                                </div>
                                {shortcut.isCustomized && (
                                    <button
                                        onClick={() => handleResetShortcut(shortcut.id)}
                                        className="p-1.5 rounded-md hover:bg-Skriuw-border/50 transition-colors shrink-0"
                                        aria-label="Reset to default"
                                        title="Reset to default"
                                    >
                                        <RotateCcw className="w-4 h-4 text-Skriuw-icon" />
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
                <div className="p-4 border-t border-Skriuw-border">
                    <button
                        onClick={handleResetAll}
                        className="w-full px-4 py-2 rounded-md border border-Skriuw-border hover:bg-Skriuw-border/30 transition-colors text-sm text-Skriuw-text"
                    >
                        Reset All to Defaults
                    </button>
                </div>
            </div>
        </>
    );
}

