import type { Task } from "@/domain/tasks/models";

export function localDayKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function countOpenTasksByDueDate(tasks: Task[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const task of tasks) {
		if (task.status === "done" || !task.dueDate) continue;
		counts.set(task.dueDate, (counts.get(task.dueDate) ?? 0) + 1);
	}
	return counts;
}

export function tasksForDate(tasks: Task[], dateKey: string | null): Task[] {
	if (!dateKey) return tasks;
	return tasks.filter((task) => task.dueDate === dateKey);
}
