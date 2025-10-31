"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Bold, Italic, Strikethrough, Code, Heading2 } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Mention from '@tiptap/extension-mention';
import { useUpdateNote } from '@/modules/notes/api/mutations/update';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import { useGetTasks } from '@/modules/tasks/api/queries/get-tasks';
import { useCreateTask } from '@/modules/tasks/api/mutations/create';
import { useUpdateTask } from '@/modules/tasks/api/mutations/update';
import { useDestroyTask } from '@/modules/tasks/api/mutations/destroy';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { ErrorBoundary } from '@/components/error-boundary';
import { SyncingOverlay, SyncStatus } from '@/components/loading-states';
import { useErrorHandler } from '../../hooks/use-error-handler';
import type { Note } from '@/api/db/schema';
import { createMentionSuggestion, createTaskMentionSuggestion } from '@/components/editor/mention-suggestion';
import { useGetAllTasks } from '@/modules/tasks/api/queries/get-all-tasks';

/**
 * ToDo: create a global keyboard event listener HoC
 */

type Props = {
  note: Note;
  onNoteSelect?: (noteId: string) => void;
};

export function NoteEditor({ note, onNoteSelect }: Props) {
  const [title, setTitle] = useState(note.title);
  const [newTaskContent, setNewTaskContent] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | undefined>(undefined);

  const { updateNote, isLoading: isUpdatingNote } = useUpdateNote();
  const { notes } = useGetNotes();
  const { tasks } = useGetTasks(note.id);
  const { tasks: allTasks } = useGetAllTasks();
  const { createTask, isLoading: isCreatingTask } = useCreateTask();
  const { updateTask, isLoading: isUpdatingTask } = useUpdateTask();
  const { destroyTask, isLoading: isDestroyingTask } = useDestroyTask();

  const { handleError } = useErrorHandler();

  // Calculate overall loading state
  const isMutating = isUpdatingNote || isCreatingTask || isUpdatingTask || isDestroyingTask;

  // Helper to wrap async operations with sync status tracking
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

  const availableNotes = useMemo(() => (
    notes.filter((n) => n.id !== note.id).map((n) => ({
      id: n.id,
      title: n.title || 'Untitled',
    }))
  ), [notes, note.id]);

  const availableTasks = useMemo(() => (
    allTasks.map((t) => ({ id: t.id, label: `TASK-${t.id.slice(-4)}: ${t.content.replace(/<[^>]*>?/gm, '').slice(0, 40)}` }))
  ), [allTasks]);

  // (moved below editor initialization)

  const handleMentionClick = useCallback((_view: any, _pos: any, event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains('mention')) {
      event.preventDefault();
      const mentionId = target.getAttribute('data-mention-id');
      if (mentionId && onNoteSelect) {
        onNoteSelect(mentionId);
      }
      return true;
    }
    return false;
  }, [onNoteSelect]);

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
        suggestion: createMentionSuggestion(availableNotes),
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
        suggestion: { char: '$', ...createTaskMentionSuggestion(availableTasks) },
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
        class: 'tiptap focus:outline-none min-h-[300px]',
      },
      handleClick: handleMentionClick,
    },
  }, [note.id]);

  // Auto-save note content when it changes
  useEffect(() => {
    if (!editor) return;

    const html = editor.getHTML();
    if (html !== note.content) {
      withSyncTracking(
        () => updateNote(note.id, { content: html }),
        'auto-save note content'
      );
    }
  }, [editor, note.id, note.content, updateNote, withSyncTracking]);

  useEffect(() => {
    setTitle(note.title);
    if (editor && note.content !== editor.getHTML()) {
      // prevent triggering onUpdate when setting from outside
      // @ts-expect-error tiptap allows boolean second param to suppress update
      editor.commands.setContent(note.content, false);
    }
  }, [note.id, note.content, editor]);

  const handleTitleChange = async (newTitle: string) => {
    setTitle(newTitle);
    await withSyncTracking(
      () => updateNote(note.id, { title: newTitle }),
      'update note title'
    );
  };

  async function handleCreateTask() {
    if (!newTaskContent.trim()) return;

    const success = await withSyncTracking(
      () => createTask({
        noteId: note.id,
        content: newTaskContent,
        position: tasks.length,
      }),
      'create task'
    );

    if (success) {
      setNewTaskContent('');
    }
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    await withSyncTracking(
      () => updateTask(taskId, { completed }),
      'update task'
    );
  };

  async function handleDeleteTask(taskId: string) {
    await withSyncTracking(
      () => destroyTask(taskId),
      'delete task'
    );
  };

  return (
    <ErrorBoundary
      fallback={({ error, retry }) => (
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Editor Error</h3>
            <p className="text-gray-600 mb-4">
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
      <SyncingOverlay isLoading={isMutating} message="Saving changes...">
        <div className="h-full overflow-y-auto scrollbar-content">
          <div className="max-w-4xl mx-auto px-8 sm:px-12 lg:px-16 py-12 sm:py-16">
            {/* Title */}
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full text-4xl font-bold bg-transparent border-none outline-none mb-2 placeholder:text-muted-foreground/30"
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
                <>
                  <BubbleMenu editor={editor}>
                    <div className="flex items-center gap-1 bg-popover border border-border rounded-lg shadow-lg p-1">
                      <button
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        className={`p-2 rounded hover:bg-accent transition-colors ${editor.isActive('bold') ? 'bg-accent' : ''
                          }`}
                        title="Bold (Cmd+B)"
                      >
                        <Bold className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        className={`p-2 rounded hover:bg-accent transition-colors ${editor.isActive('italic') ? 'bg-accent' : ''
                          }`}
                        title="Italic (Cmd+I)"
                      >
                        <Italic className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        className={`p-2 rounded hover:bg-accent transition-colors ${editor.isActive('strike') ? 'bg-accent' : ''
                          }`}
                        title="Strikethrough"
                      >
                        <Strikethrough className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => editor.chain().focus().toggleCode().run()}
                        className={`p-2 rounded hover:bg-accent transition-colors ${editor.isActive('code') ? 'bg-accent' : ''
                          }`}
                        title="Code"
                      >
                        <Code className="h-4 w-4" />
                      </button>
                      <div className="w-px h-6 bg-border mx-1" />
                      <button
                        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                        className={`p-2 rounded hover:bg-accent transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-accent' : ''
                          }`}
                        title="Heading 2"
                      >
                        <Heading2 className="h-4 w-4" />
                      </button>
                    </div>
                  </BubbleMenu>
                  <EditorContent editor={editor} />
                </>
              )}


              {/* Task setup 
          ToDo: think of a way to implement this, ignore for now.
          */}
              <div className="pt-8 border-t border-border/50">
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-4">Tasks</h3>
                <div className="space-y-3 mb-4">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-3 group py-1">
                      <Checkbox
                        checked={task.completed}
                        onCheckedChange={(checked) =>
                          handleToggleTask(task.id, checked as boolean)
                        }
                        className="mt-1"
                      />
                      <span
                        className={`flex-1 text-base ${task.completed ? 'line-through text-muted-foreground' : ''
                          }`}
                      >
                        {task.content}
                      </span>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity text-lg leading-none"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    value={newTaskContent}
                    onChange={(e) => setNewTaskContent(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTask()}
                    placeholder="Add a task..."
                    className="flex-1 border-muted"
                  />
                  <Button size="icon" onClick={handleCreateTask} variant="ghost">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SyncingOverlay>
    </ErrorBoundary>
  );
}

