import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { useUpdateNote } from '@/modules/notes/api/mutations/update-note';
import { useTasks } from '@/modules/tasks/api/queries/get-tasks';
import { useCreateTask } from '@/modules/tasks/api/mutations/create-task';
import { useUpdateTask } from '@/modules/tasks/api/mutations/update-task';
import { useDeleteTask } from '@/modules/tasks/api/mutations/delete-task';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import type { Note } from '@/lib/db/schema';

interface NoteEditorProps {
  note: Note;
  onUpdate: () => void;
}

export function NoteEditor({ note, onUpdate }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [newTaskContent, setNewTaskContent] = useState('');
  
  const { updateNote } = useUpdateNote();
  const { data: tasks, refetch: refetchTasks } = useTasks(note.id);
  const { createTask } = useCreateTask();
  const { updateTask } = useUpdateTask();
  const { deleteTask } = useDeleteTask();

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
  }, [note.id]);

  const handleTitleChange = async (newTitle: string) => {
    setTitle(newTitle);
    await updateNote(note.id, { title: newTitle });
    onUpdate();
  };

  const handleContentChange = async (newContent: string) => {
    setContent(newContent);
    await updateNote(note.id, { content: newContent });
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
    <div className="h-full flex flex-col">
      <div className="p-6 border-b border-border">
        <Input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="text-2xl font-bold border-0 px-0 focus-visible:ring-0"
          placeholder="Note title"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <h3 className="text-sm font-medium mb-3">Content</h3>
          <Textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
            placeholder="Write your note here (markdown supported)..."
          />
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-medium mb-3">Tasks</h3>
          <div className="space-y-2 mb-4">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-3 group">
                <Checkbox
                  checked={task.completed}
                  onCheckedChange={(checked) =>
                    handleToggleTask(task.id, checked as boolean)
                  }
                  className="mt-0.5"
                />
                <span
                  className={`flex-1 ${
                    task.completed ? 'line-through text-muted-foreground' : ''
                  }`}
                >
                  {task.content}
                </span>
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
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
              className="flex-1"
            />
            <Button size="icon" onClick={handleCreateTask}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

