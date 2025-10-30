"use client";

import { useMemo, useState } from "react";
import { useGetTasks } from "@/modules/tasks/api/queries/get-tasks";
import { useCreateTask } from "@/modules/tasks/api/mutations/create";
import { useUpdateTask } from "@/modules/tasks/api/mutations/update";
import { useDestroyTask } from "@/modules/tasks/api/mutations/destroy";
import type { Task } from "@/api/db/schema";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

type props = {
    noteId: string | null;
};

export function TaskList({ noteId }: props) {
    const { tasks } = useGetTasks(noteId);
    const { createTask, isLoading: isCreating } = useCreateTask();
    const { updateTask } = useUpdateTask();
    const { destroyTask } = useDestroyTask();

    const [newTask, setNewTask] = useState("");

    const nextPosition = useMemo(() => {
        if (!tasks || tasks.length === 0) return 0;
        return (
            tasks.reduce((max, t) => (t.position > max ? t.position : max), 0) + 1
        );
    }, [tasks]);

    async function handleAddTask() {
        const trimmed = newTask.trim();
        if (!noteId || !trimmed) return;
        await createTask({ noteId, content: trimmed, position: nextPosition });
        setNewTask("");
    }

    async function handleToggleTask(taskId: string, completed: boolean) {
        await updateTask(taskId, { completed });
    }

    async function handleDeleteTask(taskId: string) {
        await destroyTask(taskId);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            e.preventDefault();
            void handleAddTask();
        }
    }

    const isDisabled = !noteId;

    return (
        <div className="pt-8 border-t border-border/50">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-4">
                Tasks
            </h3>

            <div className="space-y-3 mb-4">
                {tasks.map((task: Task) => (
                    <div key={task.id} className="space-y-2">
                        <div className="flex items-start gap-3 group py-1">
                            <Checkbox
                                checked={task.completed}
                                onCheckedChange={(checked) =>
                                    handleToggleTask(task.id, Boolean(checked))
                                }
                                className="mt-1"
                            />
                            <div className="flex-1">
                                <InlineTaskEditor task={task} onUpdate={(html) => updateTask(task.id, { content: html })} />
                            </div>
                            {/* status removed to match schema */}
                            <select
                                className="bg-transparent text-sm text-muted-foreground border rounded px-1 py-0.5"
                                value={task.priority}
                                onChange={(e) => updateTask(task.id, { priority: e.target.value as any } as any)}
                                aria-label="Priority"
                            >
                                <option value="low">Low</option>
                                <option value="med">Med</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                            </select>
                            <input
                                type="date"
                                className="bg-transparent text-sm text-muted-foreground border rounded px-1 py-0.5"
                                value={task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : ""}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    const ms = val ? new Date(val + 'T00:00:00').getTime() : undefined;
                                    updateTask(task.id, { dueAt: ms as any } as any);
                                }}
                                aria-label="Due date"
                            />
                            <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity text-lg leading-none"
                                aria-label="Delete task"
                            >
                                ×
                            </button>
                        </div>
                        {task.subtasks && task.subtasks.length > 0 && (
                            <div className="ml-6 space-y-2">
                                {task.subtasks.map((st) => (
                                    <div key={st.id} className="flex items-start gap-2">
                                        <Checkbox
                                            checked={st.completed}
                                            onCheckedChange={(checked) => updateTask(st.id, { completed: Boolean(checked) })}
                                            className="mt-1"
                                        />
                                        <div className="flex-1">
                                            <InlineTaskEditor task={st} onUpdate={(html) => updateTask(st.id, { content: html })} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <AddSubtaskInput
                            parentId={task.id}
                            noteId={noteId}
                            onAdd={(content) =>
                                createTask({ noteId: noteId!, content, position: nextPosition, parentId: task.id })
                            }
                        />
                    </div>
                ))}
                {tasks.length === 0 && (
                    <div className="text-sm text-muted-foreground">No tasks yet.</div>
                )}
            </div>

            <div className="flex gap-2">
                <Input
                    placeholder={isDisabled ? "Select a note to add tasks" : "Add a task"}
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isDisabled || isCreating}
                />
                <Button
                    onClick={handleAddTask}
                    disabled={isDisabled || isCreating || newTask.trim().length === 0}
                >
                    Add
                </Button>
            </div>
        </div>
    );
}

export default TaskList;

type InlineTaskEditorProps = { task: Task; onUpdate: (html: string) => void };

function InlineTaskEditor({ task, onUpdate }: InlineTaskEditorProps) {
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit,
            Placeholder.configure({ placeholder: 'Task details...' })
        ],
        content: task.content,
        editorProps: { attributes: { class: `tiptap focus:outline-none text-base ${task.completed ? 'line-through text-muted-foreground' : ''}` } },
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            if (html !== task.content) {
                onUpdate(html);
            }
        }
    }, [task.id]);

    return <EditorContent editor={editor} />;
}

type AddSubtaskInputProps = { parentId: string; noteId: string | null; onAdd: (content: string) => void };

function AddSubtaskInput({ parentId, noteId, onAdd }: AddSubtaskInputProps) {
    const [value, setValue] = useState("");
    if (!noteId) return null;
    return (
        <div className="ml-6 mt-2 flex gap-2">
            <Input
                placeholder="Add subtask"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && value.trim()) {
                        onAdd(value.trim());
                        setValue("");
                    }
                }}
            />
            <Button
                onClick={() => {
                    if (!value.trim()) return;
                    onAdd(value.trim());
                    setValue("");
                }}
                disabled={!value.trim()}
            >
                Add
            </Button>
        </div>
    );
}


