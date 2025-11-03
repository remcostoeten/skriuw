"use client";

import type { Note } from '@/api/db/schema';
import { ErrorBoundary } from '@/components/error-boundary';
import { SyncStatus } from '@/components/loading-states';
import MentionList from '@/components/mention-list';
import { useUpdateNote } from '@/modules/notes/api/mutations/update';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import tippy from 'tippy.js';
import { useErrorHandler } from '../../hooks/use-error-handler';

/**
 * ToDo: create a global keyboard event listener HoC
 */

type Props = {
  note: Note;
  onNoteSelect?: (noteId: string) => void;
};

function NoteEditorComponent({ note, onNoteSelect }: Props) {
  const [title, setTitle] = useState(note.title);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | undefined>(undefined);

  const { updateNote, isLoading: isUpdatingNote } = useUpdateNote();
  const { notes } = useGetNotes();

  const { handleError } = useErrorHandler();

  const isMutating = isUpdatingNote;

  const withSyncTracking = useCallback(async <T,>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T | undefined> => {
    setIsSyncing(true);
    try {
      const result = await operation();
      setLastSync(new Date());
      return result;
    } catch (error) {
      handleError(error, operationName);
      return undefined;
    } finally {
      setIsSyncing(false);
    }
  }, [handleError]);

  // Silent save function that doesn't update UI state
  const silentSaveRef = useRef<((content: string) => Promise<void>) | null>(null);

  const silentSave = useCallback(async (content: string) => {
    try {
      await updateNote(noteIdRef.current, { content });
      setLastSync(new Date());
    } catch (error) {
      handleError(error, 'auto-save note content');
    }
  }, [updateNote, handleError]);

  useEffect(() => {
    silentSaveRef.current = silentSave;
  }, [silentSave]);

  const availableNotes = useMemo(() => (
    notes.filter((n) => n.id !== note.id).map((n) => ({
      id: n.id,
      title: n.title || 'Untitled',
    }))
  ), [notes, note.id]);

  const availableNotesRef = useRef(availableNotes);
  type TaskMention = { id: string; label: string };
  const availableTasksRef = useRef<TaskMention[]>([]);
  const onNoteSelectRef = useRef(onNoteSelect);

  useEffect(() => {
    availableNotesRef.current = availableNotes;
    onNoteSelectRef.current = onNoteSelect;
  }, [availableNotes, onNoteSelect]);

  const handleMentionClick = useCallback((_view: any, _pos: any, event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains('mention')) {
      event.preventDefault();
      const mentionId = target.getAttribute('data-mention-id');
      if (mentionId && onNoteSelectRef.current) {
        onNoteSelectRef.current(mentionId);
      }
      return true;
    }
    return false;
  }, []);

  const noteContentRef = useRef(note.content);
  const noteIdRef = useRef(note.id);
  const isEditorFocusedRef = useRef(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    noteContentRef.current = note.content;
    noteIdRef.current = note.id;
  }, [note.content, note.id]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: 'Start writing... Type @ to link notes, ## for headings, **bold**, *italic*, - for lists...',
      }),
      Typography,
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: {
          items: ({ query }): any[] => {
            return availableNotesRef.current
              .filter((note) =>
                note.title.toLowerCase().includes(query.toLowerCase())
              )
              .slice(0, 5);
          },
          render: () => {
            let component: any;
            let popup: any[];
            return {
              onStart: (props: any) => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });
                if (props.clientRect) {
                  popup = tippy('body', {
                    getReferenceClientRect: props.clientRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                    arrow: false,
                    theme: 'menu',
                    maxWidth: 'none',
                    offset: [0, 6],
                    zIndex: 9999,
                  });
                }
              },
              onUpdate: (props: any) => {
                component.updateProps(props);
                if (props.clientRect) {
                  popup[0].setProps({
                    getReferenceClientRect: props.clientRect,
                  });
                }
              },
              onKeyDown: (props: any) => {
                if (props.event.key === 'Escape') {
                  popup[0].hide();
                  return true;
                }
                return component.ref?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                popup[0].destroy();
                component.destroy();
              },
            };
          },
        },
        renderHTML({ options, node }) {
          return [
            'a',
            {
              ...options.HTMLAttributes,
              'data-mention-id': node.attrs.id,
              'href': '#',
              'class': 'mention',
            },
            `@${node.attrs.label ?? node.attrs.id}`,
          ];
        },
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'task-mention',
        },
        suggestion: {
          char: '$',
          items: ({ query }): any[] => {
            const q = (query || '').toLowerCase();
            const isFuzzyMatch = (text: string, pattern: string): number => {
              if (!pattern) return 0;
              let ti = 0;
              let score = 0;
              const tl = text.length;
              for (let pi = 0; pi < pattern.length; pi++) {
                const ch = pattern[pi];
                let found = false;
                while (ti < tl) {
                  if (text[ti].toLowerCase() === ch) {
                    score += 1 + (ti > 0 && text[ti - 1].toLowerCase() === (pattern[pi - 1] || '') ? 1 : 0);
                    ti++;
                    found = true;
                    break;
                  }
                  ti++;
                }
                if (!found) return -1;
              }
              return score - Math.max(0, tl - pattern.length) * 0.01;
            };
            const ranked = availableTasksRef.current
              .map((t: TaskMention) => ({ t, s: isFuzzyMatch(t.label, q) }))
              .filter(({ s }: { s: number }) => s >= 0)
              .sort((a: { s: number }, b: { s: number }) => b.s - a.s)
              .slice(0, 8)
              .map(({ t }: { t: TaskMention }) => t);
            return ranked;
          },
          render: () => {
            let component: any;
            let popup: any[];
            return {
              onStart: (props: any) => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });
                if (props.clientRect) {
                  popup = tippy('body', {
                    getReferenceClientRect: props.clientRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                    arrow: false,
                    theme: 'menu',
                    maxWidth: 'none',
                    offset: [0, 6],
                    zIndex: 9999,
                  });
                }
              },
              onUpdate: (props: any) => {
                component.updateProps(props);
                if (props.clientRect) {
                  popup[0].setProps({
                    getReferenceClientRect: props.clientRect,
                  });
                }
              },
              onKeyDown: (props: any) => {
                if (props.event.key === 'Escape') {
                  popup[0].hide();
                  return true;
                }
                return component.ref?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                popup[0].destroy();
                component.destroy();
              },
            };
          },
        },
        renderHTML({ options, node }) {
          const short = node.attrs.label ?? node.attrs.id;
          const title = `Task ${short}`;
          return [
            'a',
            {
              ...options.HTMLAttributes,
              'data-task-id': node.attrs.id,
              'href': `#task-${node.attrs.id}`,
              'class': 'task-mention',
              'title': title,
              'aria-label': title,
            },
            `$${short}`,
          ];
        },
      }),
    ],
    content: note.content,
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none min-h-[300px] text-foreground [&_*]:text-foreground',
      },
      handleClick: handleMentionClick,
    },
    onFocus: () => {
      isEditorFocusedRef.current = true;
    },
    onBlur: () => {
      isEditorFocusedRef.current = false;

      // Clear inactivity timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }

      // Save immediately on blur if content changed
      if (editorRef.current && silentSaveRef.current) {
        const html = editorRef.current.getHTML();
        if (html !== noteContentRef.current) {
          silentSaveRef.current(html);
          noteContentRef.current = html;
        }
      }
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();

      // Clear existing inactivity timer
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }

      // Save after inactivity period (3 seconds) when editor is focused
      if (isEditorFocusedRef.current && html !== noteContentRef.current && silentSaveRef.current) {
        inactivityTimerRef.current = setTimeout(() => {
          if (silentSaveRef.current) {
            silentSaveRef.current(html);
            noteContentRef.current = html;
          }
        }, 3000); // 3 seconds of inactivity
      }
    },
  }, [note.id]);

  // Store editor reference
  useEffect(() => {
    if (editor) {
      editorRef.current = editor;
    }
  }, [editor]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);

  // Track previous note to avoid unnecessary updates
  const prevNoteRef = useRef<Note | null>(null);

  useEffect(() => {
    // Only update if note ID changed or if content/title actually changed
    const noteChanged = !prevNoteRef.current ||
      prevNoteRef.current.id !== note.id ||
      prevNoteRef.current.content !== note.content ||
      prevNoteRef.current.title !== note.title;

    if (noteChanged) {
      setTitle(note.title);
      if (editor && note.content !== editor.getHTML()) {
        // prevent triggering onUpdate when setting from outside
        // @ts-expect-error tiptap allows boolean second param to suppress update
        editor.commands.setContent(note.content, false);
      }
      prevNoteRef.current = note;
    }
  }, [note.id, note.content, note.title, editor]);

  const handleTitleChange = async (newTitle: string) => {
    setTitle(newTitle);
    await withSyncTracking(
      () => updateNote(note.id, { title: newTitle }),
      'update note title'
    );
  };


  return (
    <ErrorBoundary
      fallback={({ error, retry }) => (
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center">
            <h3 className="text-lg font-medium text-foreground mb-2">Editor Error</h3>
            <p className="text-muted-foreground mb-4">
              {error?.message || 'Something went wrong while loading the note editor.'}
            </p>
            <button
              onClick={retry}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    >
      <div className="h-full overflow-y-auto scrollbar-content">
        <div className="max-w-4xl mx-auto px-8 sm:px-12 lg:px-16 py-12 sm:py-16">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full text-4xl font-bold bg-transparent border-none outline-none mb-2 text-foreground placeholder:text-muted-foreground/30"
            placeholder="Untitled"
          />

          <div className="flex items-center justify-between mb-8">
            <div className="text-xs text-muted-foreground">
              {new Date(note.updatedAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>

            <SyncStatus
              isLoading={isSyncing}
              isOnline={navigator.onLine}
              lastSync={lastSync}
              showDetails={true}
            />
          </div>

          <div className="mb-8">
            {editor && (
              <EditorContent editor={editor} />
            )}


          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

const MemoizedNoteEditor = memo(NoteEditorComponent, (prevProps, nextProps) => {
  return (
    prevProps.note.id === nextProps.note.id &&
    prevProps.note.content === nextProps.note.content &&
    prevProps.note.title === nextProps.note.title &&
    prevProps.onNoteSelect === nextProps.onNoteSelect
  );
});

export const NoteEditor = MemoizedNoteEditor;
export default MemoizedNoteEditor;

