"use server";

import { getAuthenticatedUser } from "@/core/db";
import type { Task, TaskPriority, TaskStatus } from "./models";

type TaskRecord = Omit<Task, "dueDate" | "sourceNoteId" | "sourceBlockId"> & {
	dueDate: string | null;
	sourceNoteId: string | null;
	sourceBlockId: string | null;
};

function fromRecord(record: TaskRecord): Task {
	return {
		...record,
		dueDate: record.dueDate ?? undefined,
		sourceNoteId: record.sourceNoteId ?? undefined,
		sourceBlockId: record.sourceBlockId ?? undefined,
	};
}

export type CreateTaskInput = {
	title: string;
	status?: TaskStatus;
	priority?: TaskPriority;
	dueDate?: string | null;
	tags?: string[];
	assigneeIds?: string[];
	description?: string;
	sourceNoteId?: string;
	sourceBlockId?: string;
};

export type UpdateTaskInput = { id: string } & Partial<
	Omit<CreateTaskInput, "sourceNoteId" | "sourceBlockId">
>;

const TASK_SELECT = {
	id: true,
	title: true,
	status: true,
	priority: true,
	dueDate: true,
	tags: true,
	assigneeIds: true,
	description: true,
	sourceNoteId: true,
	sourceBlockId: true,
	createdAt: true,
	updatedAt: true,
} as const;

export async function listTasks(): Promise<Task[]> {
	const { prisma, user } = await getAuthenticatedUser();
	const records = await prisma.task.findMany({
		where: { userId: user.id },
		orderBy: { updatedAt: "desc" },
		select: TASK_SELECT,
	});
	return records.map((record) => fromRecord(record as TaskRecord));
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
	const { prisma, user } = await getAuthenticatedUser();
	const title = input.title.trim();
	if (!title) throw new Error("A task title is required");
	const { title: _inputTitle, ...data } = input;
	const record = await prisma.task.create({
		data: { userId: user.id, ...data, title },
		select: TASK_SELECT,
	});
	return fromRecord(record as TaskRecord);
}

export async function updateTask(input: UpdateTaskInput): Promise<Task | undefined> {
	const { prisma, user } = await getAuthenticatedUser();
	const { id, title, ...patch } = input;
	const result = await prisma.task.updateMany({
		where: { id, userId: user.id },
		data: { ...patch, ...(title === undefined ? {} : { title: title.trim() }) },
	});
	if (!result.count) return undefined;
	const record = await prisma.task.findUniqueOrThrow({ where: { id }, select: TASK_SELECT });
	return fromRecord(record as TaskRecord);
}

export async function deleteTask(id: string): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	await prisma.task.deleteMany({ where: { id, userId: user.id } });
}
