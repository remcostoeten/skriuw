export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "urgent" | "high" | "medium" | "low";

export type Task = {
	id: string;
	title: string;
	status: TaskStatus;
	priority: TaskPriority;
	dueDate?: string;
	tags: string[];
	assigneeIds: string[];
	description: string;
	sourceNoteId?: string;
	sourceBlockId?: string;
	createdAt: Date;
	updatedAt: Date;
};
