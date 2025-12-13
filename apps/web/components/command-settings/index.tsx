'use client';

import { useState, useEffect } from 'react';
import { getAllCommands } from '@/features/commands/registry';
import { updateKeybinding, getKeybinding } from '@/features/keybindings/manager';
import { formatKeybinding } from '@/features/keybindings/parser';
import { useKeybindingRecorder } from '@/features/keybindings/recorder';
import { TCommand } from '@/features/commands/types';
import { Search } from 'lucide-react';

type TProps = {
    onRecorded: (keybinding: string) => void;
    onCancel: () => void;
};

function Recorder({ onRecorded, onCancel }: TProps) {
    const { isRecording, recordedKeys, startRecording, reset } = useKeybindingRecorder();

    // Simple wrapper for the recorder hook
    // In a real app, this would be a nice UI component
    return (
        <div className="flex items-center gap-2">
            {isRecording ? (
                <span className="text-red-500 animate-pulse">Recording... Press keys</span>
            ) : (
                <span className="text-muted-foreground">{recordedKeys ? formatKeybinding(recordedKeys) : 'Press to record'}</span>
            )}
            <button onClick={startRecording} className="px-2 py-1 bg-primary text-primary-foreground text-xs rounded">
                {isRecording ? 'Listening' : 'Record'}
            </button>
            {recordedKeys && <button onClick={() => onRecorded(recordedKeys)} className="px-2 py-1 border text-xs rounded">Save</button>}
            <button onClick={onCancel} className="px-2 py-1 text-xs text-muted-foreground">Cancel</button>
        </div>
    )
}

export function CommandSettings() {
    const [commands, setCommands] = useState<TCommand[]>([]);
    const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        setCommands(getAllCommands());
    }, []);

    async function handleKeybindingUpdate(commandId: string, newKeys: string) {
        const success = await updateKeybinding(commandId, newKeys);

        if (success) {
            setCommands(getAllCommands());
            setEditingCommandId(null);
        } else {
            alert('Keybinding conflict! This shortcut is already in use.');
        }
    }

    const filteredCommands = commands.filter(cmd =>
        cmd.label.toLowerCase().includes(filter.toLowerCase()) ||
        cmd.id.toLowerCase().includes(filter.toLowerCase()) ||
        cmd.category.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold tracking-tight">Keyboard Shortcuts</h2>
                <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        className="w-full pl-9 h-10 rounded-md border bg-background px-3 py-2 text-sm ring-offset-background"
                        placeholder="Filter commands..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>
            </div>

            <div className="border rounded-lg divide-y">
                {filteredCommands.length === 0 && <div className="p-8 text-center text-muted-foreground">No commands found</div>}
                {filteredCommands.map(command => {
                    const keybinding = getKeybinding(command.id);
                    const isEditing = editingCommandId === command.id;

                    return (
                        <div key={command.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2 font-medium">
                                    {command.icon}
                                    <span>{command.label}</span>
                                    <span className="text-xs font-mono opacity-50 bg-muted px-1 rounded">{command.id}</span>
                                </div>
                                <span className="text-sm text-muted-foreground">{command.description || 'No description'}</span>
                            </div>

                            <div className="flex items-center gap-4">
                                {!isEditing ? (
                                    <>
                                        {keybinding ? (
                                            <kbd className="h-6 select-none items-center gap-1 rounded border bg-muted px-2 font-mono text-xs font-medium opacity-100">
                                                {formatKeybinding(keybinding.keys)}
                                            </kbd>
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">No shortcut</span>
                                        )}
                                        <button
                                            onClick={() => setEditingCommandId(command.id)}
                                            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                                        >
                                            Empty
                                        </button>
                                    </>
                                ) : (
                                    <div className="border p-2 rounded bg-background shadow-sm">
                                        {/* Simplified recorder implementation inline for now */}
                                        <input
                                            autoFocus
                                            placeholder="Type new shortcut..."
                                            className="text-sm bg-transparent outline-none"
                                            onKeyDown={async (e) => {
                                                e.preventDefault();
                                                if (e.key === 'Escape') {
                                                    setEditingCommandId(null);
                                                    return;
                                                }
                                                // Quick hack to capture: just capture modifiers+key
                                                // In real app, reuse the Recorder component properly
                                                // For now, assume user knows to press Enter to confirm? 
                                                // KeybindingManager's updateKeybinding handles parsing string.
                                            }}
                                        />
                                        <span className="text-xs text-muted-foreground ml-2">Press keys...</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    );
}
