/**
 * React component for seeding the keyboard shortcuts note
 * Add this temporarily to your app, click the button, then remove it
 */

'use client';

import { useState } from 'react';
import { seedKeyboardShortcutsNote } from './seed';

export function SeedShortcutsNoteButton() {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [noteId, setNoteId] = useState<string | null>(null);

    const handleSeed = async () => {
        try {
            setStatus('loading');
            const result = await seedKeyboardShortcutsNote({
                pinned: false,
                position: 0,
            });
            setNoteId(result.id);
            setStatus('success');
        } catch (error) {
            console.error(error);
            setStatus('error');
        }
    };

    return (
        <div className="fixed bottom-4 right-4 z-50 p-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold mb-2">Seed Database</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Create the "Keyboard Shortcuts" documentation note
            </p>

            <button
                onClick={handleSeed}
                disabled={status === 'loading' || status === 'success'}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed w-full"
            >
                {status === 'idle' && '🚀 Create Note'}
                {status === 'loading' && '⏳ Creating...'}
                {status === 'success' && '✅ Created!'}
                {status === 'error' && '❌ Error - Retry'}
            </button>

            {status === 'success' && noteId && (
                <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                    <p className="text-sm text-green-800 dark:text-green-200">
                        ✅ Note created successfully!
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-mono break-all">
                        ID: {noteId}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                        You can now remove this component from your app.
                    </p>
                </div>
            )}

            {status === 'error' && (
                <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                    <p className="text-sm text-red-800 dark:text-red-200">
                        ❌ Failed to create note. Check console for details.
                    </p>
                </div>
            )}
        </div>
    );
}

