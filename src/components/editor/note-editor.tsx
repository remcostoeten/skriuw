"use client";

import type { Note } from '@/api/db/schema';
import { ErrorBoundary } from '@/components/error-boundary';
import { SyncStatus } from '@/components/loading-states';
import MentionList from '@/components/editor/mention-list';
import { useUpdateNote } from '@/modules/notes/api/mutations/update';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Code, Heading2, Italic, Strikethrough, Link2, CheckSquare2 } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import tippy from 'tippy.js';
import { useErrorHandler } from '../../hooks/use-error-handler';
import { useGetAllTasks } from '@/modules/tasks/api/queries/get-all-tasks';
import { useCreateTask } from '@/modules/tasks/api/mutations/create';
import { useUnifiedShortcuts } from '@/hooks/use-unified-shortcuts';
import { TaskPriority } from '@/types';

type Props = {
  note: Note;
  onNoteSelect?: (noteId: string) => void;
};

export function NoteEditor({ note, onNoteSelect }: Props) {
  const [title, setTitle] = useState(note.title);

  const { updateNote, isLoading: isUpdatingNote } = useUpdateNote();
  const { notes } = useGetNotes();
  const { tasks } = useGetAllTasks();
  const { createTask } = useCreateTask();

  const { handleError } = useErrorHandler();

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | undefined>(undefined);

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

  // Timer ref for title debouncing
  const titleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTitleUpdateRef = useRef<number>(0);

  // Silent save function that doesn't update UI state
  const silentSaveRef = useRef<((content: string) => Promise<void>) | null>(null);

  const silentSave = useCallback(async (content: string) => {
    try {
      await updateNote(noteIdRef.current, { content });
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

  // Update available tasks
  useEffect(() => {
    availableTasksRef.current = (tasks || []).map((t) => ({
      id: t.id,
      label: t.content.replace(/<[^>]*>/g, '').slice(0, 50) || 'Untitled Task',
    }));
  }, [tasks]);

  useEffect(() => {
    availableNotesRef.current = availableNotes;
    onNoteSelectRef.current = onNoteSelect;
  }, [availableNotes, onNoteSelect]);

  // Keyboard shortcuts for accessibility will be set up after editor declaration

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

  const formatMarkdownContent = useCallback((pastedText: string): string => {
    // Clean up common markdown formatting issues
    return pastedText
      // Remove excessive empty lines at the start
      .replace(/^\n+/, '')
      // Convert multiple consecutive empty lines to just two
      .replace(/\n{3,}/g, '\n\n')
      // Ensure proper spacing around headers
      .replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2')
      .replace(/(#{1,6}\s[^\n]+)\n([^\n#])/g, '$1\n\n$2')
      // Ensure proper list formatting
      .replace(/\n([-\*+]\s)/g, '\n$1')
      // Clean up bullet points that should be lists
      .replace(/^([^\n\-\*\+]+)\n([-\*+]\s)/gm, '$1\n\n$2')
      // Fix blockquotes
      .replace(/([^\n>])\n(>\s)/g, '$1\n\n$2')
      .replace(/(>\s[^\n]+)\n([^\n>])/g, '$1\n\n$2')
      // Ensure code blocks are properly formatted
      .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const trimmedCode = code.trim();
        return `\`\`\`${lang || ''}\n${trimmedCode}\n\`\`\``;
      })
      .trim();
  }, []);

  const handlePaste = useCallback((view: any, event: ClipboardEvent, slice: any) => {
    const pastedText = event.clipboardData?.getData('text/plain');
    if (!pastedText) return false;

    // Format the pasted markdown content
    const formattedContent = formatMarkdownContent(pastedText);

    // Insert the formatted content using the editor from ref if available
    if (editorRef.current) {
      editorRef.current.chain().focus().insertContent(formattedContent).run();
      return true;
    }

    // Fallback: use view transaction directly
    const { state, dispatch } = view;
    const { from, to } = state.selection;
    const tr = state.tr.replaceWith(from, to, state.schema.text(formattedContent));
    dispatch(tr);

    return true; // Prevent default paste behavior
  }, [formatMarkdownContent]);

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
        emptyEditorClass: 'is-editor-empty',
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
        class: 'tiptap focus:outline-none min-h-[300px] text-foreground [&_*]:text-foreground [&_.is-editor-empty::before]:text-muted-foreground/60 [&_.is-editor-empty::before]:content-[attr(data-placeholder)] [&_.is-editor-empty::before]:pointer-events-none [&_.is-editor-empty::before]:float-left [&_.is-editor-empty::before]:h-0 [&_.is-editor-empty::before]:font-normal',
      },
      handleClick: handleMentionClick,
      handlePaste: handlePaste,
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
  }, [note.id, handlePaste]);

  // Set up focus and blur event listeners
  useEffect(() => {
    if (!editor) return;

    const handleFocus = () => {
      isEditorFocusedRef.current = true;
    };

    const handleBlur = () => {
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
    };

    editor.on('focus', handleFocus);
    editor.on('blur', handleBlur);

    return () => {
      editor.off('focus', handleFocus);
      editor.off('blur', handleBlur);
    };
  }, [editor]);

  // Handle note tagging - insert @ mention at cursor (triggers visual mention dropdown)
  const handleLinkNote = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertContent('@').run();
  }, [editor]);

  // Handle task creation from selected text
  const handleCreateTask = useCallback(async () => {
    if (!editor) return;

    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);

    if (!selectedText.trim()) {
      // If no selection, just insert $ to trigger task mention
      editor.chain().focus().insertContent('$').run();
      return;
    }

    try {
      // Create task with selected text as content
      const result = await createTask({
        content: selectedText,
        position: Date.now(),
        noteId: note.id,
        priority: TaskPriority.MEDIUM,
      });

      if (result?.id) {
        // Replace selected text with task mention using $ syntax
        editor
          .chain()
          .focus()
          .deleteSelection()
          .insertContent(`$${result.id}`)
          .run();
      }
    } catch (error) {
      handleError(error, 'create task from selection');
    }
  }, [editor, note.id, createTask, handleError]);

  // Keyboard shortcuts for accessibility
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd/Ctrl + K for note linking
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        handleLinkNote();
      }
      // Cmd/Ctrl + Shift + T for task creation
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'T') {
        event.preventDefault();
        handleCreateTask();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor, handleLinkNote, handleCreateTask]);

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
      if (titleTimerRef.current) {
        clearTimeout(titleTimerRef.current);
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
      // Reset title update timestamp when switching notes
      const isNewNote = !prevNoteRef.current || prevNoteRef.current.id !== note.id;
      if (isNewNote) {
        lastTitleUpdateRef.current = 0;
      }
      
      setTitle(note.title);
      if (editor && note.content !== editor.getHTML()) {
        // prevent triggering onUpdate when setting from outside
        // @ts-expect-error tiptap allows boolean second param to suppress update
        editor.commands.setContent(note.content, false);
      }
      prevNoteRef.current = note;
    }
  }, [note.id, note.content, note.title, editor]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    
    const now = Date.now();
    const timeSinceLastUpdate = now - lastTitleUpdateRef.current;
    
    // Clear existing timer
    if (titleTimerRef.current) {
      clearTimeout(titleTimerRef.current);
    }

    // If it's been more than 500ms since last update, update immediately
    // This makes the first keystroke (or after a pause) feel instant
    if (timeSinceLastUpdate > 500) {
      lastTitleUpdateRef.current = now;
      withSyncTracking(
        () => updateNote(note.id, { title: newTitle }),
        'update note title'
      );
    } else {
      // For rapid keystrokes, debounce to prevent event storms
      titleTimerRef.current = setTimeout(async () => {
        lastTitleUpdateRef.current = Date.now();
        await withSyncTracking(
          () => updateNote(note.id, { title: newTitle }),
          'update note title'
        );
      }, 300);
    }
  };

  // Editor-specific shortcuts
  const handleBold = useCallback(() => {
    if (editor) {
      editor.chain().focus().toggleBold().run();
    }
  }, [editor]);

  const handleItalic = useCallback(() => {
    if (editor) {
      editor.chain().focus().toggleItalic().run();
    }
  }, [editor]);

  const handleUnderline = useCallback(() => {
    if (editor) {
      editor.chain().focus().toggleUnderline().run();
    }
  }, [editor]);

  const handleInsertLink = useCallback(() => {
    if (editor) {
      const url = window.prompt('Enter URL:');
      if (url) {
        editor.chain().focus().setLink({ href: url }).run();
      }
    }
  }, [editor]);

  // Register editor shortcuts
  useUnifiedShortcuts([
    {
      id: 'editor-bold',
      handler: handleBold
    },
    {
      id: 'editor-italic',
      handler: handleItalic
    },
    {
      id: 'editor-underline',
      handler: handleUnderline
    },
    {
      id: 'editor-insert-link',
      handler: handleInsertLink
    }
  ], {
    context: 'editor',
    enabled: true
  });


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
      <div data-context="editor" className="h-full overflow-y-auto scrollbar-content">
        <div className="max-w-4xl mx-auto px-8 sm:px-12 lg:px-16 py-12 sm:py-16">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full text-4xl font-bold bg-transparent border-none outline-none mb-2 text-foreground placeholder:text-muted-foreground/30"
            placeholder="Untitled"
          />

          
          <div className="relative mb-8">
            {editor && (
              <EditorContent editor={editor} />
            )}

            {/* Timestamp in bottom right */}
            <div className="absolute bottom-2 right-2 text-xs text-muted-foreground/60">
              {new Date(note.updatedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
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
              <>
                <BubbleMenu
                  editor={editor}
                  shouldShow={({ editor, view, state, oldState, from, to }) => {
                    // Only show when there's some content selected
                    return from !== to;
                  }}
                >
                  <div
                    role="toolbar"
                    aria-label="Text formatting and actions"
                    className="flex items-center gap-1 bg-popover/95 text-popover-foreground border border-border/60 rounded-full shadow-xl ring-1 ring-black/10 backdrop-blur supports-backdrop-filter:bg-popover/85 px-1.5 py-1"
                  >
                    <button
                      onClick={() => editor.chain().focus().toggleBold().run()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          editor.chain().focus().toggleBold().run();
                        }
                      }}
                      className={`p-2 rounded-full hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors ${editor.isActive('bold') ? 'bg-accent/40' : ''}`}
                      aria-label="Bold"
                      aria-pressed={editor.isActive('bold')}
                      title="Bold (Cmd+B)"
                    >
                      <Bold className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().toggleItalic().run()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          editor.chain().focus().toggleItalic().run();
                        }
                      }}
                      className={`p-2 rounded-full hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors ${editor.isActive('italic') ? 'bg-accent/40' : ''}`}
                      aria-label="Italic"
                      aria-pressed={editor.isActive('italic')}
                      title="Italic (Cmd+I)"
                    >
                      <Italic className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().toggleStrike().run()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          editor.chain().focus().toggleStrike().run();
                        }
                      }}
                      className={`p-2 rounded-full hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors ${editor.isActive('strike') ? 'bg-accent/40' : ''}`}
                      aria-label="Strikethrough"
                      aria-pressed={editor.isActive('strike')}
                      title="Strikethrough"
                    >
                      <Strikethrough className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => editor.chain().focus().toggleCode().run()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          editor.chain().focus().toggleCode().run();
                        }
                      }}
                      className={`p-2 rounded-full hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors ${editor.isActive('code') ? 'bg-accent/40' : ''}`}
                      aria-label="Code"
                      aria-pressed={editor.isActive('code')}
                      title="Code"
                    >
                      <Code className="h-4 w-4" />
                    </button>
                    <div className="w-px h-5 bg-border/70 mx-1" aria-hidden="true" />
                    <button
                      onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          editor.chain().focus().toggleHeading({ level: 2 }).run();
                        }
                      }}
                      className={`p-2 rounded-full hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-accent/40' : ''}`}
                      aria-label="Heading 2"
                      aria-pressed={editor.isActive('heading', { level: 2 })}
                      title="Heading 2"
                    >
                      <Heading2 className="h-4 w-4" />
                    </button>
                    <div className="w-px h-5 bg-border/70 mx-1" aria-hidden="true" />
                    <button
                      onClick={handleLinkNote}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleLinkNote();
                        }
                      }}
                      className="p-2 rounded-full hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                      aria-label="Link note"
                      title="Link note (Cmd+K)"
                    >
                      <Link2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handleCreateTask}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleCreateTask();
                        }
                      }}
                      className="p-2 rounded-full hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                      aria-label="Create task from selection"
                      title="Create task (Cmd+Shift+T)"
                    >
                      <CheckSquare2 className="h-4 w-4" />
                    </button>
                  </div>
                </BubbleMenu>
              </>
            )}


          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}



