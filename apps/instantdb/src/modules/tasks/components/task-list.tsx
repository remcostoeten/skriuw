"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useGetTasks } from "@/modules/tasks/api/queries/get-tasks";
import { useCreateTask } from "@/modules/tasks/api/mutations/create";
import { useUpdateTask } from "@/modules/tasks/api/mutations/update";
import { useDestroyTask } from "@/modules/tasks/api/mutations/destroy";
import { useAddTaskComment } from "@/modules/tasks/api/mutations/add-comment";
import { useGetProjects } from "@/modules/projects/api/queries/get-projects";
import { applyList, savedLists } from "@/modules/tasks/utils/saved-filters";
import type { Task } from "@/api/db/schema";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { EmptyState } from "@/components/tasks/empty-state";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

type props = {
    noteId: string | null;
    tasks?: Task[];
};

export function TaskList({ noteId, tasks: providedTasks }: props) {
    const { tasks: fetchedTasks } = useGetTasks(noteId);
    const tasks = providedTasks ?? fetchedTasks;
    const { createTask, isLoading: isCreating } = useCreateTask();
    const { updateTask } = useUpdateTask();
    const { destroyTask } = useDestroyTask();
    const { addComment } = useAddTaskComment();
    const { projects } = useGetProjects();

    const [newTask, setNewTask] = useState("");
    const [listId, setListId] = useState<string | null>(null);
    const [newTaskId, setNewTaskId] = useState<string | null>(null);
    const editorRefs = useRef<Record<string, any>>({});

    const nextPosition = useMemo(() => {
        if (!tasks || tasks.length === 0) return 0;
        return (
            tasks.reduce((max, t) => (t.position > max ? t.position : max), 0) + 1
        );
    }, [tasks]);

    async function handleAddTask() {
        const trimmed = newTask.trim();
        if (!trimmed) return;
        const result = await createTask({ noteId: noteId ?? undefined, content: trimmed, position: nextPosition });
        setNewTask("");
        if (result && result.id) {
            setNewTaskId(result.id);
        }
    }

    async function handleToggleTask(taskId: string, completed: boolean) {
        await updateTask(taskId, { completed });
    }

    async function handleDeleteTask(taskId: string) {
        await destroyTask(taskId);
    }

    async function handleAssignProject(taskId: string, projectId: string | null) {
        await updateTask(taskId, { projectId });
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") {
            e.preventDefault();
            void handleAddTask();
        }
    }

    const isDisabled = false;

    // Focus on newly created task
    useEffect(() => {
        if (newTaskId && editorRefs.current[newTaskId]) {
            const editor = editorRefs.current[newTaskId];
            if (editor && editor.commands && editor.commands.focus) {
                // Focus the editor and select all content
                setTimeout(() => {
                    editor.commands.focus('end');
                    editor.commands.selectAll();
                }, 50); // Small delay to ensure DOM is ready
            }
            // Clear the new task ID after focusing
            setNewTaskId(null);
        }
    }, [newTaskId, tasks, providedTasks]);

    // Cleanup editor refs when component unmounts or tasks change
    useEffect(() => {
        return () => {
            // Clear refs for tasks that no longer exist
            const currentTaskIds = new Set(tasks.map(t => t.id));
            Object.keys(editorRefs.current).forEach(id => {
                if (!currentTaskIds.has(id)) {
                    delete editorRefs.current[id];
                }
            });
        };
    }, [tasks]);

    return (
        <div className="pt-8 border-t border-border/50">
            <h3 className="text-xs uppercase tracking-wide text-foreground mb-4 font-medium">
                Tasks
            </h3>

            <div className="flex items-center gap-2 mb-3">
                <label className="text-xs text-muted-foreground">Quick list</label>
                <Select
                    value={listId ?? 'all'}
                    onValueChange={(value) => setListId(value === 'all' ? null : value)}
                >
                    <SelectTrigger className="w-auto h-7 text-xs">
                        <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {savedLists.map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-3 mb-4">
                {(listId ? applyList(tasks, listId) : tasks).map((task: Task) => (
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
                                <div className="flex items-center gap-2 flex-wrap">
                                    <InlineTaskEditor
                                        task={task}
                                        onUpdate={(html) => updateTask(task.id, { content: html })}
                                        onEditorReady={(editor) => {
                                            editorRefs.current[task.id] = editor;
                                        }}
                                    />
                                    <Select
                                        value={task.project?.id ?? "no-project"}
                                        onValueChange={(value) => handleAssignProject(task.id, value === "no-project" ? null : value)}
                                    >
                                        <SelectTrigger className="w-24 h-6 text-xs">
                                            <SelectValue placeholder="Project" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="no-project">No Project</SelectItem>
                                            {projects
                                                .filter((p) => p.status === 'active')
                                                .map((project) => (
                                                    <SelectItem key={project.id} value={project.id}>
                                                        {project.title}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            {/* status removed to match schema */}
                            <Select
                                value={task.priority}
                                onValueChange={(value) => updateTask(task.id, { priority: value as any } as any)}
                            >
                                <SelectTrigger className="w-20 h-7 text-sm">
                                    <SelectValue placeholder="Priority" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="med">Med</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="urgent">Urgent</SelectItem>
                                </SelectContent>
                            </Select>
                            <input
                                type="date"
                                className="bg-transparent text-sm text-muted-foreground border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-border/60 h-7"
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
                                className="opacity-0 group-hover:opacity-100 text-foreground/60 hover:text-destructive transition-opacity text-lg leading-none"
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
                                            <InlineTaskEditor
                                            task={st}
                                            onUpdate={(html) => updateTask(st.id, { content: html })}
                                            onEditorReady={(editor) => {
                                                editorRefs.current[st.id] = editor;
                                            }}
                                        />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <AddSubtaskInput
                            parentId={task.id}
                            noteId={noteId}
                            onAdd={(content) =>
                                createTask({ noteId: noteId ?? undefined, content, position: nextPosition, parentId: task.id })
                            }
                        />

                        <TaskComments
                            task={task}
                            onAdd={async (body) => {
                                if (!body.trim()) return;
                                await addComment({ taskId: task.id, body });
                            }}
                        />
                    </div>
                ))}
                {((listId ? applyList(tasks, listId) : tasks).length === 0) && (
                    <EmptyState
                        type={listId ? "filtered" : (noteId ? "note" : "all")}
                        onCreateTask={handleAddTask}
                        hasFilters={!!listId}
                    />
                )}
            </div>

            <div className="flex gap-2">
                <Input
                    placeholder="Add a task"
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isCreating}
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

type InlineTaskEditorProps = {
    task: Task;
    onUpdate: (html: string) => void;
    onEditorReady?: (editor: any) => void;
};

function InlineTaskEditor({ task, onUpdate, onEditorReady }: InlineTaskEditorProps) {
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit,
            Placeholder.configure({ placeholder: 'Task details...' })
        ],
        content: task.content,
        editorProps: { attributes: { class: `tiptap focus:outline-none text-base ${task.completed ? 'line-through text-foreground/70' : 'text-foreground'}` } },
        onUpdate: ({ editor }) => {
            const html = editor.getHTML();
            if (html !== task.content) {
                onUpdate(html);
            }
        }
    }, [task.id, onEditorReady]);

    // Call onEditorReady when editor is created
    useEffect(() => {
        if (editor && onEditorReady) {
            onEditorReady(editor);
        }
    }, [editor, onEditorReady]);

    return <EditorContent editor={editor} />;
}

type AddSubtaskInputProps = { parentId: string; noteId: string | null; onAdd: (content: string) => void };

function AddSubtaskInput({ parentId, noteId, onAdd }: AddSubtaskInputProps) {
    const [value, setValue] = useState("");
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

type TaskCommentsProps = { task: Task; onAdd: (body: string) => Promise<void> };

function TaskComments({ task, onAdd }: TaskCommentsProps) {
    const [value, setValue] = useState("");
    const comments = (task as any).comments || [];
    const activity = (task as any).activity || [];
    return (
        <div className="ml-6 mt-2 space-y-2">
            <div className="space-y-1">
                {comments.map((c: any) => (
                    <div key={c.id} className="text-xs text-foreground/70">• {c.body}</div>
                ))}
            </div>
            <div className="flex gap-2">
                <Input
                    placeholder="Add comment"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={async (e) => {
                        if (e.key === 'Enter' && value.trim()) {
                            await onAdd(value.trim());
                            setValue("");
                        }
                    }}
                />
                <Button
                    onClick={async () => {
                        if (!value.trim()) return;
                        await onAdd(value.trim());
                        setValue("");
                    }}
                    disabled={!value.trim()}
                >
                    Comment
                </Button>
            </div>
            {activity.length > 0 && (
                <details className="mt-1">
                    <summary className="text-xs text-foreground/80 cursor-pointer">Activity</summary>
                    <div className="mt-1 space-y-1">
                        {activity.map((a: any) => (
                            <div key={a.id} className="text-[11px] text-foreground/70">
                                {new Date(a.createdAt).toLocaleString()} — {a.type}: {a.message}
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}


