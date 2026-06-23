"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/features/admin/guards/require-admin";
import { prisma } from "@/lib/prisma";
import type {
	CustomSection,
	CustomSectionItem,
	Feature,
	FeatureStatus,
	Issue,
	IssueStatus,
	NiceToHave,
	Priority,
	ScratchEntry,
	ScratchType,
} from "../types";
import {
	mapCustomItem,
	mapCustomSection,
	mapFeature,
	mapIssue,
	mapNiceToHave,
	mapScratch,
} from "./mappers";
import type {
	FeatureRow,
	IssueRow,
	NiceToHaveRow,
	PlanningSectionItemRow,
	PlanningSectionRow,
	ScratchEntryRow,
} from "./rows";

const ROUTE = "/project-planning";

function slugify(input: string): string {
	return (
		input
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 64) || `topic-${Date.now()}`
	);
}

function isUniqueViolation(error: unknown): boolean {
	return (
		error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
	);
}

async function uniqueFeatureSlug(base: string): Promise<string> {
	let slug = slugify(base);
	let suffix = 1;
	while (true) {
		const existing = await prisma.planningFeature.findUnique({ where: { slug } });
		if (!existing) return slug;
		suffix += 1;
		slug = `${slugify(base)}-${suffix}`;
	}
}

async function uniqueSectionSlug(base: string): Promise<string> {
	let slug = slugify(base);
	let suffix = 1;
	while (true) {
		const existing = await prisma.planningSection.findUnique({ where: { slug } });
		if (!existing) return slug;
		suffix += 1;
		slug = `${slugify(base)}-${suffix}`;
	}
}

function toFeatureRow(f: {
	id: string;
	title: string;
	slug: string;
	description: string;
	status: string;
	priority: string;
	tags: string[];
	createdAt: Date;
	updatedAt: Date;
}): FeatureRow {
	return {
		id: f.id,
		title: f.title,
		slug: f.slug,
		description: f.description,
		status: f.status as FeatureRow["status"],
		priority: f.priority as FeatureRow["priority"],
		tags: f.tags,
		created_at: f.createdAt.toISOString(),
		updated_at: f.updatedAt.toISOString(),
	};
}

function toIssueRow(i: {
	id: string;
	featureId: string;
	title: string;
	description: string;
	status: string;
	priority: string;
	assignee: string | null;
	tags: string[];
	notes: string | null;
	createdAt: Date;
	updatedAt: Date;
}): IssueRow {
	return {
		id: i.id,
		feature_id: i.featureId,
		title: i.title,
		description: i.description,
		status: i.status as IssueRow["status"],
		priority: i.priority as IssueRow["priority"],
		assignee: i.assignee,
		tags: i.tags,
		notes: i.notes,
		created_at: i.createdAt.toISOString(),
		updated_at: i.updatedAt.toISOString(),
	};
}

function toNiceRow(n: {
	id: string;
	title: string;
	description: string;
	reason: string;
	priority: string;
	createdAt: Date;
}): NiceToHaveRow {
	return {
		id: n.id,
		title: n.title,
		description: n.description,
		reason: n.reason,
		priority: n.priority as NiceToHaveRow["priority"],
		created_at: n.createdAt.toISOString(),
	};
}

function toScratchRow(s: {
	id: string;
	title: string;
	content: string;
	type: string;
	createdAt: Date;
}): ScratchEntryRow {
	return {
		id: s.id,
		title: s.title,
		content: s.content,
		type: s.type as ScratchEntryRow["type"],
		created_at: s.createdAt.toISOString(),
	};
}

function toSectionRow(s: {
	id: string;
	slug: string;
	title: string;
	description: string;
	sortOrder: number;
	createdAt: Date;
	updatedAt: Date;
}): PlanningSectionRow {
	return {
		id: s.id,
		slug: s.slug,
		title: s.title,
		description: s.description,
		sort_order: s.sortOrder,
		created_at: s.createdAt.toISOString(),
		updated_at: s.updatedAt.toISOString(),
	};
}

function toSectionItemRow(i: {
	id: string;
	sectionId: string;
	title: string;
	content: string;
	priority: string | null;
	tags: string[];
	sortOrder: number;
	createdAt: Date;
	updatedAt: Date;
}): PlanningSectionItemRow {
	return {
		id: i.id,
		section_id: i.sectionId,
		title: i.title,
		content: i.content,
		priority: i.priority as PlanningSectionItemRow["priority"],
		tags: i.tags,
		sort_order: i.sortOrder,
		created_at: i.createdAt.toISOString(),
		updated_at: i.updatedAt.toISOString(),
	};
}

// Feature actions ----------------------------------------------------------

export type FeatureDraft = {
	title: string;
	description?: string;
	status?: FeatureStatus;
	priority?: Priority;
	tags?: string[];
};

export async function createFeature(draft: FeatureDraft): Promise<Feature> {
	const { user } = await requireAdmin();
	const title = draft.title.trim() || "New topic";

	for (let attempt = 0; attempt < 3; attempt += 1) {
		const slug = await uniqueFeatureSlug(title);
		try {
			const record = await prisma.planningFeature.create({
				data: {
					title,
					slug,
					description: draft.description ?? "",
					status: draft.status ?? "exploring",
					priority: draft.priority ?? "medium",
					tags: draft.tags ?? [],
					createdBy: user.id,
				},
			});
			revalidatePath(ROUTE);
			return mapFeature(toFeatureRow(record), []);
		} catch (error) {
			if (!isUniqueViolation(error) || attempt === 2) throw error;
		}
	}
	throw new Error("Could not create feature");
}

export type FeaturePatch = Partial<{
	title: string;
	description: string;
	status: FeatureStatus;
	priority: Priority;
	tags: string[];
}>;

export async function updateFeature(id: string, patch: FeaturePatch): Promise<void> {
	await requireAdmin();
	await prisma.planningFeature.update({ where: { id }, data: patch });
	revalidatePath(ROUTE);
}

export async function updateFeatureStatus(id: string, status: FeatureStatus): Promise<void> {
	return updateFeature(id, { status });
}

export async function deleteFeature(id: string): Promise<void> {
	await requireAdmin();
	// PlanningIssue.feature is configured with onDelete: Cascade, so deleting a
	// feature intentionally removes its linked issues as part of the same action.
	await prisma.planningFeature.delete({ where: { id } });
	revalidatePath(ROUTE);
}

// Issue actions ------------------------------------------------------------

export type IssueDraftInput = {
	title: string;
	description?: string;
	status?: IssueStatus;
	priority?: Priority;
	assignee?: string;
	tags?: string[];
	notes?: string;
};

export async function createIssue(featureId: string, draft: IssueDraftInput): Promise<Issue> {
	await requireAdmin();
	const record = await prisma.planningIssue.create({
		data: {
			featureId,
			title: draft.title.trim(),
			description: draft.description ?? "",
			status: draft.status ?? "todo",
			priority: draft.priority ?? "medium",
			assignee: draft.assignee?.trim() || null,
			tags: draft.tags ?? [],
			notes: draft.notes?.trim() || null,
		},
	});
	revalidatePath(ROUTE);
	return mapIssue(toIssueRow(record));
}

export type IssuePatch = Partial<{
	title: string;
	description: string;
	status: IssueStatus;
	priority: Priority;
	assignee: string | null;
	tags: string[];
	notes: string | null;
}>;

export async function updateIssue(id: string, patch: IssuePatch): Promise<void> {
	await requireAdmin();
	await prisma.planningIssue.update({ where: { id }, data: patch });
	revalidatePath(ROUTE);
}

export async function deleteIssue(id: string): Promise<void> {
	await requireAdmin();
	await prisma.planningIssue.delete({ where: { id } });
	revalidatePath(ROUTE);
}

// Nice-to-have actions -----------------------------------------------------

export type NiceDraftInput = {
	title: string;
	description?: string;
	reason?: string;
	priority?: Priority;
};

export async function createNiceToHave(draft: NiceDraftInput): Promise<NiceToHave> {
	await requireAdmin();
	const record = await prisma.planningNiceToHave.create({
		data: {
			title: draft.title.trim(),
			description: draft.description ?? "",
			reason: draft.reason ?? "",
			priority: draft.priority ?? "medium",
		},
	});
	revalidatePath(ROUTE);
	return mapNiceToHave(toNiceRow(record));
}

export type NicePatch = Partial<{
	title: string;
	description: string;
	reason: string;
	priority: Priority;
}>;

export async function updateNiceToHave(id: string, patch: NicePatch): Promise<void> {
	await requireAdmin();
	await prisma.planningNiceToHave.update({ where: { id }, data: patch });
	revalidatePath(ROUTE);
}

export async function deleteNiceToHave(id: string): Promise<void> {
	await requireAdmin();
	await prisma.planningNiceToHave.delete({ where: { id } });
	revalidatePath(ROUTE);
}

// Scratch actions ----------------------------------------------------------

export type ScratchDraftInput = {
	title: string;
	content?: string;
	type?: ScratchType;
};

export async function createScratch(draft: ScratchDraftInput): Promise<ScratchEntry> {
	await requireAdmin();
	const record = await prisma.planningScratchEntry.create({
		data: {
			title: draft.title.trim(),
			content: draft.content ?? "",
			type: draft.type ?? "note",
		},
	});
	revalidatePath(ROUTE);
	return mapScratch(toScratchRow(record));
}

export type ScratchPatch = Partial<{
	title: string;
	content: string;
	type: ScratchType;
}>;

export async function updateScratch(id: string, patch: ScratchPatch): Promise<void> {
	await requireAdmin();
	await prisma.planningScratchEntry.update({ where: { id }, data: patch });
	revalidatePath(ROUTE);
}

export async function deleteScratch(id: string): Promise<void> {
	await requireAdmin();
	await prisma.planningScratchEntry.delete({ where: { id } });
	revalidatePath(ROUTE);
}

// Cross-section moves ------------------------------------------------------

export async function moveFeature(id: string, to: "nice" | "scratch"): Promise<void> {
	await requireAdmin();

	await prisma.$transaction(async (tx) => {
		const feature = await tx.planningFeature.findUnique({ where: { id } });
		if (!feature) throw new Error("Feature not found");
		const issueCount = await tx.planningIssue.count({ where: { featureId: id } });
		if (issueCount > 0) {
			throw new Error("Cannot move feature while issues still exist");
		}

		if (to === "nice") {
			await tx.planningNiceToHave.create({
				data: {
					title: feature.title,
					description: feature.description,
					reason: "",
					priority: feature.priority,
				},
			});
		} else {
			await tx.planningScratchEntry.create({
				data: {
					title: feature.title,
					content: feature.description,
					type: "note",
				},
			});
		}

		await tx.planningFeature.delete({ where: { id } });
	});

	revalidatePath(ROUTE);
}

export async function moveNiceToHave(id: string, to: "roadmap" | "scratch"): Promise<void> {
	await requireAdmin();
	const nice = await prisma.planningNiceToHave.findUnique({ where: { id } });
	if (!nice) throw new Error("Nice-to-have not found");

	if (to === "scratch") {
		await prisma.$transaction([
			prisma.planningScratchEntry.create({
				data: {
					title: nice.title,
					content: [nice.description, nice.reason].filter(Boolean).join("\n\n").trim(),
					type: "note",
				},
			}),
			prisma.planningNiceToHave.delete({ where: { id } }),
		]);
		revalidatePath(ROUTE);
		return;
	}

	for (let attempt = 0; attempt < 3; attempt += 1) {
		const newSlug = await uniqueFeatureSlug(nice.title);
		try {
			await prisma.$transaction([
				prisma.planningFeature.create({
					data: {
						title: nice.title,
						slug: newSlug,
						description: nice.description,
						status: "exploring",
						priority: nice.priority,
						tags: [],
					},
				}),
				prisma.planningNiceToHave.delete({ where: { id } }),
			]);
			revalidatePath(ROUTE);
			return;
		} catch (error) {
			if (!isUniqueViolation(error) || attempt === 2) throw error;
		}
	}
	throw new Error("Could not move nice-to-have");
}

export async function moveScratch(id: string, to: "roadmap" | "nice"): Promise<void> {
	await requireAdmin();
	const entry = await prisma.planningScratchEntry.findUnique({ where: { id } });
	if (!entry) throw new Error("Scratch entry not found");

	if (to === "nice") {
		await prisma.$transaction([
			prisma.planningNiceToHave.create({
				data: {
					title: entry.title,
					description: entry.content,
					reason: "",
					priority: "medium",
				},
			}),
			prisma.planningScratchEntry.delete({ where: { id } }),
		]);
		revalidatePath(ROUTE);
		return;
	}

	for (let attempt = 0; attempt < 3; attempt += 1) {
		const newSlug = await uniqueFeatureSlug(entry.title);
		try {
			await prisma.$transaction([
				prisma.planningFeature.create({
					data: {
						title: entry.title,
						slug: newSlug,
						description: entry.content,
						status: "exploring",
						priority: "medium",
						tags: [],
					},
				}),
				prisma.planningScratchEntry.delete({ where: { id } }),
			]);
			revalidatePath(ROUTE);
			return;
		} catch (error) {
			if (!isUniqueViolation(error) || attempt === 2) throw error;
		}
	}
	throw new Error("Could not move scratch entry");
}

// Custom section actions ---------------------------------------------------

export type SectionDraft = {
	title: string;
	description?: string;
};

export async function createCustomSection(draft: SectionDraft): Promise<CustomSection> {
	await requireAdmin();
	const last = await prisma.planningSection.findFirst({
		orderBy: { sortOrder: "desc" },
		select: { sortOrder: true },
	});
	const nextOrder = (last?.sortOrder ?? -1) + 1;
	const title = draft.title.trim() || "Untitled section";

	for (let attempt = 0; attempt < 3; attempt += 1) {
		const slug = await uniqueSectionSlug(title);
		try {
			const record = await prisma.planningSection.create({
				data: {
					slug,
					title,
					description: draft.description ?? "",
					sortOrder: nextOrder,
				},
			});
			revalidatePath(ROUTE);
			return mapCustomSection(toSectionRow(record), []);
		} catch (error) {
			if (!isUniqueViolation(error) || attempt === 2) throw error;
		}
	}
	throw new Error("Could not create custom section");
}

export type SectionPatch = Partial<{
	title: string;
	description: string;
	sort_order: number;
}>;

export async function updateCustomSection(id: string, patch: SectionPatch): Promise<void> {
	await requireAdmin();
	const data: { title?: string; description?: string; sortOrder?: number } = {};
	if (patch.title !== undefined) data.title = patch.title;
	if (patch.description !== undefined) data.description = patch.description;
	if (patch.sort_order !== undefined) data.sortOrder = patch.sort_order;
	await prisma.planningSection.update({ where: { id }, data });
	revalidatePath(ROUTE);
}

export async function deleteCustomSection(id: string): Promise<void> {
	await requireAdmin();
	await prisma.planningSection.delete({ where: { id } });
	revalidatePath(ROUTE);
}

export type SectionItemDraft = {
	title: string;
	content?: string;
	priority?: Priority | null;
	tags?: string[];
};

export async function createCustomItem(
	sectionId: string,
	draft: SectionItemDraft,
): Promise<CustomSectionItem> {
	await requireAdmin();
	const record = await prisma.planningSectionItem.create({
		data: {
			sectionId,
			title: draft.title.trim() || "Untitled",
			content: draft.content ?? "",
			priority: draft.priority ?? null,
			tags: draft.tags ?? [],
		},
	});
	revalidatePath(ROUTE);
	return mapCustomItem(toSectionItemRow(record));
}

export type SectionItemPatch = Partial<{
	title: string;
	content: string;
	priority: Priority | null;
	tags: string[];
}>;

export async function updateCustomItem(id: string, patch: SectionItemPatch): Promise<void> {
	await requireAdmin();
	await prisma.planningSectionItem.update({ where: { id }, data: patch });
	revalidatePath(ROUTE);
}

export async function deleteCustomItem(id: string): Promise<void> {
	await requireAdmin();
	await prisma.planningSectionItem.delete({ where: { id } });
	revalidatePath(ROUTE);
}
