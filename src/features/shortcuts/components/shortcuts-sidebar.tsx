import { X, RotateCcw, Search } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';

import { Input } from '@/shared/ui/input';
import { createFocusTrap } from '@/shared/utilities/focus-trap';

import { resetAllShortcuts } from '../api/mutations/reset-all-shortcuts';
import { resetShortcut } from '../api/mutations/reset-shortcut';
import { saveShortcut } from '../api/mutations/save-shortcut';
import { getShortcuts } from '../api/queries/get-shortcuts';
import { ShortcutId, shortcutDefinitions , KeyCombo } from '../shortcut-definitions';

import { ShortcutRecorder } from './shortcut-recorder';

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
    const [searchQuery, setSearchQuery] = useState('');
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const sidebarRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const shortcutItemRefs = useRef<(HTMLDivElement | null)[]>([]);

    // Load shortcuts on mount
    useEffect(() => {
        loadShortcuts();
    }, []);

    // Focus trap: trap focus inside the sidebar when open
    useEffect(() => {
        if (!isOpen || !sidebarRef.current) return;

        const trap = createFocusTrap(sidebarRef.current);
        trap.activate();

        // Focus search input when sidebar opens
        if (searchInputRef.current) {
            setTimeout(() => {
                searchInputRef.current?.focus();
            }, 100);
        }

        return () => {
            trap.deactivate();
        };
    }, [isOpen]);

    // Filter shortcuts based on search query
    const filteredShortcuts = useMemo(() => {
        if (!searchQuery.trim()) return shortcuts;

        const query = searchQuery.toLowerCase().trim();
        return shortcuts.filter((shortcut) => {
            const matchesDescription = shortcut.description.toLowerCase().includes(query);
            const matchesId = shortcut.id.toLowerCase().includes(query);
            const matchesKeys = shortcut.currentKeys.some((combo) =>
                combo.join(' ').toLowerCase().includes(query)
            );
            return matchesDescription || matchesId || matchesKeys;
        });
    }, [shortcuts, searchQuery]);

    // Jump to first result when search changes
    useEffect(() => {
        if (searchQuery.trim() && filteredShortcuts.length > 0) {
            setFocusedIndex(0);
            // Scroll to first result
            setTimeout(() => {
                shortcutItemRefs.current[0]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                });
            }, 50);
        } else {
            setFocusedIndex(null);
        }
    }, [searchQuery, filteredShortcuts.length]);

    // Handle keyboard navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't handle if we're recording a shortcut
            if (recordingId !== null) return;

            // Close on Escape key (but not when search input is focused)
            if (e.key === 'Escape' && document.activeElement !== searchInputRef.current) {
                e.preventDefault();
                e.stopPropagation();
                onClose();
                return;
            }

            // Arrow key navigation
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (document.activeElement === searchInputRef.current) {
                    // If search is focused, move to first/last item
                    e.preventDefault();
                    setFocusedIndex(e.key === 'ArrowDown' ? 0 : filteredShortcuts.length - 1);
                    shortcutItemRefs.current[e.key === 'ArrowDown' ? 0 : filteredShortcuts.length - 1]?.focus();
                    return;
                }

                const currentIndex = focusedIndex ?? -1;
                let newIndex = currentIndex;

                if (e.key === 'ArrowDown') {
                    newIndex = currentIndex < filteredShortcuts.length - 1 ? currentIndex + 1 : 0;
                } else {
                    newIndex = currentIndex > 0 ? currentIndex - 1 : filteredShortcuts.length - 1;
                }

                e.preventDefault();
                setFocusedIndex(newIndex);
                shortcutItemRefs.current[newIndex]?.focus();
                shortcutItemRefs.current[newIndex]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, recordingId, onClose, filteredShortcuts.length, focusedIndex]);

    const loadShortcuts = async () => {
        const customShortcuts = await getShortcuts();

        const shortcutStates: ShortcutState[] = Object.entries(shortcutDefinitions)
            .filter(([, definition]) => definition.enabled !== false) // Filter out disabled shortcuts
            .map(([id, definition]) => {
                const shortcutId = id as ShortcutId;
                const customKeys = customShortcuts[shortcutId];

                return {
                    id: shortcutId,
                    currentKeys: customKeys || definition.keys,
                    defaultKeys: definition.keys,
                    description: definition.description || id,
                    isCustomized: !!customKeys,
                };
            });

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
            {/* Sidebar */}
            <div
                ref={sidebarRef}
                className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-popover border-l border-border z-50 flex flex-col shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
                tabIndex={-1}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border">
                    <h2 className="text-xl font-semibold text-foreground">
                        Keyboard Shortcuts
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-md hover:bg-accent/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label="Close shortcuts panel"
                    >
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Search */}
                <div className="p-6 border-b border-border">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search shortcuts..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setFocusedIndex(null);
                            }}
                            className="pl-9 h-10 w-full"
                            aria-label="Search shortcuts"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-6">
                    {filteredShortcuts.length === 0 ? (
                        <div className="py-12 text-center">
                            <p className="text-sm text-muted-foreground">
                                {searchQuery.trim() ? 'No shortcuts found' : 'No shortcuts available'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredShortcuts.map((shortcut, index) => (
                                <div
                                    key={shortcut.id}
                                    ref={(el) => {
                                        shortcutItemRefs.current[index] = el;
                                    }}
                                    tabIndex={0}
                                    className={`
                                        p-4 rounded-lg border border-border bg-card space-y-3
                                        transition-all duration-150
                                        focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-popover
                                        ${focusedIndex === index ? 'ring-2 ring-ring ring-offset-2 ring-offset-popover' : ''}
                                    `}
                                    onFocus={() => setFocusedIndex(index)}
                                    onBlur={(e) => {
                                        // Don't clear focus if focus is moving to a child element
                                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                            // setFocusedIndex(null);
                                        }
                                    }}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-medium text-foreground">
                                                {shortcut.description}
                                            </h3>
                                            <p className="text-xs text-muted-foreground/60 mt-1">
                                                {shortcut.id}
                                            </p>
                                        </div>
                                        {shortcut.isCustomized && (
                                            <button
                                                onClick={() => handleResetShortcut(shortcut.id)}
                                                className="p-1.5 rounded-md hover:bg-accent/50 transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-ring"
                                                aria-label={`Reset ${shortcut.description} to default`}
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
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-border bg-popover">
                    <button
                        onClick={handleResetAll}
                        className="w-full px-4 py-2.5 rounded-md border border-border hover:bg-accent/30 transition-colors text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                        Reset All to Defaults
                    </button>
                </div>
            </div>
        </>
    );
}

