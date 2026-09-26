import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Task } from "@/domain/tasks/models";
import { TaskViewSwitcher, type TaskView } from "@/features/tasks/components/task-view-switcher";
import { TaskViewStage } from "@/features/tasks/components/task-views";

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "Publish the desktop sync guide",
		status: "in_progress",
		priority: "high",
		dueDate: "2026-07-21",
		tags: [],
		assigneeIds: [],
		description: "",
		sourceNoteId: "note-1",
		sourceBlockId: "block-1",
		createdAt: new Date("2026-07-18T10:00:00Z"),
		updatedAt: new Date("2026-07-18T10:00:00Z"),
		...overrides,
	};
}

const noop = () => undefined;
const noopPatch = () => Promise.resolve();

function renderStage(view: TaskView, tasks = [task()]): string {
	return renderToStaticMarkup(
		<TaskViewStage
			view={view}
			tasks={tasks}
			calendarTasks={tasks}
			people={[]}
			isFiltered
			month={new Date(2026, 6, 1)}
			onMonthChange={noop}
			journalDates={new Set(["2026-07-21"])}
			selectedDate={null}
			onSelect={noop}
			onToggle={noop}
			onPatch={noopPatch}
			onShowDay={noop}
		/>,
	);
}

describe("task views", () => {
	test("offers four interchangeable task views", () => {
		const html = renderToStaticMarkup(<TaskViewSwitcher view="list" onChange={noop} />);

		expect(html).toContain('role="group"');
		expect(html).toContain("List");
		expect(html).toContain("Board");
		expect(html).toContain("Table");
		expect(html).toContain("Calendar");
		expect(html).toContain('aria-pressed="true"');
	});

	test("keeps source-note context visible in list and board views", () => {
		const list = renderStage("list");
		const board = renderStage("board");

		expect(list).toContain("From a note");
		expect(board).toContain("From a note");
		expect(board).toContain("In progress");
	});

	test("renders spreadsheet-like inline controls in table view", () => {
		const html = renderStage("table");

		expect(html).toContain("Status for Publish the desktop sync guide");
		expect(html).toContain("Priority for Publish the desktop sync guide");
		expect(html).toContain("Due date for Publish the desktop sync guide");
		expect(html).toContain("Source");
	});

	test("places due tasks and journal dates in the calendar", () => {
		const html = renderStage("calendar");

		expect(html).toContain("July 2026");
		expect(html).toContain("Publish the desktop sync guide");
		expect(html).toContain("Journal entry");
	});
});
