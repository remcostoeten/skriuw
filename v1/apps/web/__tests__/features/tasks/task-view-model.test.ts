import { describe, expect, test } from "bun:test";
import type { Task } from "@/domain/tasks/models";
import {
	countOpenTasksByDueDate,
	localDayKey,
	tasksForDate,
} from "@/features/tasks/lib/task-view-model";

function task(overrides: Partial<Task>): Task {
	return {
		id: "task-1",
		title: "Task",
		status: "todo",
		priority: "medium",
		tags: [],
		assigneeIds: [],
		description: "",
		createdAt: new Date("2026-07-18T10:00:00Z"),
		updatedAt: new Date("2026-07-18T10:00:00Z"),
		...overrides,
	};
}

describe("task view model", () => {
	test("formats a calendar day from local date parts", () => {
		expect(localDayKey(new Date(2026, 0, 2, 23, 30))).toBe("2026-01-02");
	});

	test("counts only open tasks with due dates", () => {
		const counts = countOpenTasksByDueDate([
			task({ id: "1", dueDate: "2026-07-18" }),
			task({ id: "2", dueDate: "2026-07-18", status: "in_progress" }),
			task({ id: "3", dueDate: "2026-07-18", status: "done" }),
			task({ id: "4" }),
		]);
		expect(counts.get("2026-07-18")).toBe(2);
		expect(counts.size).toBe(1);
	});

	test("filters the list to the selected due date", () => {
		const tasks = [
			task({ id: "1", dueDate: "2026-07-18" }),
			task({ id: "2", dueDate: "2026-07-19" }),
		];
		expect(tasksForDate(tasks, "2026-07-19").map(({ id }) => id)).toEqual(["2"]);
		expect(tasksForDate(tasks, null)).toBe(tasks);
	});
});
