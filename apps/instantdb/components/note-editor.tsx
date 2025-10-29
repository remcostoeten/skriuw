'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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
  const [content, setContent] = useState(note.content);
  const [newTaskContent, setNewTaskContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { updateNote } = useUpdateNote();
  const { tasks } = useGetTasks(note.id);
  const { createTask } = useCreateTask();
  const { updateTask } = useUpdateTask();
  const { destroyTask } = useDestroyTask();

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
  }, [note.id]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [content]);

  const handleTitleChange = async (newTitle: string) => {
    setTitle(newTitle);
    await updateNote(note.id, { title: newTitle });
  };

  const handleContentChange = async (newContent: string) => {
    setContent(newContent);
    await updateNote(note.id, { content: newContent });
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

        {/* Content Editor and Live Preview */}
        <div className="space-y-8">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              className="w-full bg-transparent border-none outline-none resize-none text-base leading-relaxed placeholder:text-muted-foreground/30 min-h-[300px]"
              placeholder="Start writing... (markdown supported)

# Heading 1
## Heading 2
**bold** *italic*
- List item
1. Numbered list
[link](url)
`code`"
            />
          </div>

          {/* Live Markdown Preview */}
          {content && (
            <div className="prose prose-invert prose-neutral max-w-none">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-4">Preview</div>
              <ReactMarkdown
                className="markdown-preview"
                components={{
                  h1: ({ children }) => <h1 className="text-3xl font-bold mb-4 mt-8">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-2xl font-semibold mb-3 mt-6">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-xl font-semibold mb-2 mt-4">{children}</h3>,
                  p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  code: ({ children }) => (
                    <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                  ),
                  pre: ({ children }) => (
                    <pre className="bg-muted p-4 rounded-lg overflow-x-auto mb-4">{children}</pre>
                  ),
                  a: ({ href, children }) => (
                    <a href={href} className="text-primary underline hover:no-underline">
                      {children}
                    </a>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-muted pl-4 italic my-4">{children}</blockquote>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}

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

