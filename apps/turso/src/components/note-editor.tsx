import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import Mention from '@tiptap/extension-mention';
import { useUpdateNote } from '@/modules/notes/api/mutations/update-note';
import { useNotes } from '@/modules/notes/api/queries/get-notes';
import { useTasks } from '@/modules/tasks/api/queries/get-tasks';
import { useCreateTask } from '@/modules/tasks/api/mutations/create-task';
import { useUpdateTask } from '@/modules/tasks/api/mutations/update-task';
import { useDeleteTask } from '@/modules/tasks/api/mutations/delete-task';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { Note } from '@/lib/db/schema';
import { createMentionSuggestion } from '@/lib/mention-suggestion';

interface NoteEditorProps {
  note: Note;
  onUpdate: () => void;
  onNoteSelect?: (noteId: string) => void;
}

export function NoteEditor({ note, onUpdate, onNoteSelect }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [newTaskContent, setNewTaskContent] = useState('');
  
  const { updateNote } = useUpdateNote();
  const { data: allNotes } = useNotes();
  const { data: tasks, refetch: refetchTasks } = useTasks(note.id);
  const { createTask } = useCreateTask();
  const { updateTask } = useUpdateTask();
  const { deleteTask } = useDeleteTask();

  // Filter out current note from mention suggestions
  const availableNotes = (allNotes || []).filter((n) => n.id !== note.id).map((n) => ({
    id: n.id,
    title: n.title || 'Untitled',
  }));

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
    ],
    content: note.content,
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none min-h-[300px]',
      },
      handleClick(_view, _pos, event) {
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
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      updateNote(note.id, { content: html });
      onUpdate();
    },
  }, [availableNotes, note.id, onNoteSelect, onUpdate]);

  useEffect(() => {
    setTitle(note.title);
    if (editor && note.content !== editor.getHTML()) {
      editor.commands.setContent(note.content);
    }
  }, [note.id, note.content, editor]);

  const handleTitleChange = async (newTitle: string) => {
    setTitle(newTitle);
    await updateNote(note.id, { title: newTitle });
    onUpdate();
  };

  const handleCreateTask = async () => {
    if (!newTaskContent.trim()) return;
    
    await createTask({
      noteId: note.id,
      content: newTaskContent,
      completed: false,
      position: tasks.length,
    });
    setNewTaskContent('');
    await refetchTasks();
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    await updateTask(taskId, { completed });
    await refetchTasks();
  };

  const handleDeleteTask = async (taskId: string) => {
    await deleteTask(taskId);
    await refetchTasks();
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 sm:px-12 lg:px-16 py-12 sm:py-16">
        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="w-full text-4xl font-bold bg-transparent border-none outline-none mb-2 placeholder:text-muted-foreground/30"
          placeholder="Untitled"
        />

        <div className="text-xs text-muted-foreground mb-8">
          {new Date(note.updatedAt).toLocaleDateString('en-US', { 
            month: 'long', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>

        {/* WYSIWYG Content Editor */}
        <div className="mb-8">
          {editor && <EditorContent editor={editor} />}

          {/* Tasks Section */}
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
                    className={`flex-1 text-base ${
                      task.completed ? 'line-through text-muted-foreground' : ''
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
                onKeyPress={(e) => e.key === 'Enter' && handleCreateTask()}
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
  );
}

