'use client';

import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { useUpdateNote } from '@/modules/notes/api/mutations/update';
import { useGetTasks } from '@/modules/tasks/api/queries/get-tasks';
import { useCreateTask } from '@/modules/tasks/api/mutations/create';
import { useUpdateTask } from '@/modules/tasks/api/mutations/update';
import { useDestroyTask } from '@/modules/tasks/api/mutations/destroy';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { Note } from '@/lib/db/schema';

interface NoteEditorProps {
  note: Note;
}

export function NoteEditor({ note }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [newTaskContent, setNewTaskContent] = useState('');

  const { updateNote } = useUpdateNote();
  const { tasks } = useGetTasks(note.id);
  const { createTask } = useCreateTask();
  const { updateTask } = useUpdateTask();
  const { destroyTask } = useDestroyTask();

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: 'Start writing... Type ## for headings, **bold**, *italic*, - for lists...',
      }),
      Typography,
    ],
    content: note.content,
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none min-h-[300px]',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      updateNote(note.id, { content: html });
    },
  });

  useEffect(() => {
    setTitle(note.title);
    if (editor && note.content !== editor.getHTML()) {
      editor.commands.setContent(note.content);
    }
  }, [note.id, note.content, editor]);

  const handleTitleChange = async (newTitle: string) => {
    setTitle(newTitle);
    await updateNote(note.id, { title: newTitle });
  };

  const handleCreateTask = async () => {
    if (!newTaskContent.trim()) return;

    await createTask({
      noteId: note.id,
      content: newTaskContent,
      position: tasks.length,
    });
    setNewTaskContent('');
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    await updateTask(taskId, { completed });
  };

  const handleDeleteTask = async (taskId: string) => {
    await destroyTask(taskId);
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
          <EditorContent editor={editor} />

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

