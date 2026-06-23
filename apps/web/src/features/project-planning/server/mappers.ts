import type {
	CustomSection,
	CustomSectionItem,
	Feature,
	Issue,
	NiceToHave,
	ScratchEntry,
} from "../types";
import type {
	FeatureRow,
	IssueRow,
	NiceToHaveRow,
	PlanningSectionItemRow,
	PlanningSectionRow,
	ScratchEntryRow,
} from "./rows";

function toDay(iso: string): string {
	return iso.slice(0, 10);
}

export function mapIssue(row: IssueRow): Issue {
	return {
		id: row.id,
		featureId: row.feature_id,
		title: row.title,
		description: row.description,
		status: row.status,
		priority: row.priority,
		assignee: row.assignee ?? undefined,
		tags: row.tags ?? [],
		notes: row.notes ?? undefined,
		createdAt: toDay(row.created_at),
		updatedAt: toDay(row.updated_at),
	};
}

export function mapFeature(row: FeatureRow, issues: IssueRow[]): Feature {
	return {
		id: row.id,
		title: row.title,
		slug: row.slug,
		status: row.status,
		description: row.description,
		priority: row.priority,
		tags: row.tags ?? [],
		createdAt: toDay(row.created_at),
		updatedAt: toDay(row.updated_at),
		issues: issues
			.filter((i) => i.feature_id === row.id)
			.sort((a, b) => a.created_at.localeCompare(b.created_at))
			.map(mapIssue),
	};
}

export function mapNiceToHave(row: NiceToHaveRow): NiceToHave {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		reason: row.reason,
		priority: row.priority,
		createdAt: toDay(row.created_at),
	};
}

export function mapScratch(row: ScratchEntryRow): ScratchEntry {
	return {
		id: row.id,
		title: row.title,
		content: row.content,
		type: row.type,
		createdAt: toDay(row.created_at),
	};
}

export function mapCustomItem(row: PlanningSectionItemRow): CustomSectionItem {
	return {
		id: row.id,
		sectionId: row.section_id,
		title: row.title,
		content: row.content,
		priority: row.priority,
		tags: row.tags ?? [],
		createdAt: toDay(row.created_at),
		updatedAt: toDay(row.updated_at),
	};
}

export function mapCustomSection(
	row: PlanningSectionRow,
	items: PlanningSectionItemRow[],
): CustomSection {
	return {
		id: row.id,
		slug: row.slug,
		title: row.title,
		description: row.description,
		sortOrder: row.sort_order,
		createdAt: toDay(row.created_at),
		updatedAt: toDay(row.updated_at),
		items: items
			.filter((i) => i.section_id === row.id)
			.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
			.map(mapCustomItem),
	};
}
