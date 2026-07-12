"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useAuth } from "@/core/auth/use-auth";
import { useWorkspaceBackend } from "@/core/workspace-backend";
import type { Task, TaskPriority } from "@/domain/tasks/models";
import { useJournalEntries } from "@/features/journal/hooks/use-journal-entries";
import { cn } from "@/shared/lib/utils";

const priorities: TaskPriority[] = ["urgent", "high", "medium", "low"];
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export function TasksPage() {
	const backend = useWorkspaceBackend();
	const auth = useAuth();
	const { data: journalEntries = [] } = useJournalEntries();
	const [tasks, setTasks] = useState<Task[]>([]);
	const [draft, setDraft] = useState("");
	const [selected, setSelected] = useState<Task | null>(null);
	const [month, setMonth] = useState(() => new Date());

	useEffect(() => {
		if (!backend.capabilities.tasks) return;
		backend
			.listTasks?.()
			.then(setTasks)
			.catch(() => setTasks([]));
	}, [backend]);

	if (!backend.capabilities.tasks) {
		return auth.isReady ? null : (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading tasks…
			</div>
		);
	}

	async function createTask(event: React.FormEvent) {
		event.preventDefault();
		if (!draft.trim() || !backend.createTask) return;
		const task = await backend.createTask({ title: draft });
		setTasks((current) => [task, ...current]);
		setDraft("");
	}

	async function patchTask(task: Task, patch: Partial<Task>) {
		if (!backend.updateTask) return;
		const saved = await backend.updateTask({ id: task.id, ...patch });
		if (!saved) return;
		setTasks((current) => current.map((item) => (item.id === saved.id ? saved : item)));
		setSelected(saved);
	}

	return (
		<div className="flex h-full min-h-0 bg-background text-foreground">
			<main className="min-w-0 flex-1 overflow-auto px-5 py-6 md:px-10">
				<div className="mx-auto max-w-5xl">
					<header className="mb-7 flex items-end justify-between gap-4">
						<div>
							<p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
								Workspace
							</p>
							<h1 className="mt-1 text-3xl font-semibold tracking-tight">Tasks</h1>
						</div>
						<span className="text-sm text-muted-foreground">
							{tasks.filter((task) => task.status !== "done").length} open
						</span>
					</header>
					<form
						onSubmit={createTask}
						className="mb-8 flex items-center gap-2 rounded-lg border bg-card p-2 shadow-sm"
					>
						<Plus className="ml-1 size-4 text-muted-foreground" />
						<input
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm outline-none"
							placeholder="Add a task and press Enter"
						/>
					</form>
					<section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_330px]">
						<TaskList
							tasks={tasks}
							onSelect={setSelected}
							onToggle={(task) =>
								patchTask(task, {
									status: task.status === "done" ? "todo" : "done",
								})
							}
						/>
						<UnifiedCalendar
							month={month}
							onMonthChange={setMonth}
							tasks={tasks}
							journalDates={new Set(journalEntries.map((entry) => entry.dateKey))}
						/>
					</section>
				</div>
			</main>
			{selected ? (
				<TaskDrawer task={selected} onClose={() => setSelected(null)} onPatch={patchTask} />
			) : null}
		</div>
	);
}

function TaskList({
	tasks,
	onSelect,
	onToggle,
}: {
	tasks: Task[];
	onSelect: (task: Task) => void;
	onToggle: (task: Task) => void;
}) {
	const groups = [
		[
			"Overdue",
			tasks.filter(
				(task) =>
					task.status !== "done" && task.dueDate && task.dueDate < dayKey(new Date()),
			),
		],
		[
			"Today",
			tasks.filter((task) => task.status !== "done" && task.dueDate === dayKey(new Date())),
		],
		["Inbox", tasks.filter((task) => task.status !== "done" && !task.dueDate)],
		["Completed", tasks.filter((task) => task.status === "done")],
	] as const;
	return (
		<div className="space-y-6">
			{groups
				.filter(([, items]) => items.length)
				.map(([label, items]) => (
					<section key={label}>
						<h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
							{label} · {items.length}
						</h2>
						<div className="overflow-hidden rounded-lg border bg-card">
							{items.map((task) => (
								<div
									key={task.id}
									className="flex cursor-pointer items-center gap-3 border-b px-3 py-3 last:border-b-0 hover:bg-muted/50"
									onClick={() => onSelect(task)}
								>
									<button
										type="button"
										onClick={(event) => {
											event.stopPropagation();
											onToggle(task);
										}}
										className={cn(
											"flex size-5 shrink-0 items-center justify-center rounded border",
											task.status === "done" &&
												"border-emerald-500 bg-emerald-500 text-white",
										)}
										aria-label="Toggle task"
									>
										{task.status === "done" ? (
											<Check className="size-3.5" />
										) : null}
									</button>
									<span
										className={cn(
											"min-w-0 flex-1 text-sm",
											task.status === "done" &&
												"text-muted-foreground line-through",
										)}
									>
										{task.title}
									</span>
									<span className="text-xs capitalize text-muted-foreground">
										{task.priority}
									</span>
									{task.dueDate ? (
										<span className="text-xs text-muted-foreground">
											{task.dueDate}
										</span>
									) : null}
								</div>
							))}
						</div>
					</section>
				))}
		</div>
	);
}

function UnifiedCalendar({
	month,
	onMonthChange,
	tasks,
	journalDates,
}: {
	month: Date;
	onMonthChange: (month: Date) => void;
	tasks: Task[];
	journalDates: Set<string>;
}) {
	const first = new Date(month.getFullYear(), month.getMonth(), 1);
	const leading = (first.getDay() + 6) % 7;
	const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
	return (
		<aside className="h-fit rounded-lg border bg-card p-4">
			<div className="mb-4 flex items-center justify-between">
				<button
					type="button"
					onClick={() =>
						onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))
					}
				>
					<ChevronLeft className="size-4" />
				</button>
				<h2 className="text-sm font-medium">
					{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
				</h2>
				<button
					type="button"
					onClick={() =>
						onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))
					}
				>
					<ChevronRight className="size-4" />
				</button>
			</div>
			<div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
				{"MTWTFSS".split("").map((day, index) => (
					<span key={`${day}-${index}`}>{day}</span>
				))}
				{Array.from({ length: leading }, (_, index) => (
					<span key={`blank-${index}`} />
				))}
				{Array.from({ length: days }, (_, index) => {
					const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
					const key = dayKey(date);
					const taskCount = tasks.filter(
						(task) => task.dueDate === key && task.status !== "done",
					).length;
					const hasJournal = journalDates.has(key);
					return (
						<div
							key={key}
							className={cn(
								"min-h-9 rounded pt-1",
								key === dayKey(new Date()) && "bg-muted",
							)}
						>
							<span>{index + 1}</span>
							<div className="mt-1 flex justify-center gap-0.5">
								{taskCount ? (
									<i
										className="size-1.5 rounded-full bg-amber-500"
										title={`${taskCount} tasks`}
									/>
								) : null}
								{hasJournal ? (
									<i
										className="size-1.5 rounded-full bg-sky-500"
										title="Journal entry"
									/>
								) : null}
							</div>
						</div>
					);
				})}
			</div>
			<p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
				<CalendarDays className="size-3.5" /> amber tasks · blue diary
			</p>
		</aside>
	);
}

function TaskDrawer({
	task,
	onClose,
	onPatch,
}: {
	task: Task;
	onClose: () => void;
	onPatch: (task: Task, patch: Partial<Task>) => void;
}) {
	return (
		<aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l bg-background shadow-2xl">
			<header className="flex h-12 items-center justify-between border-b px-4">
				<span className="text-xs text-muted-foreground">Task</span>
				<button type="button" onClick={onClose} aria-label="Close task">
					<X className="size-4" />
				</button>
			</header>
			<div className="space-y-6 overflow-auto p-6">
				<input
					className="w-full bg-transparent text-2xl font-semibold outline-none"
					value={task.title}
					onChange={(event) => onPatch(task, { title: event.target.value })}
				/>
				<label className="block text-xs text-muted-foreground">
					Status
					<select
						className="mt-1 block w-full rounded border bg-card p-2 text-sm text-foreground"
						value={task.status}
						onChange={(event) =>
							onPatch(task, { status: event.target.value as Task["status"] })
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
							onPatch(task, { priority: event.target.value as TaskPriority })
						}
					>
						{priorities.map((priority) => (
							<option key={priority}>{priority}</option>
						))}
					</select>
				</label>
				<label className="block text-xs text-muted-foreground">
					Due date
					<input
						type="date"
						className="mt-1 block w-full rounded border bg-card p-2 text-sm text-foreground"
						value={task.dueDate ?? ""}
						onChange={(event) =>
							onPatch(task, { dueDate: event.target.value || undefined })
						}
					/>
				</label>
				<label className="block text-xs text-muted-foreground">
					Description
					<textarea
						className="mt-1 block min-h-28 w-full rounded border bg-card p-2 text-sm text-foreground"
						value={task.description}
						onChange={(event) => onPatch(task, { description: event.target.value })}
					/>
				</label>
				{task.sourceNoteId ? (
					<p className="text-xs text-muted-foreground">Linked to a source note.</p>
				) : null}
			</div>
		</aside>
	);
}
