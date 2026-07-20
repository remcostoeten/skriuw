"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import type { Person } from "@/domain/people/models";
import type { Task, TaskPriority, TaskStatus } from "@/domain/tasks/models";
import { cn } from "@/shared/lib/utils";
import { localDayKey } from "../lib/task-view-model";
import type { TaskView } from "./task-view-switcher";

const STATUS_COLUMNS: Array<{ id: TaskStatus; label: string }> = [
	{ id: "todo", label: "To do" },
	{ id: "in_progress", label: "In progress" },
	{ id: "done", label: "Done" },
];

const PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low"];

type TaskInteractionProps = {
	onSelect: (id: string) => void;
	onToggle: (task: Task) => void;
	onPatch: (id: string, patch: Partial<Task>) => Promise<void>;
};

export function TaskViewStage({
	view,
	tasks,
	calendarTasks,
	people,
	isFiltered,
	month,
	onMonthChange,
	journalDates,
	selectedDate,
	onSelect,
	onToggle,
	onPatch,
	onShowDay,
}: {
	view: TaskView;
	tasks: Task[];
	calendarTasks: Task[];
	people: Person[];
	isFiltered: boolean;
	month: Date | null;
	onMonthChange: (month: Date) => void;
	journalDates: Set<string>;
	selectedDate: string | null;
	onSelect: (id: string) => void;
	onToggle: (task: Task) => void;
	onPatch: (id: string, patch: Partial<Task>) => Promise<void>;
	onShowDay: (dateKey: string) => void;
}) {
	if (view === "list") {
		return (
			<TaskListView
				tasks={tasks}
				isFiltered={isFiltered}
				onSelect={onSelect}
				onToggle={onToggle}
			/>
		);
	}
	if (view === "board") {
		return <TaskBoardView tasks={tasks} people={people} onSelect={onSelect} />;
	}
	if (view === "table") {
		return (
			<TaskTableView tasks={tasks} people={people} onSelect={onSelect} onPatch={onPatch} />
		);
	}
	if (!month) {
		return <div className="h-[430px] animate-pulse bg-muted/15 motion-reduce:animate-none" />;
	}
	return (
		<TaskCalendarView
			tasks={calendarTasks}
			month={month}
			onMonthChange={onMonthChange}
			journalDates={journalDates}
			selectedDate={selectedDate}
			onSelect={onSelect}
			onShowDay={onShowDay}
		/>
	);
}

function TaskListView({
	tasks,
	isFiltered,
	onSelect,
	onToggle,
}: Omit<TaskInteractionProps, "onPatch"> & {
	tasks: Task[];
	isFiltered: boolean;
}) {
	const today = useTodayKey();
	const groups = isFiltered
		? ([["Tasks", tasks]] as const)
		: ([
				[
					"Overdue",
					tasks.filter(
						(task) =>
							task.status !== "done" &&
							today !== null &&
							task.dueDate &&
							task.dueDate < today,
					),
				],
				[
					"Today",
					tasks.filter(
						(task) =>
							task.status !== "done" && today !== null && task.dueDate === today,
					),
				],
				[
					"Scheduled",
					tasks.filter(
						(task) =>
							task.status !== "done" &&
							task.dueDate &&
							(!today || task.dueDate > today),
					),
				],
				["Inbox", tasks.filter((task) => task.status !== "done" && !task.dueDate)],
				["Completed", tasks.filter((task) => task.status === "done")],
			] as const);

	if (tasks.length === 0) return <TaskViewEmpty isFiltered={isFiltered} />;

	return (
		<div className="space-y-6 p-3 sm:p-4">
			{groups
				.filter(([, items]) => items.length > 0)
				.map(([label, items]) => (
					<section key={label}>
						<h2 className="mb-2 px-1 text-[10px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
							{label} · {items.length}
						</h2>
						<div className="overflow-hidden rounded-lg border bg-card/65">
							{items.map((task) => (
								<div
									key={task.id}
									className={cn(
										"relative flex items-center gap-3 border-b px-3 py-3 last:border-b-0 hover:bg-muted/45",
										task.sourceNoteId &&
											"before:absolute before:inset-y-2.5 before:left-0 before:w-0.5 before:rounded-full before:bg-[hsl(var(--project-purple)/0.8)]",
									)}
								>
									<TaskCheckbox task={task} onToggle={onToggle} />
									<button
										type="button"
										onClick={() => onSelect(task.id)}
										className="flex min-w-0 flex-1 items-center gap-3 text-left"
									>
										<span className="min-w-0 flex-1">
											<span
												className={cn(
													"block truncate text-sm",
													task.status === "done" &&
														"text-muted-foreground line-through",
												)}
											>
												{task.title}
											</span>
											{task.sourceNoteId ? <TaskSourceMarker /> : null}
										</span>
										<PriorityLabel
											priority={task.priority}
											className="hidden sm:inline-flex"
										/>
										{task.dueDate ? (
											<time
												dateTime={task.dueDate}
												className="shrink-0 text-xs tabular-nums text-muted-foreground"
											>
												{formatDueDate(task.dueDate)}
											</time>
										) : null}
									</button>
								</div>
							))}
						</div>
					</section>
				))}
		</div>
	);
}

function TaskBoardView({
	tasks,
	people,
	onSelect,
}: Pick<TaskInteractionProps, "onSelect"> & { tasks: Task[]; people: Person[] }) {
	const peopleById = useMemo(
		() => new Map(people.map((person) => [person.id, person.name])),
		[people],
	);

	if (tasks.length === 0) return <TaskViewEmpty isFiltered />;

	return (
		<div className="overflow-x-auto">
			<div className="grid min-h-[430px] min-w-[760px] grid-cols-3 divide-x">
				{STATUS_COLUMNS.map((column) => {
					const columnTasks = tasks.filter((task) => task.status === column.id);
					return (
						<section key={column.id} className="bg-card/25 p-3 sm:p-4">
							<header className="mb-3 flex items-center gap-2 px-1">
								<StatusBadge status={column.id} />
								<span className="font-mono text-[10px] text-muted-foreground">
									{columnTasks.length}
								</span>
							</header>
							<div className="space-y-2">
								{columnTasks.map((task) => {
									const assignees = task.assigneeIds
										.map((id) => peopleById.get(id))
										.filter((name): name is string => Boolean(name));
									return (
										<button
											type="button"
											key={task.id}
											onClick={() => onSelect(task.id)}
											className={cn(
												"relative block w-full rounded-lg border bg-card px-3 py-3 text-left shadow-sm transition-[border-color,transform,box-shadow] duration-150 ease-out hover:-translate-y-px hover:border-foreground/20 hover:shadow-md active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none",
												task.sourceNoteId &&
													"border-l-2 border-l-[hsl(var(--project-purple)/0.8)]",
											)}
										>
											<span className="block text-sm leading-5">
												{task.title}
											</span>
											<div className="mt-3 flex items-center gap-2">
												<PriorityLabel priority={task.priority} />
												{task.dueDate ? (
													<time className="text-[10px] tabular-nums text-muted-foreground">
														{formatDueDate(task.dueDate)}
													</time>
												) : null}
												{assignees.length > 0 ? (
													<span className="ml-auto max-w-24 truncate text-[10px] text-muted-foreground">
														{assignees.join(", ")}
													</span>
												) : null}
											</div>
											{task.sourceNoteId ? (
												<div className="mt-3 border-t pt-2">
													<TaskSourceMarker />
												</div>
											) : null}
										</button>
									);
								})}
								{columnTasks.length === 0 ? (
									<div className="rounded-lg border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">
										No tasks
									</div>
								) : null}
							</div>
						</section>
					);
				})}
			</div>
		</div>
	);
}

function TaskTableView({
	tasks,
	people,
	onSelect,
	onPatch,
}: Omit<TaskInteractionProps, "onToggle"> & { tasks: Task[]; people: Person[] }) {
	const peopleById = useMemo(
		() => new Map(people.map((person) => [person.id, person.name])),
		[people],
	);

	if (tasks.length === 0) return <TaskViewEmpty isFiltered />;

	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[850px] border-collapse">
				<thead>
					<tr className="border-b bg-muted/20">
						<TableHeading>Task</TableHeading>
						<TableHeading>Status</TableHeading>
						<TableHeading>Priority</TableHeading>
						<TableHeading>Due</TableHeading>
						<TableHeading>Assignees</TableHeading>
						<TableHeading>Source</TableHeading>
					</tr>
				</thead>
				<tbody>
					{tasks.map((task) => {
						const assignees = task.assigneeIds
							.map((id) => peopleById.get(id))
							.filter((name): name is string => Boolean(name));
						return (
							<tr
								key={task.id}
								className={cn(
									"relative border-b last:border-b-0 hover:bg-muted/35",
									task.sourceNoteId &&
										"after:absolute after:inset-y-2 after:left-0 after:w-0.5 after:rounded-full after:bg-[hsl(var(--project-purple)/0.8)]",
								)}
							>
								<td className="max-w-[320px] px-3 py-2.5">
									<button
										type="button"
										onClick={() => onSelect(task.id)}
										className={cn(
											"block w-full truncate text-left text-sm hover:underline",
											task.status === "done" &&
												"text-muted-foreground line-through",
										)}
									>
										{task.title}
									</button>
								</td>
								<td className="px-2 py-2">
									<InlineSelect
										ariaLabel={`Status for ${task.title}`}
										value={task.status}
										onChange={(value) =>
											void onPatch(task.id, { status: value as TaskStatus })
										}
										options={STATUS_COLUMNS.map(({ id, label }) => ({
											value: id,
											label,
										}))}
									/>
								</td>
								<td className="px-2 py-2">
									<InlineSelect
										ariaLabel={`Priority for ${task.title}`}
										value={task.priority}
										onChange={(value) =>
											void onPatch(task.id, {
												priority: value as TaskPriority,
											})
										}
										options={PRIORITIES.map((priority) => ({
											value: priority,
											label: capitalize(priority),
										}))}
									/>
								</td>
								<td className="px-2 py-2">
									<input
										type="date"
										value={task.dueDate ?? ""}
										onChange={(event) =>
											void onPatch(task.id, {
												dueDate: event.target.value || undefined,
											})
										}
										aria-label={`Due date for ${task.title}`}
										className="h-8 w-[135px] rounded-md border border-transparent bg-transparent px-2 text-xs tabular-nums text-muted-foreground hover:border-border hover:bg-background focus:border-border focus:bg-background"
									/>
								</td>
								<td className="max-w-40 truncate px-3 py-2 text-xs text-muted-foreground">
									{assignees.length > 0 ? assignees.join(", ") : "—"}
								</td>
								<td className="px-3 py-2">
									{task.sourceNoteId ? (
										<TaskSourceMarker compact />
									) : (
										<span className="text-muted-foreground/45">—</span>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

function TaskCalendarView({
	tasks,
	month,
	onMonthChange,
	journalDates,
	selectedDate,
	onSelect,
	onShowDay,
}: {
	tasks: Task[];
	month: Date;
	onMonthChange: (month: Date) => void;
	journalDates: Set<string>;
	selectedDate: string | null;
	onSelect: (id: string) => void;
	onShowDay: (dateKey: string) => void;
}) {
	const today = useTodayKey();
	const first = new Date(month.getFullYear(), month.getMonth(), 1);
	const leading = (first.getDay() + 6) % 7;
	const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
	const tasksByDate = useMemo(() => {
		const grouped = new Map<string, Task[]>();
		for (const task of tasks) {
			if (!task.dueDate) continue;
			const items = grouped.get(task.dueDate) ?? [];
			items.push(task);
			grouped.set(task.dueDate, items);
		}
		return grouped;
	}, [tasks]);

	return (
		<div>
			<header className="flex items-center justify-between border-b px-3 py-2.5 sm:px-4">
				<button
					type="button"
					onClick={() =>
						onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))
					}
					className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="Previous month"
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
					className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="Next month"
				>
					<ChevronRight className="size-4" />
				</button>
			</header>
			<div className="overflow-x-auto">
				<div className="grid min-w-[760px] grid-cols-7">
					{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
						<div
							key={day}
							className="border-b border-r px-2 py-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground last:border-r-0"
						>
							{day}
						</div>
					))}
					{Array.from({ length: leading }, (_, index) => (
						<div
							key={`blank-${index}`}
							className="min-h-28 border-b border-r bg-muted/10 last:border-r-0"
						/>
					))}
					{Array.from({ length: days }, (_, index) => {
						const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
						const key = localDayKey(date);
						const dayTasks = tasksByDate.get(key) ?? [];
						const isToday = key === today;
						return (
							<div
								key={key}
								className={cn(
									"min-h-28 border-b border-r p-1.5 last:border-r-0",
									selectedDate === key && "bg-primary/5",
								)}
							>
								<div className="mb-1.5 flex items-center justify-between">
									<button
										type="button"
										onClick={() => onShowDay(key)}
										className={cn(
											"flex size-6 items-center justify-center rounded-full font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground",
											isToday &&
												"bg-primary text-primary-foreground hover:bg-primary",
										)}
										aria-label={`Show tasks due ${date.toLocaleDateString()}`}
									>
										{index + 1}
									</button>
									{journalDates.has(key) ? (
										<span
											className="size-1.5 rounded-full bg-sky-500"
											title="Journal entry"
										/>
									) : null}
								</div>
								<div className="space-y-1">
									{dayTasks.slice(0, 3).map((task) => (
										<button
											type="button"
											key={task.id}
											onClick={() => onSelect(task.id)}
											className={cn(
												"block w-full truncate rounded border-l-2 border-amber-500/70 bg-amber-500/10 px-1.5 py-1 text-left text-[10px] leading-4 hover:bg-amber-500/15",
												task.sourceNoteId &&
													"border-l-[hsl(var(--project-purple)/0.8)] bg-[hsl(var(--project-purple)/0.1)] hover:bg-[hsl(var(--project-purple)/0.15)]",
											)}
										>
											{task.title}
										</button>
									))}
									{dayTasks.length > 3 ? (
										<button
											type="button"
											onClick={() => onShowDay(key)}
											className="px-1 text-[10px] text-muted-foreground hover:text-foreground"
										>
											+{dayTasks.length - 3} more
										</button>
									) : null}
								</div>
							</div>
						);
					})}
				</div>
			</div>
			<footer className="flex items-center gap-4 border-t px-4 py-3 text-[10px] text-muted-foreground">
				<span className="flex items-center gap-1.5">
					<i className="size-1.5 rounded-full bg-amber-500" /> task
				</span>
				<span className="flex items-center gap-1.5">
					<i className="size-1.5 rounded-full bg-sky-500" /> journal
				</span>
				<span className="flex items-center gap-1.5">
					<i className="size-1.5 rounded-full bg-[hsl(var(--project-purple))]" /> from a
					note
				</span>
			</footer>
		</div>
	);
}

function TaskCheckbox({ task, onToggle }: { task: Task; onToggle: (task: Task) => void }) {
	return (
		<button
			type="button"
			onClick={() => onToggle(task)}
			className={cn(
				"flex size-5 shrink-0 items-center justify-center rounded border transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none",
				task.status === "done" && "border-emerald-500 bg-emerald-500 text-white",
			)}
			aria-label={
				task.status === "done" ? `Mark ${task.title} incomplete` : `Complete ${task.title}`
			}
		>
			{task.status === "done" ? <Check className="size-3.5" /> : null}
		</button>
	);
}

function TaskSourceMarker({ compact = false }: { compact?: boolean }) {
	return (
		<span className="mt-0.5 flex items-center gap-1 text-[10px] text-[hsl(var(--project-purple))]">
			<FileText className="size-3" />
			{compact ? "Note" : "From a note"}
		</span>
	);
}

function StatusBadge({ status }: { status: TaskStatus }) {
	const label = STATUS_COLUMNS.find((column) => column.id === status)?.label ?? status;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[9px] font-medium uppercase tracking-wide",
				status === "todo" && "bg-muted text-muted-foreground",
				status === "in_progress" && "bg-amber-500/12 text-amber-600 dark:text-amber-400",
				status === "done" && "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
			)}
		>
			<i className="size-1 rounded-full bg-current" />
			{label}
		</span>
	);
}

function PriorityLabel({ priority, className }: { priority: TaskPriority; className?: string }) {
	return (
		<span
			className={cn(
				"text-[10px] font-medium capitalize",
				priority === "urgent" && "text-destructive",
				priority === "high" && "text-amber-600 dark:text-amber-400",
				priority === "medium" && "text-sky-600 dark:text-sky-400",
				priority === "low" && "text-muted-foreground",
				className,
			)}
		>
			{priority}
		</span>
	);
}

function InlineSelect({
	ariaLabel,
	value,
	onChange,
	options,
}: {
	ariaLabel: string;
	value: string;
	onChange: (value: string) => void;
	options: Array<{ value: string; label: string }>;
}) {
	return (
		<select
			value={value}
			onChange={(event) => onChange(event.target.value)}
			aria-label={ariaLabel}
			className="h-8 rounded-md border border-transparent bg-transparent px-2 text-xs text-muted-foreground hover:border-border hover:bg-background focus:border-border focus:bg-background"
		>
			{options.map((option) => (
				<option key={option.value} value={option.value}>
					{option.label}
				</option>
			))}
		</select>
	);
}

function TableHeading({ children }: { children: React.ReactNode }) {
	return (
		<th className="h-9 px-3 text-left font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
			{children}
		</th>
	);
}

function TaskViewEmpty({ isFiltered }: { isFiltered: boolean }) {
	return (
		<div className="px-6 py-16 text-center">
			<Check className="mx-auto size-5 text-muted-foreground" />
			<h2 className="mt-3 text-sm font-medium">
				{isFiltered ? "No tasks match this view" : "No tasks yet"}
			</h2>
			<p className="mt-1 text-xs text-muted-foreground">
				{isFiltered
					? "Clear a filter or choose another view."
					: "Add your first task above."}
			</p>
		</div>
	);
}

function formatDueDate(value: string): string {
	const date = new Date(`${value}T12:00:00`);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

function useTodayKey(): string | null {
	const [today, setToday] = useState<string | null>(null);
	useEffect(() => {
		setToday(localDayKey(new Date()));
	}, []);
	return today;
}
