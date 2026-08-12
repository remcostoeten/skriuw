"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	AlertCircle,
	CalendarDays,
	ChevronRight,
	FileText,
	Loader2,
	Plus,
	RotateCcw,
	Tag,
	Trash2,
	UserRound,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/core/auth/use-auth";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import type { Person } from "@/domain/people/models";
import type { Task, TaskPriority } from "@/domain/tasks/models";
import { useJournalEntries } from "@/features/journal/hooks/use-journal-entries";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/shared/ui/sheet";
import { tasksForDate } from "../lib/task-view-model";
import { TaskViewSwitcher, type TaskView } from "./task-view-switcher";
import { TaskViewStage } from "./task-views";

const priorities: TaskPriority[] = ["urgent", "high", "medium", "low"];

type LoadState = "loading" | "ready" | "error";

export function TasksPage() {
	const backend = useWorkspaceBackend();
	const auth = useAuth();
	const router = useRouter();
	const { data: journalEntries = [] } = useJournalEntries();
	const [tasks, setTasks] = useState<Task[]>([]);
	const [people, setPeople] = useState<Person[]>([]);
	const [draft, setDraft] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selectedDate, setSelectedDate] = useState<string | null>(null);
	const [month, setMonth] = useState<Date | null>(null);
	const [view, setView] = useState<TaskView>("list");
	const [showCompleted, setShowCompleted] = useState(true);
	const [loadState, setLoadState] = useState<LoadState>("loading");
	const [loadAttempt, setLoadAttempt] = useState(0);
	const [operationError, setOperationError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const mutationQueues = useRef(new Map<string, Promise<void>>());

	useEffect(() => {
		if (!backend.capabilities.tasks) return;
		let active = true;
		setLoadState("loading");
		setOperationError(null);

		Promise.all([backend.listTasks?.() ?? Promise.resolve([]), backend.listPeople()])
			.then(([nextTasks, nextPeople]) => {
				if (!active) return;
				setTasks(nextTasks);
				setPeople(nextPeople);
				setLoadState("ready");
			})
			.catch(() => {
				if (active) setLoadState("error");
			});

		return () => {
			active = false;
		};
	}, [backend, loadAttempt]);

	useEffect(() => {
		setMonth(new Date());
	}, []);

	const completionFilteredTasks = useMemo(
		() => (showCompleted ? tasks : tasks.filter((task) => task.status !== "done")),
		[tasks, showCompleted],
	);
	const visibleTasks = useMemo(
		() => tasksForDate(completionFilteredTasks, selectedDate),
		[completionFilteredTasks, selectedDate],
	);
	const journalDates = useMemo(
		() => new Set(journalEntries.map((entry) => entry.dateKey)),
		[journalEntries],
	);

	if (!auth.isReady) {
		return (
			<TaskStatusPage
				icon={<Loader2 className="size-5 animate-spin" />}
				title="Loading tasks…"
			/>
		);
	}

	if (!backend.capabilities.tasks) {
		return (
			<TaskStatusPage
				icon={<CalendarDays className="size-5" />}
				title="Tasks aren’t available in this workspace"
				description="Open a desktop vault or sign in to a workspace to create and manage tasks."
			/>
		);
	}

	if (loadState === "loading") {
		return (
			<TaskStatusPage
				icon={<Loader2 className="size-5 animate-spin" />}
				title="Loading tasks…"
			/>
		);
	}

	if (loadState === "error") {
		return (
			<TaskStatusPage
				icon={<AlertCircle className="size-5" />}
				title="Tasks couldn’t be loaded"
				description="Your tasks are unchanged. Check the connection and try again."
				action={
					<button
						type="button"
						onClick={() => setLoadAttempt((attempt) => attempt + 1)}
						className="mt-4 inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
					>
						<RotateCcw className="size-4" /> Try again
					</button>
				}
			/>
		);
	}

	async function createTask(event: React.FormEvent) {
		event.preventDefault();
		const title = draft.trim();
		if (!title || !backend.createTask || isCreating) return;
		setIsCreating(true);
		setOperationError(null);
		try {
			const task = await backend.createTask({ title });
			setTasks((current) => [task, ...current]);
			setDraft("");
		} catch {
			setOperationError("The task couldn’t be created. Try again.");
		} finally {
			setIsCreating(false);
		}
	}

	function patchTask(id: string, patch: Partial<Task>): Promise<void> {
		if (!backend.updateTask) return Promise.resolve();
		setOperationError(null);

		const previous = mutationQueues.current.get(id) ?? Promise.resolve();
		const queued = previous
			.catch(() => undefined)
			.then(async () => {
				const saved = await backend.updateTask?.({ id, ...patch });
				if (!saved) throw new Error("Task no longer exists");
				setTasks((current) => current.map((item) => (item.id === saved.id ? saved : item)));
			})
			.catch(() => {
				setOperationError("A task change couldn’t be saved. Reload before trying again.");
			});
		mutationQueues.current.set(id, queued);
		queued.finally(() => {
			if (mutationQueues.current.get(id) === queued) mutationQueues.current.delete(id);
		});
		return queued;
	}

	async function deleteTask(id: string) {
		if (!backend.deleteTask) return;
		setOperationError(null);
		try {
			await (mutationQueues.current.get(id) ?? Promise.resolve());
			await backend.deleteTask(id);
			setTasks((current) => current.filter((task) => task.id !== id));
			setSelectedId(null);
		} catch {
			setOperationError("The task couldn’t be deleted. Try again.");
			throw new Error("Task deletion failed");
		}
	}

	const selected = selectedId ? (tasks.find((task) => task.id === selectedId) ?? null) : null;
	const openCount = tasks.filter((task) => task.status !== "done").length;

	return (
		<div className="flex h-full min-h-0 bg-background text-foreground">
			<main className="min-w-0 flex-1 overflow-auto px-4 py-6 sm:px-6 md:px-10">
				<div className="mx-auto max-w-7xl">
					<header className="mb-7 flex items-end justify-between gap-4">
						<div>
							<p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
								Workspace
							</p>
							<h1 className="mt-1 text-3xl font-semibold tracking-tight">Tasks</h1>
							<p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
								One set of tasks, shaped for the way you need to work.
							</p>
						</div>
						<span className="text-sm text-muted-foreground">{openCount} open</span>
					</header>
					<form
						onSubmit={createTask}
						className="mb-3 flex items-center gap-2 rounded-lg border bg-card p-2 shadow-sm"
					>
						{isCreating ? (
							<Loader2 className="ml-1 size-4 animate-spin text-muted-foreground" />
						) : (
							<Plus className="ml-1 size-4 text-muted-foreground" />
						)}
						<input
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							disabled={isCreating}
							className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none disabled:opacity-60"
							placeholder="Add a task and press Enter"
							aria-label="New task title"
						/>
					</form>
					{operationError ? (
						<p
							role="alert"
							className="mb-3 flex items-center gap-2 text-xs text-destructive"
						>
							<AlertCircle className="size-3.5" /> {operationError}
						</p>
					) : null}
					<div className="mb-3 flex items-center gap-2 overflow-x-auto pb-0.5">
						<TaskViewSwitcher view={view} onChange={setView} />
						<div className="flex-1" />
						{selectedDate ? (
							<button
								type="button"
								onClick={() => setSelectedDate(null)}
								className="h-9 shrink-0 rounded-lg border bg-card px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
							>
								Due{" "}
								{new Date(`${selectedDate}T12:00:00`).toLocaleDateString(
									undefined,
									{ month: "short", day: "numeric" },
								)}{" "}
								×
							</button>
						) : null}
						<button
							type="button"
							onClick={() => setShowCompleted((current) => !current)}
							aria-pressed={!showCompleted}
							className="h-9 shrink-0 rounded-lg border bg-card px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
						>
							{showCompleted ? "Hide completed" : "Show completed"}
						</button>
					</div>
					<section className="overflow-hidden rounded-xl border bg-card/35 shadow-sm">
						<header className="flex h-11 items-center gap-2 border-b px-3 sm:px-4">
							<span className="text-xs font-medium">
								{selectedDate
									? "Tasks due this day"
									: view === "calendar"
										? "Schedule"
										: "All tasks"}
							</span>
							<span className="font-mono text-[10px] text-muted-foreground">
								{view === "calendar"
									? completionFilteredTasks.length
									: visibleTasks.length}{" "}
								items
							</span>
							{tasks.some((task) => task.sourceNoteId) ? (
								<span className="ml-auto hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:flex">
									<i className="h-3 w-0.5 rounded-full bg-[hsl(var(--project-purple))]" />
									From a note
								</span>
							) : null}
						</header>
						<TaskViewStage
							view={view}
							tasks={visibleTasks}
							calendarTasks={completionFilteredTasks}
							people={people}
							isFiltered={selectedDate !== null || !showCompleted}
							month={month}
							onMonthChange={setMonth}
							journalDates={journalDates}
							selectedDate={selectedDate}
							onSelect={setSelectedId}
							onToggle={(task) =>
								patchTask(task.id, {
									status: task.status === "done" ? "todo" : "done",
								})
							}
							onPatch={patchTask}
							onShowDay={(dateKey) => {
								setSelectedDate(dateKey);
								setView("list");
							}}
						/>
					</section>
				</div>
			</main>
			<TaskDrawer
				task={selected}
				people={people}
				onClose={() => setSelectedId(null)}
				onPatch={patchTask}
				onDelete={deleteTask}
				onOpenSource={(noteId) => {
					setSelectedId(null);
					router.push(`/app?note=${encodeURIComponent(noteId)}`);
				}}
			/>
		</div>
	);
}

function TaskStatusPage({
	icon,
	title,
	description,
	action,
}: {
	icon: React.ReactNode;
	title: string;
	description?: string;
	action?: React.ReactNode;
}) {
	return (
		<div className="flex h-full items-center justify-center px-6 text-center">
			<div className="max-w-sm">
				<div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
					{icon}
				</div>
				<h1 className="text-base font-medium">{title}</h1>
				{description ? (
					<p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
				) : null}
				{action}
			</div>
		</div>
	);
}

function TaskDrawer({
	task,
	people,
	onClose,
	onPatch,
	onDelete,
	onOpenSource,
}: {
	task: Task | null;
	people: Person[];
	onClose: () => void;
	onPatch: (id: string, patch: Partial<Task>) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
	onOpenSource: (noteId: string) => void;
}) {
	return (
		<Sheet
			open={task !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<SheetContent
				side="right"
				hideClose
				className="flex w-full max-w-lg flex-col gap-0 p-0 sm:max-w-lg"
			>
				{task ? (
					<TaskDrawerContent
						key={task.id}
						task={task}
						people={people}
						onClose={onClose}
						onPatch={onPatch}
						onDelete={onDelete}
						onOpenSource={onOpenSource}
					/>
				) : null}
			</SheetContent>
		</Sheet>
	);
}

function TaskDrawerContent({
	task,
	people,
	onClose,
	onPatch,
	onDelete,
	onOpenSource,
}: {
	task: Task;
	people: Person[];
	onClose: () => void;
	onPatch: (id: string, patch: Partial<Task>) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
	onOpenSource: (noteId: string) => void;
}) {
	const [title, setTitle] = useState(task.title);
	const [description, setDescription] = useState(task.description);
	const [tags, setTags] = useState(task.tags);
	const [assigneeIds, setAssigneeIds] = useState(task.assigneeIds);
	const [tagDraft, setTagDraft] = useState("");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const tagsRef = useRef(task.tags);
	const assigneeIdsRef = useRef(task.assigneeIds);

	function commitTitle() {
		const next = title.trim();
		if (!next) {
			setTitle(task.title);
			return;
		}
		if (next !== task.title) void onPatch(task.id, { title: next });
	}

	function addTag() {
		const tag = tagDraft.trim().replace(/^#/, "");
		if (!tag) return;
		setTagDraft("");
		if (
			!tagsRef.current.some(
				(current) => current.toLocaleLowerCase() === tag.toLocaleLowerCase(),
			)
		) {
			const next = [...tagsRef.current, tag];
			tagsRef.current = next;
			setTags(next);
			void onPatch(task.id, { tags: next });
		}
	}

	function removeTag(tag: string) {
		const next = tagsRef.current.filter((current) => current !== tag);
		tagsRef.current = next;
		setTags(next);
		void onPatch(task.id, { tags: next });
	}

	function toggleAssignee(personId: string) {
		const next = assigneeIdsRef.current.includes(personId)
			? assigneeIdsRef.current.filter((id) => id !== personId)
			: [...assigneeIdsRef.current, personId];
		assigneeIdsRef.current = next;
		setAssigneeIds(next);
		void onPatch(task.id, { assigneeIds: next });
	}

	return (
		<>
			<header className="flex h-12 items-center justify-between border-b px-4">
				<div>
					<SheetTitle className="text-xs font-medium text-foreground">Task</SheetTitle>
					<SheetDescription className="sr-only">
						Edit task details, assignees, tags, and source note.
					</SheetDescription>
				</div>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close task"
					className="rounded p-1 hover:bg-muted"
				>
					<X className="size-4" />
				</button>
			</header>
			<div className="space-y-6 overflow-auto p-6">
				<input
					className="w-full bg-transparent text-2xl font-semibold outline-none"
					value={title}
					onChange={(event) => setTitle(event.target.value)}
					onBlur={commitTitle}
					onKeyDown={(event) => {
						if (event.key === "Enter") event.currentTarget.blur();
					}}
					aria-label="Task title"
				/>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="block text-xs text-muted-foreground">
						Status
						<select
							className="mt-1 block w-full rounded border bg-card p-2 text-sm text-foreground"
							value={task.status}
							onChange={(event) =>
								void onPatch(task.id, {
									status: event.target.value as Task["status"],
								})
							}
						>
							<option value="todo">To do</option>
							<option value="in_progress">In progress</option>
							<option value="done">Done</option>
						</select>
					</label>
					<label className="block text-xs text-muted-foreground">
						Priority
						<select
							className="mt-1 block w-full rounded border bg-card p-2 text-sm capitalize text-foreground"
							value={task.priority}
							onChange={(event) =>
								void onPatch(task.id, {
									priority: event.target.value as TaskPriority,
								})
							}
						>
							{priorities.map((priority) => (
								<option key={priority}>{priority}</option>
							))}
						</select>
					</label>
				</div>
				<label className="block text-xs text-muted-foreground">
					Due date
					<input
						type="date"
						className="mt-1 block w-full rounded border bg-card p-2 text-sm text-foreground"
						value={task.dueDate ?? ""}
						onChange={(event) =>
							void onPatch(task.id, { dueDate: event.target.value || undefined })
						}
					/>
				</label>
				<label className="block text-xs text-muted-foreground">
					Description
					<textarea
						className="mt-1 block min-h-28 w-full rounded border bg-card p-2 text-sm text-foreground"
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						onBlur={() => {
							if (description !== task.description)
								void onPatch(task.id, { description });
						}}
					/>
				</label>
				<section>
					<h2 className="flex items-center gap-2 text-xs text-muted-foreground">
						<Tag className="size-3.5" /> Tags
					</h2>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{tags.map((tag) => (
							<button
								type="button"
								key={tag}
								onClick={() => removeTag(tag)}
								className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs hover:bg-destructive/10 hover:text-destructive"
								aria-label={`Remove ${tag} tag`}
							>
								#{tag}
								<X className="size-3" />
							</button>
						))}
						<input
							value={tagDraft}
							onChange={(event) => setTagDraft(event.target.value)}
							onBlur={addTag}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === ",") {
									event.preventDefault();
									addTag();
								}
							}}
							className="min-w-28 flex-1 rounded border bg-card px-2 py-1 text-xs outline-none"
							placeholder="Add a tag"
							aria-label="Add task tag"
						/>
					</div>
				</section>
				<section>
					<h2 className="flex items-center gap-2 text-xs text-muted-foreground">
						<UserRound className="size-3.5" /> Assignees
					</h2>
					{people.length > 0 ? (
						<div className="mt-2 grid gap-1 rounded border bg-card p-2">
							{people.map((person) => {
								const checked = assigneeIds.includes(person.id);
								return (
									<label
										key={person.id}
										className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
									>
										<input
											type="checkbox"
											checked={checked}
											onChange={() => toggleAssignee(person.id)}
										/>
										<span
											className="size-2 rounded-full bg-muted-foreground"
											style={
												person.color
													? { backgroundColor: person.color }
													: undefined
											}
										/>
										<span className="truncate">{person.name}</span>
									</label>
								);
							})}
						</div>
					) : (
						<p className="mt-2 text-xs text-muted-foreground">
							Add people to your workspace to assign them here.
						</p>
					)}
				</section>
				{task.sourceNoteId ? (
					<button
						type="button"
						onClick={() => onOpenSource(task.sourceNoteId as string)}
						className="flex w-full items-center gap-3 rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-muted"
					>
						<FileText className="size-4 text-muted-foreground" />
						<span className="min-w-0 flex-1">Open source note</span>
						<ChevronRight className="size-4 text-muted-foreground" />
					</button>
				) : null}
				<div className="border-t pt-5">
					{confirmDelete ? (
						<div className="flex items-center justify-between gap-3">
							<p className="text-xs text-muted-foreground">
								Delete this task permanently?
							</p>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={() => setConfirmDelete(false)}
									className="rounded border px-2.5 py-1.5 text-xs hover:bg-muted"
								>
									Cancel
								</button>
								<button
									type="button"
									disabled={isDeleting}
									onClick={async () => {
										setIsDeleting(true);
										try {
											await onDelete(task.id);
										} catch {
											setIsDeleting(false);
											setConfirmDelete(false);
										}
									}}
									className="rounded bg-destructive px-2.5 py-1.5 text-xs text-destructive-foreground disabled:opacity-60"
								>
									{isDeleting ? "Deleting…" : "Delete"}
								</button>
							</div>
						</div>
					) : (
						<button
							type="button"
							onClick={() => setConfirmDelete(true)}
							className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive"
						>
							<Trash2 className="size-3.5" /> Delete task
						</button>
					)}
				</div>
			</div>
		</>
	);
}
