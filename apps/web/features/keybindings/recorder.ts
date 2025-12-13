import { useState, useEffect } from 'react';
import { normalizeKeybinding } from './parser';

export type TRecordingState = {
    isRecording: boolean;
    recordedKeys: string;
    error?: string;
};

export function useKeybindingRecorder() {
    const [state, setState] = useState<TRecordingState>({
        isRecording: false,
        recordedKeys: ''
    });

    useEffect(() => {
        if (!state.isRecording) return;

        function handleKeyDown(event: KeyboardEvent) {
            event.preventDefault();
            event.stopPropagation();

            if (event.key === 'Escape') {
                setState({ isRecording: false, recordedKeys: '' });
                return;
            }

            const parts: string[] = [];
            if (event.ctrlKey) parts.push('Ctrl');
            if (event.shiftKey) parts.push('Shift');
            if (event.altKey) parts.push('Alt');
            if (event.metaKey) parts.push('Meta');

            if (!['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
                parts.push(event.key);
                const keybinding = normalizeKeybinding(parts.join('+'));
                setState({ isRecording: false, recordedKeys: keybinding });
            }
        }

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [state.isRecording]);

    function startRecording() {
        setState({ isRecording: true, recordedKeys: '', error: undefined });
    }

    function stopRecording() {
        setState(prev => ({ ...prev, isRecording: false }));
    }

    function reset() {
        setState({ isRecording: false, recordedKeys: '' });
    }

    return { ...state, startRecording, stopRecording, reset };
}
